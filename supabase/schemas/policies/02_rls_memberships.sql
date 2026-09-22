alter table public.memberships enable row level security;

-- Users see their own memberships
create policy "view_own_membership"
  on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));

-- Users see other members of orgs they belong to
-- (uses the helper function instead of a subquery on memberships)
create policy "view_org_members"
  on public.memberships for select to authenticated
  using (org_id in (select public.current_user_orgs()));

-- Primary admins, admins and managers can invite members to their org
create policy "owners_admins_can_insert_members"
  on public.memberships for insert to authenticated
  with check (public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]));

-- Primary admins, admins and managers can change a member's role.
--
-- There was no update policy at all, so a role was fixed at invitation: promoting a member
-- to admin was impossible through the API, and the only workaround was delete-and-reinvite,
-- which discards the membership row and its created_at.
--
-- `role <> 'primary_admin'` appears on BOTH sides deliberately:
--   USING      — the primary admin's own membership row cannot be edited, so an admin cannot
--                demote the primary admin.
--   WITH CHECK — nobody can promote themselves or anyone else TO primary_admin. Transferring
--                ownership also moves `organizations.user_id` and is a separate,
--                deliberate operation, not a role edit.
--
-- The WITH CHECK re-evaluates has_org_role against the NEW row, so a membership cannot be
-- moved into an org the caller does not administer.
create policy "owners_admins_update_member_role"
  on public.memberships for update to authenticated
  using (
    public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    and role <> 'primary_admin'
  )
  with check (
    public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    and role <> 'primary_admin'
  );

-- Only the primary admin can remove members — not admins, and not managers
create policy "owners_can_delete_members"
  on public.memberships for delete to authenticated
  using (public.has_org_role(org_id, array['primary_admin']::public.user_role[]));