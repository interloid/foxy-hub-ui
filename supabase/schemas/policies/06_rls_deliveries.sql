alter table public.deliveries enable row level security;

-- Staff see everything in their org; a client sees only the deliveries of the projects
-- they are the client OF.
--
-- The previous policy tested org membership alone. Invited clients are given a membership
-- row (see `handle_new_user_signup`), so that let any client of the agency read every
-- delivery it had ever made, for every other client. `03_rls_projects` and
-- `08_rls_invoices` already scope by `projects.client_id`; this now matches them.
create policy "staff_and_project_client_view_deliveries"
  on public.deliveries for select to authenticated
  using (
    public.has_org_role(
      deliveries.org_id,
      array['owner', 'admin', 'member']::public.user_role[]
    )
    or exists (
      select 1 from public.projects p
      where p.id        = deliveries.project_id
        and p.client_id = (select auth.uid())
    )
  );

create policy "owners_admins_insert_deliveries"
  on public.deliveries for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = deliveries.org_id
        and m.role    in ('owner', 'admin')
    )
  );

create policy "staff_update_deliveries"
  on public.deliveries for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = deliveries.org_id
        and m.role    in ('owner', 'admin', 'member')
    )
  );