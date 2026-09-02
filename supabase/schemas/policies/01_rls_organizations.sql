alter table public.organizations enable row level security;

create policy "org_members_can_view"
  on public.organizations for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.org_id  = organizations.id
        and m.user_id = (select auth.uid())
    )
  );

create policy "org_owner_can_update"
  on public.organizations for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));