SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.current_user_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select org_id from public.memberships
  where user_id = auth.uid() and status
    and public.mfa_satisfied();
$function$;
CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id uuid, allowed_roles public.user_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id  = target_org_id
      and role    = any(allowed_roles)
      and status
  ) and public.mfa_satisfied();
$function$;
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id and status
  ) and public.mfa_satisfied();
$function$;
CREATE OR REPLACE FUNCTION public.list_my_sessions()
 RETURNS TABLE(session_id uuid, user_agent text, city text, country text, created_at timestamp with time zone, last_seen_at timestamp with time zone, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE FUNCTION public.mfa_satisfied()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$function$;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO anon;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO authenticated;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO service_role;
CREATE OR REPLACE FUNCTION public.revoke_my_session(target_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.submit_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Two-factor: an aal1 session of a user with 2FA may not act (see mfa_satisfied).
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.time_entries
    where id = entry_id
      and user_id = auth.uid()
      and status = 'draft'
  ) then
    update public.time_entries
       set status = 'submitted'
     where id = entry_id;
  else
    raise exception 'Not authorized or entry is not in draft state';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.touch_my_session(p_user_agent text, p_city text, p_country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.update_delivery_status(p_status public.delivery_status, p_delivery_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Two-factor: an aal1 session of a user with 2FA may not act (see mfa_satisfied).
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;

  -- The caller must be the client OF THIS PROJECT, not merely a client somewhere in the
  -- org. The previous test was `memberships.role = 'client'` for the delivery's org, which
  -- let any one of an agency's clients change the status of every other client's
  --   — the write-side twin of the read leak fixed in `06_rls_deliveries`.
  -- Scoping the SELECT alone would have left this open, since a caller only needs the id.
  --
  -- `p_project_id` is now actually used: it was accepted and ignored, so a caller could
  -- pass anything. Requiring it to match the delivery's own project makes a mismatched
  -- pair fail instead of silently succeeding.
  update public.deliveries
     set status      = p_status,
         approved_at = case when p_status = 'approved' then now() else null end
   where id = p_delivery_id
     and deliveries.project_id = p_project_id
     and exists (
       select 1 from public.projects p
       where p.id        = deliveries.project_id
         and p.client_id = auth.uid()
     );

  if not found then
    raise exception 'Not authorized to update this delivery';
  end if;
end;
$function$;
CREATE POLICY require_mfa_when_enrolled ON public.activity_events AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.clients AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.deliveries AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.delivery_assets AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.invitations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.invoice_lines AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.invoices AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.memberships AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.milestones AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.organizations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.plans AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.profiles AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.project_allocations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.projects AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.subscriptions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.time_entries AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.updates AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY require_mfa_when_enrolled ON public.user_sessions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
