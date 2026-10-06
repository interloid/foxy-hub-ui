alter table public.time_entries enable row level security;

-- Users see their own entries; primary admins, admins AND managers see every entry in their
-- orgs. Approving time is operational, not billing, so `manager` is in here.
--
-- This used to join `organizations.user_id`, which is the single creator of the org, so an
-- `admin` membership could not see the team's time at all — and the approvals queue is on
-- the Admin dashboard. `has_org_role` is the SECURITY DEFINER helper, so this does not
-- recurse through the memberships policies.
--
-- Billing is deliberately NOT changed to match: `11_rls_subscriptions` stays primary-admin and
-- admin only, which is also the single line `manager` does not cross.
create policy "own_or_org_staff_view_entries"
  on public.time_entries for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['primary_admin', 'admin', 'manager']::public.user_role[]
        )
    )
  );

-- Any org member can log time on their org's projects
create policy "members_insert_entries"
  on public.time_entries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      join public.memberships m on p.org_id = m.org_id
      where p.id     = time_entries.project_id
        and m.user_id = (select auth.uid())
    )
  );

-- Users can update their own drafts
create policy "own_update_draft_entries"
  on public.time_entries for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "org_staff_update_entries"
  on public.time_entries for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['primary_admin', 'admin', 'manager']::public.user_role[]
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['primary_admin', 'admin', 'manager']::public.user_role[]
        )
    )
  );

-- Users can delete their own drafts
create policy "own_delete_draft_entries"
  on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'draft');