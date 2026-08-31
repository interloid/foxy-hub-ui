alter table public.updates enable row level security;

-- Staff see everything in their org; a client sees ONLY the updates of projects they are
-- the client OF. The previous policy tested org membership with NO role filter, and invited
-- clients get a membership row — so every client of an agency could read every other
-- client's updates. Same correction as 06_rls_deliveries. See decisions.md D021.
create policy "staff_and_own_client_view_updates"
  on public.updates for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = updates.project_id
        and (
          p.client_id = (select auth.uid())
          or public.has_org_role(p.org_id, array['owner', 'admin', 'member']::public.user_role[])
        )
    )
  );

create policy "staff_insert_updates"
  on public.updates for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      join public.memberships m on p.org_id = m.org_id
      where p.id     = updates.project_id
        and m.user_id = (select auth.uid())
        and m.role   in ('owner', 'admin', 'member')
    )
  );

create policy "own_update_own_update"
  on public.updates for update to authenticated
  using      (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "own_delete_own_update"
  on public.updates for delete to authenticated
  using (author_id = (select auth.uid()));