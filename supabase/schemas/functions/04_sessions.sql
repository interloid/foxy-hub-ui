-- =====================================================================
-- The signed-in sessions list and signing sessions out.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Revoke every session a user holds (called when they are deactivated)
-- ---------------------------------------------------------------------

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server-only (deactivation, via the service-role key). Checked HERE, not only by
  -- grant: grants.sql grants every routine to anon/authenticated, which silently undid the
  -- revoke below and let anyone with the public anon key sign any user out everywhere.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'A user id is required' using errcode = '22023';
  end if;

  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.revoke_user_sessions(uuid) to service_role;

-- =====================================================================
-- Devices — Settings → Security
--
-- All three are SECURITY DEFINER because auth.sessions is owned by
-- supabase_auth_admin and not exposed to the API roles. Each one scopes
-- itself to `auth.uid()`, and "this device" is the `session_id` claim of
-- the caller's own access token.
-- =====================================================================

-- Records or refreshes this session's device details. Called by proxy.ts
-- at most every few minutes; the `last_seen_at` guard keeps a burst of
-- requests from rewriting the row on every one.
create or replace function public.touch_my_session(
  p_user_agent text,
  p_city       text,
  p_country    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_user_id is null or v_session_id is null or not public.mfa_satisfied() then
    return;
  end if;

  -- The session must really be the caller's; the FK alone would accept any id.
  if not exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.user_sessions (session_id, user_id, user_agent, city, country)
  values (
    v_session_id,
    v_user_id,
    left(nullif(trim(p_user_agent), ''), 512),
    left(nullif(trim(p_city), ''), 120),
    left(nullif(trim(p_country), ''), 2)
  )
  on conflict (session_id) do update
     set user_agent   = coalesce(excluded.user_agent, public.user_sessions.user_agent),
         city         = coalesce(excluded.city, public.user_sessions.city),
         country      = coalesce(excluded.country, public.user_sessions.country),
         last_seen_at = now()
   where public.user_sessions.last_seen_at < now() - interval '2 minutes';
end;
$$;

-- Every live session of the caller, newest activity first. Starts from
-- auth.sessions (the source of truth) so sessions with no recorded
-- details — signed in before this shipped — still appear.
create or replace function public.list_my_sessions()
returns table (
  session_id   uuid,
  user_agent   text,
  city         text,
  country      text,
  created_at   timestamptz,
  last_seen_at timestamptz,
  is_current   boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    s.id,
    u.user_agent,
    u.city,
    u.country,
    s.created_at,
    greatest(
      u.last_seen_at,
      s.refreshed_at at time zone 'utc',
      s.updated_at,
      s.created_at
    ) as last_seen_at,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  left join public.user_sessions u on u.session_id = s.id
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
    and public.mfa_satisfied()
  order by is_current desc, last_seen_at desc;
$$;

-- Signs ONE other device out. Deleting the auth.sessions row cascades to
-- its refresh tokens (it can never renew) and to its user_sessions row.
-- The current session is refused — that is what the normal sign-out is for.
create or replace function public.revoke_my_session(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Two-factor: an aal1 session of a user with 2FA may not act (see mfa_satisfied).
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;

  if target_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid then
    raise exception 'Use sign out for this device' using errcode = '22023';
  end if;

  delete from auth.sessions
   where id = target_session_id
     and user_id = v_user_id;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
end;
$$;
