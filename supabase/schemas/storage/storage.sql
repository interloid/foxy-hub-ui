-- =====================================================================
-- Storage RLS for the `deliverables` bucket
--
-- DECLARED HERE so `supabase db diff` treats these four policies as the
-- intended state. They used to live only in
-- migrations/20260727121649_storage_setup.sql, which had two costs:
--
--   1. A regenerated baseline dropped them silently. `pg_dump` runs with
--      `--exclude-schema "…|storage|…"`, so the schema never appeared in a
--      generated migration and `supabase db reset` produced a database where
--      every deliverable upload 403s.
--   2. `db diff --use-migra` actively wanted to DELETE them, because the live
--      database had four policies the declared schema knew nothing about:
--
--        drop policy "deliverables_delete_staff" on "storage"."objects";
--        drop policy "deliverables_insert_staff" on "storage"."objects";
--        drop policy "deliverables_select_org_members" on "storage"."objects";
--        drop policy "deliverables_update_staff" on "storage"."objects";
--
--      That is the same trap `schemas/grants/grants.sql` documents: undeclared
--      objects read as drift, and the generator's instinct is to remove them.
--
-- WHAT IS *NOT* HERE: the bucket itself. `insert into storage.buckets (...)` is
-- a ROW, and a schema diff never carries rows, so the bucket creation stays a
-- hand-written migration. Declaring policies without the bucket is harmless —
-- they simply match nothing until it exists.
--
-- Registered in config.toml `schema_paths` after ./schemas/policies, because
-- every predicate below reads public.memberships.
--
-- PATH CONVENTION — {org_id}/{project_id}/{filename}
--   (storage.foldername(name))[1] -> org_id
--   (storage.foldername(name))[2] -> project_id
-- =====================================================================

-- SELECT: any org member, with no role filter at all.
--
-- Deliberately wider than the writes: a client must be able to download the
-- deliverable they are being asked to approve, and `06_rls_deliveries` already
-- scopes WHICH deliveries they can see. The org-folder check is what keeps one
-- tenant out of another's files.
create policy "deliverables_select_org_members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
    )
  );

-- INSERT / UPDATE / DELETE: staff only — primary_admin, admin, manager and
-- contributor. Clients never write to the bucket; they approve or reject the
-- delivery row instead, through `update_delivery_status`.
--
-- `manager` is included on all three: uploading a deliverable is project work,
-- not billing, and billing is the only thing that role does not do.
create policy "deliverables_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

-- UPDATE covers rename/move, which is why it reads the same folder check.
create policy "deliverables_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

create policy "deliverables_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );
