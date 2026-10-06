-- =====================================================================
-- Memberships: rates, details, the primary admin hand-over, and the rules a policy cannot express.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Membership: set a person's standard rates
-- ---------------------------------------------------------------------
--
-- SECURITY DEFINER for two reasons the row policy cannot express:
--
--   1. `owners_admins_update_member_role` gates EVERY update on `role <> 'primary_admin'`. That is
--      right for role edits — an admin must not demote the primary admin — but it also means
--      the primary admin's own rates could never be set through the API, and in a small agency
--      they are usually the most billable person in it.
--   2. It confines the write to the two rate columns. The general update policy allows any
--      column, so an endpoint built on it would be one typo away from editing roles.
--
-- Nulls are meaningful and are written through: clearing a rate is how you say "unset", which
-- is not the same as zero.
--
-- Who sets what: the bill rate (`default_rate`) - the primary admin or an admin. The cost rate
-- - the primary admin only. For an admin, `new_cost_rate` is ignored and the cost rate is left
-- exactly as it was, so a bill-rate edit can never clear or overwrite it.
-- `guard_membership_update` enforces the same rule on every update, this function included.
create or replace function public.set_member_rates(
  target_user_id   uuid,
  target_org_id    uuid,
  new_default_rate numeric default null,
  new_cost_rate    numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_primary boolean;
begin
  if not public.has_org_role(target_org_id, array['primary_admin', 'admin']::public.user_role[]) then
    raise exception 'Not authorized to set rates for this organization' using errcode = '42501';
  end if;

  v_is_primary := public.has_org_role(target_org_id, array['primary_admin']::public.user_role[]);

  update public.memberships
     set default_rate = new_default_rate,
         cost_rate    = case when v_is_primary then new_cost_rate else cost_rate end
   where user_id = target_user_id
     and org_id  = target_org_id;

  if not found then
    raise exception 'No membership found for that user in this organization';
  end if;
end;
$$;

-- Role authorization happens inside the function, as with the other definers above.
grant execute on function public.set_member_rates(uuid, uuid, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Hand the primary_admin role to another admin
--
-- SECURITY DEFINER because the row policy makes this impossible from the API by design:
-- `owners_admins_update_member_role` carries `role <> 'primary_admin'` in BOTH its USING
-- and WITH CHECK, so neither half of the swap can run through it — demoting the current
-- primary admin fails the USING, promoting the new one fails the WITH CHECK. That policy
-- is right: it stops an admin quietly promoting themselves. Transferring is a different
-- act, and this is the only door for it.
--
-- Both writes happen in one statement pair inside one transaction, so the partial unique
-- index `memberships_one_primary_admin_per_org` never sees two holders. The order matters:
-- demote first, then promote. The reverse would collide with the index.
--
-- `organizations.user_id` moves too. It is the column `org_owner_can_update` keys on, so
-- leaving it behind would hand the outgoing primary admin the workspace settings and
-- lock the incoming one out of them — the role would transfer in name only.
-- ---------------------------------------------------------------------
create or replace function public.transfer_primary_admin(target_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id  uuid;
  v_user_id uuid;
  v_role    public.user_role;
  v_status  boolean;
begin
  select org_id, user_id, role, status
    into v_org_id, v_user_id, v_role, v_status
    from public.memberships
   where id = target_membership_id;

  if v_org_id is null then
    raise exception 'Membership not found' using errcode = '42501';
  end if;

  -- Only the sitting primary admin may hand it over. An admin cannot take it.
  if not public.has_org_role(v_org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can transfer this role' using errcode = '42501';
  end if;

  if v_role = 'primary_admin' then
    raise exception 'They are already the primary admin' using errcode = '22023';
  end if;

  -- Admins only. A contributor or manager being handed billing and ownership in one
  -- click is a mis-click, not a decision; promote them to admin first.
  if v_role <> 'admin' then
    raise exception 'Only an admin can be made primary admin' using errcode = '22023';
  end if;

  if not v_status then
    raise exception 'Reactivate them before handing over the primary admin role'
      using errcode = '22023';
  end if;

  update public.memberships
     set role = 'admin'
   where org_id = v_org_id and role = 'primary_admin';

  update public.memberships
     set role = 'primary_admin'
   where id = target_membership_id;

  update public.organizations
     set user_id = v_user_id
   where id = v_org_id;
end;
$$;

grant execute on function public.transfer_primary_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Edit a teammate's name, role and job title in one call
--
-- SECURITY DEFINER for ONE reason: `profiles.full_name`. `13_rls_profiles` allows
-- `own_update_profile` only — id = auth.uid() — so an admin cannot rename anybody but
-- themselves through the API. Role and job_title would both go through the normal
-- membership policy; the name is what forces a definer.
--
-- WORTH KNOWING: `profiles` is GLOBAL identity, not per-organization. Renaming someone
-- here changes their name in every workspace they belong to. That is the existing shape
-- of the table, not a decision made here — `job_title` sits on `memberships` precisely so
-- it does not behave this way.
--
-- NULL (or leaving the argument out) means different things per argument (RISK-025):
--   new_full_name — keep the current name
--   new_job_title — clear the job title
--   new_role      — required; the default exists only because Postgres allows no
--                   argument without a default after one that has one
-- ---------------------------------------------------------------------
create or replace function public.update_membership_details(
  target_membership_id uuid,
  new_full_name        text             default null,
  new_job_title        text             default null,
  new_role             public.user_role default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id  uuid;
  v_user_id uuid;
  v_role    public.user_role;
begin
  select org_id, user_id, role
    into v_org_id, v_user_id, v_role
    from public.memberships
   where id = target_membership_id;

  if v_org_id is null then
    raise exception 'Membership not found' using errcode = '42501';
  end if;

  -- Primary admins and admins only (RISK-002). With managers allowed, a manager could
  -- set any role — their own included — through this definer function.
  if not public.has_org_role(
       v_org_id, array['primary_admin', 'admin']::public.user_role[]
     ) then
    raise exception 'Not authorized to edit this teammate' using errcode = '42501';
  end if;

  -- An admin edits themselves, managers and contributors — not other admins or the
  -- primary admin, so admins cannot rewrite each other. The primary admin edits anyone.
  if not public.has_org_role(v_org_id, array['primary_admin']::public.user_role[])
     and v_user_id is distinct from auth.uid()
     and v_role not in ('manager', 'contributor') then
    raise exception 'Admins can only edit themselves, managers and contributors'
      using errcode = '42501';
  end if;

  -- Only the primary admin makes admins.
  if new_role = 'admin' and v_role <> 'admin'
     and not public.has_org_role(v_org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can make someone an admin'
      using errcode = '42501';
  end if;

  -- Nobody changes their own role here.
  if v_user_id = auth.uid() and new_role <> v_role then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  if new_role is null then
    raise exception 'Choose a role' using errcode = '22023';
  end if;

  -- The two guards `owners_admins_update_member_role` enforces, restated because a
  -- definer bypasses the policy that would otherwise apply them.
  if v_role = 'primary_admin' and new_role <> 'primary_admin' then
    raise exception 'Transfer the primary admin role instead of demoting it'
      using errcode = '22023';
  end if;

  if new_role = 'primary_admin' and v_role <> 'primary_admin' then
    raise exception 'Use transfer_primary_admin to hand over that role'
      using errcode = '22023';
  end if;

  if new_job_title is not null and char_length(new_job_title) not between 2 and 60 then
    raise exception 'Job title must be 2 to 60 characters' using errcode = '22023';
  end if;

  update public.memberships
     set role      = new_role,
         job_title = new_job_title
   where id = target_membership_id;

  if new_full_name is not null then
    update public.profiles
       set full_name = new_full_name
     where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.update_membership_details(uuid, text, text, public.user_role) to authenticated;

-- ---------------------------------------------------------------------
-- Membership change rules a policy cannot express (RISK-002)
--
-- Row policies see only the NEW row on UPDATE, so they cannot say "this
-- column may not change". This BEFORE UPDATE trigger does:
--
--   * `status` (deactivate / reactivate) — the primary admin for anyone;
--     an admin for managers and contributors only, never another admin
--     (RISK-005).
--   * `user_id` and `org_id` never change: moving a seat to another
--     person or workspace is not an edit, it is a new membership.
--   * `cost_rate` (what the person is paid) - the primary admin only. It
--     is the one figure an admin must neither see nor change.
--   * `default_rate` (the bill rate) - the primary admin or an admin.
--
-- Runs only for real users. The service role and internal work (sign-up,
-- invite acceptance) have no auth.uid() and are not blocked; SECURITY
-- DEFINER functions such as transfer_primary_admin keep the caller's
-- uid, never touch these columns, and so pass as well.
-- ---------------------------------------------------------------------
create or replace function public.guard_membership_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.org_id is distinct from old.org_id then
    raise exception 'A membership cannot be moved to another person or workspace'
      using errcode = '42501';
  end if;

  -- Primary admin: anyone. Admin: managers and contributors only, never another admin,
  -- so admins cannot lock each other out (RISK-005; same rule as canDeactivateRole in
  -- features/people/lib/can-deactivate-member.ts).
  if new.status is distinct from old.status
     and not (
       public.has_org_role(old.org_id, array['primary_admin']::public.user_role[])
       or (
         public.has_org_role(old.org_id, array['admin']::public.user_role[])
         and old.role in ('manager', 'contributor')
       )
     ) then
    raise exception 'Only the primary admin, or an admin for managers and contributors, can deactivate or reactivate people'
      using errcode = '42501';
  end if;

  -- Rates. The general update policy allows any column, so without this an admin could set
  -- a cost rate with a direct update instead of going through set_member_rates.
  if new.cost_rate is distinct from old.cost_rate
     and not public.has_org_role(old.org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can change a cost rate'
      using errcode = '42501';
  end if;

  if new.default_rate is distinct from old.default_rate
     and not public.has_org_role(old.org_id, array['primary_admin', 'admin']::public.user_role[]) then
    raise exception 'Only the primary admin or an admin can change a bill rate'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
