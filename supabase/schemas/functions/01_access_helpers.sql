-- =====================================================================
-- Access helpers used by policies and every other function: workspace membership, roles and MFA.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RLS helpers
-- These run as postgres (SECURITY DEFINER), bypassing RLS on memberships
-- when called from within a memberships policy. This prevents infinite
-- recursion.
-- ---------------------------------------------------------------------

-- `status` is filtered in all three. Every policy in schemas/policies keys off one of
-- these, so a deactivated membership stops granting access everywhere at once rather
-- than each policy having to remember the check.
-- ---------------------------------------------------------------------
-- Two-factor gate for the database
--
-- True when this request may act on data: the session passed the code
-- (`aal2`), or the user has no verified authenticator at all. False only
-- for an aal1 session of a user WITH 2FA — someone holding the password
-- but not the phone, who could otherwise skip the app's code page and
-- call the API directly with the public anon key.
--
-- Used three ways: the restrictive `require_mfa_when_enrolled` policy on
-- every table, the membership helpers below (so every RPC that authorises
-- through them is covered), and an explicit guard in the few definer
-- functions that only check auth.uid().
--
-- SECURITY DEFINER because auth.mfa_factors is not readable by the API
-- roles. No uid (anon, service_role) → no factors → true.
-- ---------------------------------------------------------------------
create or replace function public.mfa_satisfied()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

create or replace function public.current_user_orgs()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.memberships
  where user_id = auth.uid() and status
    and public.mfa_satisfied();
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id and status
  ) and public.mfa_satisfied();
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.user_role[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id  = target_org_id
      and role    = any(allowed_roles)
      and status
  ) and public.mfa_satisfied();
$$;
