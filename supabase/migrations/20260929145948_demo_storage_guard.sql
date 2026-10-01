-- Demo workspace: no uploads. RESTRICTIVE, so it narrows the existing upload
-- policies instead of adding to them. Uses public.is_demo_member() from the
-- demo_guards migration, so this file must come after it.
create policy "demo_no_uploads"
  on storage.objects as restrictive for insert to authenticated
  with check (not public.is_demo_member((select auth.uid())));

create policy "demo_no_upload_updates"
  on storage.objects as restrictive for update to authenticated
  using (not public.is_demo_member((select auth.uid())));