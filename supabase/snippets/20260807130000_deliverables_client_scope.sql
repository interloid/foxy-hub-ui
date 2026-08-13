-- ============================================================
-- Scope deliverables downloads to the client's own projects
--
-- `deliverables_select_org_members` (20260727121649_storage_setup.sql)
-- granted read to anyone holding a membership row for the org named by
-- the first path segment. Invited clients are given a membership row,
-- so every client of an agency could list and download every other
-- client's files.
--
-- Storage policies live on storage.objects, which is outside
-- `schema_paths` in config.toml, so they are managed by migration
-- rather than by the declarative schema. The table-level twins of this
-- fix are in schemas/policies/06_rls_deliveries.sql and
-- 07_rls_delivery_assets.sql.
--
-- Path convention is unchanged: {org_id}/{project_id}/{filename}
--   foldername(name)[1] -> org_id
--   foldername(name)[2] -> project_id
--
-- Both branches compare as TEXT rather than casting the segment to
-- uuid. A cast would raise on any object whose path is not two uuids,
-- and an error inside a policy fails the whole query; a text comparison
-- simply does not match. This is also the style the original used.
-- ============================================================

drop policy if exists "deliverables_select_org_members" on storage.objects;

create policy "deliverables_select_staff_and_project_client"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'deliverables'
    and (
      -- Staff: any file in an org they work for.
      exists (
        select 1 from public.memberships m
        where m.user_id     = (select auth.uid())
          and m.org_id::text = (storage.foldername(name))[1]
          and m.role        in ('owner', 'admin', 'member')
      )
      -- Client: only the folder of a project they are the client of.
      or exists (
        select 1 from public.projects p
        where p.id::text  = (storage.foldername(name))[2]
          and p.client_id = (select auth.uid())
      )
    )
  );
