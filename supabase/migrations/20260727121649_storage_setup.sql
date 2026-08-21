-- ============================================================
-- Bucket: deliverables
-- ============================================================
-- Current cloud state: file_size_limit=NULL, allowed_mime_types=NULL
-- (unlimited size, any MIME type). This migration adds guardrails.
-- Adjust the limit and MIME list below to fit your actual usage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deliverables',
  'deliverables',
  false,
  104857600,   -- 100 MB per file
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- Policies for deliverables
-- Path convention: {org_id}/{project_id}/{filename}
--   foldername(name)[1] → org_id
--   foldername(name)[2] → project_id
-- ============================================================

-- SELECT: any org member can view files in their org's folder
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

-- INSERT: only staff (owner/admin/member) can upload
create policy "deliverables_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('owner', 'admin', 'member')
    )
  );

-- UPDATE (rename/move): only staff
create policy "deliverables_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('owner', 'admin', 'member')
    )
  );

-- DELETE: only staff
create policy "deliverables_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('owner', 'admin', 'member')
    )
  );