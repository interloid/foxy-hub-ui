alter table public.clients enable row level security;

-- **Clients are excluded from SELECT, deliberately** — the same call `05_rls_project_allocations`
-- makes, for the same reason. This table is the agency's client LIST: who else they work for,
-- and the named contact at each. A client reading it would be reading the roster of their own
-- supplier's other customers, including competitors.
--
-- A client never needs it. Their portal reads their own project by
-- `projects.client_id = auth.uid()`, and the company name they see is their own, reached through
-- that row. So the fix is to leave the role out of the policy rather than to filter it — D021's
-- lesson was that a role-less membership test lets every client read every other client's rows.
create policy "staff_view_clients"
  on public.clients for select to authenticated
  using (
    public.has_org_role(clients.org_id, array['owner', 'admin', 'member']::public.user_role[])
  );

-- Owners and admins write. Members may READ the client list — they work on the projects — but
-- creating or renaming a client is a commercial act, the same division
-- `owners_admins_insert_projects` and `owners_admins_write_project_allocations` already draw.
--
-- `for all` covers insert/update/delete in one policy: they answer identically here, and three
-- copies of one predicate is three places for it to drift. `with check` is stated as well as
-- `using` — without it an UPDATE could move a row to another org, since `using` only decides
-- which rows the statement can see, not what it may write.
create policy "owners_admins_write_clients"
  on public.clients for all to authenticated
  using (
    public.has_org_role(clients.org_id, array['owner', 'admin']::public.user_role[])
  )
  with check (
    public.has_org_role(clients.org_id, array['owner', 'admin']::public.user_role[])
  );
