alter table public.user_preferences enable row level security;

-- Your own row only — read, create (first save is an upsert) and change.
-- No delete policy: the row goes with the profile (ON DELETE CASCADE).
-- The weekly digest reads everyone's through the service role.
create policy "view_own_preferences"
  on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert_own_preferences"
  on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "update_own_preferences"
  on public.user_preferences for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
