alter table public.invoices enable row level security;

-- Staff see everything in their org; a client sees ONLY the invoices of projects they are
-- the client OF. The previous policy tested org membership with NO role filter, and invited
-- clients get a membership row — so every client of an agency could read every other
-- client's invoices. Same correction as 06_rls_deliveries. See decisions.md D021.
create policy "staff_and_own_client_view_invoices"
  on public.invoices for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = invoices.project_id
        and (
          p.client_id = (select auth.uid())
          or public.has_org_role(p.org_id, array['owner', 'admin', 'member']::public.user_role[])
        )
    )
  );

create policy "owners_admins_insert_invoices"
  on public.invoices for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id  = invoices.org_id
        and m.user_id = (select auth.uid())
        and m.role    in ('owner', 'admin')
    )
  );

create policy "owners_admins_update_invoices"
  on public.invoices for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id  = invoices.org_id
        and m.user_id = (select auth.uid())
        and m.role    in ('owner', 'admin')
    )
  );