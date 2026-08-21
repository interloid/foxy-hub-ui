alter table public.time_entries enable row level security;

-- Users see their own entries; owners AND admins see every entry in their orgs.
--
-- This used to join `organizations.user_id`, which is the single creator of the org, so an
-- `admin` membership could not see the team's time at all — and the approvals queue is on
-- the Admin dashboard. `has_org_role` is the SECURITY DEFINER helper, so this does not
-- recurse through the memberships policies.
--
-- Billing is deliberately NOT changed to match: `11_rls_subscriptions` stays owner-only.
create policy "own_or_org_staff_view_entries"
  on public.time_entries for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['owner', 'admin']::public.user_role[]
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
  using      (user_id = (select auth.uid()) and status = 'draft')
  with check (user_id = (select auth.uid()));

-- Users can delete their own drafts
create policy "own_delete_draft_entries"
  on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'draft');