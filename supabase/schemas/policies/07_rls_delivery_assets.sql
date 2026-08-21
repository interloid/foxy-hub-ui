alter table public.delivery_assets enable row level security;

-- Same correction as `06_rls_deliveries`: the old policy joined memberships without
-- checking role, so any client of the org could read the asset rows — and therefore the
-- storage paths — of every other client's deliverables.
--
-- `delivery_assets` carries only `delivery_id`, so the client branch reaches the project
-- through `deliveries`.
create policy "staff_and_project_client_view_delivery_assets"
  on public.delivery_assets for select to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_assets.delivery_id
        and (
          public.has_org_role(
            d.org_id,
            array['owner', 'admin', 'member']::public.user_role[]
          )
          or exists (
            select 1 from public.projects p
            where p.id        = d.project_id
              and p.client_id = (select auth.uid())
          )
        )
    )
  );

create policy "staff_insert_delivery_assets"
  on public.delivery_assets for insert to authenticated
  with check (
    exists (
      select 1 from public.deliveries d
      join public.memberships m on d.org_id = m.org_id
      where d.id     = delivery_assets.delivery_id
        and m.user_id = (select auth.uid())
        and m.role   in ('owner', 'admin', 'member')
    )
  );

create policy "staff_update_delivery_assets"
  on public.delivery_assets for update to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      join public.memberships m on d.org_id = m.org_id
      where d.id     = delivery_assets.delivery_id
        and m.user_id = (select auth.uid())
        and m.role   in ('owner', 'admin', 'member')
    )
  );