alter table public.projects enable row level security;

-- Staff see everything in their org; a client sees ONLY the projects of projects they are
-- the client OF. The previous policy tested org membership with NO role filter, and invited
-- clients get a membership row — so every client of an agency could read every other
-- client's projects. Same correction as 06_rls_deliveries. See decisions.md D021.
create policy "staff_and_own_client_view_projects"
  on public.projects for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.has_org_role(projects.org_id, array['owner', 'admin', 'member']::public.user_role[])
  );

-- Owners/admins can insert projects
create policy "owners_admins_insert_projects"
  on public.projects for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = projects.org_id
        and m.role    in ('owner', 'admin')
    )
  );

-- Owners/admins/members can update projects
create policy "staff_update_projects"
  on public.projects for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = projects.org_id
        and m.role    in ('owner', 'admin', 'member')
    )
  );

-- Owners/admins can delete projects
create policy "owners_admins_delete_projects"
  on public.projects for delete to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = projects.org_id
        and m.role    in ('owner', 'admin')
    )
  );