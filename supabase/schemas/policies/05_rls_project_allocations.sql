alter table public.project_allocations enable row level security;

-- **Clients are excluded from SELECT, deliberately.** Every other project-scoped policy in
-- this schema admits `client_id = auth.uid()` so a client can see their own project — but who
-- is staffed on it, at what hourly rate, is the agency's commercial information. A client
-- reading this table would see the margin on their own job.
--
-- This is the same class of mistake D021 corrected on `projects`, `invoices`, `milestones` and
-- `updates`, where a role-less membership test let every client read every other client's
-- rows. Here the fix is to leave clients out of the policy entirely rather than to filter them.
-- See decisions.md D044.
create policy "staff_view_project_allocations"
  on public.project_allocations for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_allocations.project_id
        and public.has_org_role(p.org_id, array['owner', 'admin', 'member']::public.user_role[])
    )
  );

-- Owners/admins write. Members can SEE the plan — they need to know what they are booked on —
-- but staffing somebody is an admin act, the same division `owners_admins_insert_projects`
-- draws on the parent row.
--
-- `for all` covers insert, update and delete in one policy: the three answer identically here,
-- and three copies of the same predicate is three places for them to drift apart. `with check`
-- is stated as well as `using` — without it an UPDATE could move a row to a project the caller
-- may not touch, since `using` only gates which rows are visible to the statement.
create policy "owners_admins_write_project_allocations"
  on public.project_allocations for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_allocations.project_id
        and public.has_org_role(p.org_id, array['owner', 'admin']::public.user_role[])
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_allocations.project_id
        and public.has_org_role(p.org_id, array['owner', 'admin']::public.user_role[])
    )
  );
