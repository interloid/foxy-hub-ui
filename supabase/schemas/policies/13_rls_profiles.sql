alter table public.profiles enable row level security;

-- Your own profile, plus anyone who shares an organisation with you.
--
-- This was `using (true)`, which let every authenticated user read every profile row in
-- the database — all names and avatars, across all tenants, with no relationship required.
-- Profiles are joined to render authors, assignees and members, so the org boundary is the
-- narrowest scope that keeps those working.
--
-- `current_user_orgs()` is the SECURITY DEFINER helper, so this does not recurse through
-- the memberships policies.
create policy "view_own_and_co_member_profiles"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and m.org_id in (select public.current_user_orgs())
    )
  );

create policy "own_update_profile"
  on public.profiles for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "own_insert_profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));