-- =====================================================================
-- Sign-up and the checks the sign-up and onboarding flows make before creating anything.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auth trigger: new user signup
-- Runs on INSERT into auth.users. Redeems an invitation, OR creates a
-- fresh org + membership + subscription for a new primary admin.
--
-- SECURITY — this function must never derive org_id, role or project_id
-- from `raw_user_meta_data`. That field is whatever the caller passed to
-- signUp({ options: { data } }); it is an INPUT, not a claim the backend
-- made. The previous version read all three from it, so anyone could
-- register with { org_id: <any org>, role: 'admin' } and land inside
-- another tenant with full RLS rights — every policy in schemas/policies
-- keys off `memberships`, so forging one membership row inherits the lot.
--
-- The only field trusted here is `invite_token`, and it is trusted as a
-- BEARER SECRET rather than an assertion: holding it is the proof. Org,
-- role and project are read off the `public.invitations` row a primary
-- admin, admin or manager created. See `schemas/tables/15_invitations.sql`.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_user_id     uuid := new.id;
  v_plan_id     uuid;
  v_token       text := nullif(new.raw_user_meta_data->>'invite_token', '');
  v_user_name   text := new.raw_user_meta_data->>'user_name';
  v_invite      public.invitations%rowtype;
  v_org_name    text;
  v_slug        text;
begin
  IF COALESCE(NEW.raw_user_meta_data->>'seed_user', 'false') = 'true' THEN
    RETURN NEW;
  END IF;
  insert into public.profiles (id, full_name)
  values (v_user_id, v_user_name);

  if v_token is not null then
    -- ---- Invited user path ------------------------------------------------
    -- `digest` comes from pgcrypto, installed into the extensions schema, so it
    -- must be qualified: search_path is '' and nothing but pg_catalog resolves.
    --
    -- FOR UPDATE locks the row for this transaction, so two signups racing on the
    -- same token cannot both redeem it — the second blocks, then fails the
    -- accepted_at check below.
    select * into v_invite
      from public.invitations
     where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
       for update;

    -- Every branch fails CLOSED. This trigger is AFTER INSERT on auth.users, so a
    -- raise rolls the whole signup back and no account is created.
    if not found then
      raise exception 'Invalid invitation token' using errcode = '22023';
    end if;

    if v_invite.accepted_at is not null then
      raise exception 'This invitation has already been used' using errcode = '22023';
    end if;

    if v_invite.expires_at <= now() then
      raise exception 'This invitation has expired' using errcode = '22023';
    end if;

    -- Binds the token to one address, so a forwarded or intercepted link cannot be
    -- redeemed by a different account.
    if lower(v_invite.email) <> lower(coalesce(new.email, '')) then
      raise exception 'This invitation was issued to a different email address'
        using errcode = '22023';
    end if;

    -- org_id and role come from the INVITATION, never from the payload. No text cast
    -- either: v_invite.role is already public.user_role, and the table's check
    -- constraint forbids 'primary_admin'. 'manager' IS invitable.
    insert into public.memberships (user_id, org_id, role, job_title)
    values (v_user_id, v_invite.org_id, v_invite.role, v_invite.job_title);

    if v_invite.role = 'client' then
      -- The composite FK on invitations already guarantees this project belongs to
      -- v_invite.org_id, so there is no way to point a client at another org's work.
      update public.projects
         set client_id = v_user_id
       where id = v_invite.project_id;
    end if;

    update public.invitations
       set accepted_at = now(),
           accepted_by = v_user_id
     where id = v_invite.id;

  else
    -- ---- New primary-admin path ------------------------------------------
    -- org_name and slug are user-supplied, and that is safe: this user is creating
    -- their OWN new organisation and becoming its primary admin. There is no existing tenant
    -- to escalate into. Contrast the invited path above, where org and role must come
    -- from an invitation precisely because they name someone else's tenant.
    --
    -- They are VALIDATED, though. `organizations.name` and `slug` are NOT NULL, but a
    -- constraint violation here surfaces as an opaque 500 from the auth endpoint; these
    -- checks fail with a message the wizard can show. Signup rolls back either way —
    -- this is an AFTER INSERT trigger on auth.users.
    v_org_name := nullif(trim(new.raw_user_meta_data->>'org_name'), '');
    v_slug     := lower(nullif(trim(new.raw_user_meta_data->>'slug'), ''));

    if v_org_name is null then
      raise exception 'An organisation name is required' using errcode = '22023';
    end if;

    if v_slug is null then
      raise exception 'A workspace URL is required' using errcode = '22023';
    end if;

    -- Checked explicitly so a taken slug reads as a taken slug rather than as
    -- "organizations_slug_key violated". `is_slug_available` is the same function the
    -- wizard calls on step 1; this is the authoritative re-check at write time, since
    -- anything can change between the two.
    if not public.is_slug_available(v_slug) then
      raise exception 'That workspace URL is already taken' using errcode = '22023';
    end if;

    -- The subscription every new workspace starts on, before any plan is chosen.
    -- 'Free' must therefore always exist as an active row — see
    -- migrations/20260807150000_reseed_design_plans.sql, which keeps it for this reason.
    select id into v_plan_id
      from public.plans
     where name = 'Free'
     limit 1;

    insert into public.organizations (name, slug, user_id)
    values (v_org_name, v_slug, v_user_id)
    returning id into v_org_id;

    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_org_id, 'primary_admin');

    insert into public.subscriptions (plan_id, org_id)
    values (v_plan_id, v_org_id);
  end if;

  return new;
end;
$$;

-- `public.handle_new_user_membership` was DROPPED here, deliberately.
--
-- It carried the same flaw as the function above — inserting a membership from
-- `raw_user_meta_data->>'org_id'` and `->>'role'` — and then copied both into
-- `raw_app_meta_data`, the field applications normally treat as trustworthy because
-- users cannot write it. Nothing referenced it (`auth_trigger.sql` points at
-- handle_new_user_signup), but it was a live SECURITY DEFINER function, so wiring it
-- up would have been a one-line privilege escalation. Removing it from this file is
-- what makes `supabase db diff` emit the DROP.

-- ---------------------------------------------------------------------
-- Workspace URL availability
--
-- The onboard wizard asks for a workspace slug on step 1 and cannot
-- validate it: `organizations` has no anon SELECT policy (and no INSERT
-- policy at all — only the signup trigger creates orgs), so a signed-out
-- visitor cannot see whether a slug is taken. Without this the user fills
-- all four steps, presses Launch, and gets a raw unique-violation on
-- `organizations_slug_key` as a 500 at the very last moment.
--
-- SECURITY DEFINER so it can see past RLS, but it returns ONLY a boolean.
-- It never exposes which org holds a slug, or that any org exists — the
-- caller learns exactly one bit, which is the minimum the form needs.
-- ---------------------------------------------------------------------
create or replace function public.is_slug_available(candidate text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.organizations
    where lower(slug) = lower(trim(candidate))
  );
$$;

-- Signed-out visitors are the ones filling this form, so anon needs it too.
grant execute on function public.is_slug_available(text) to anon, authenticated;

create or replace function public.check_email_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server-only (invite flows, via the service-role key). Checked HERE, not only by
  -- grant: open to anon it let anyone with the public key test unlimited addresses to
  -- find who has an account (RISK-021).
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Reject malformed inputs immediately
  if p_email is null or length(p_email) < 3 or position('@' in p_email) = 0 then
    raise exception 'Invalid email format' using errcode = '22023';
  end if;

  return exists (
    select 1 
    from auth.users 
    where lower(email) = lower(trim(p_email))
  );
end;
$$;

revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
grant  execute on function public.check_email_exists(text) to service_role;
