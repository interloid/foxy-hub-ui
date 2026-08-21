alter table public.invitations enable row level security;

-- Owners and admins manage invitations for their own org. `has_org_role` is the
-- SECURITY DEFINER helper, so this does not recurse through the memberships policies.
create policy "owners_admins_view_invitations"
  on public.invitations for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.user_role[]));

-- The inviter cannot pre-mark an invitation accepted, and cannot attribute it to
-- someone else. `accepted_at` / `accepted_by` are written only by
-- `handle_new_user_signup`, which is SECURITY DEFINER and bypasses RLS.
create policy "owners_admins_create_invitations"
  on public.invitations for insert to authenticated
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.user_role[])
    and invited_by  = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );

-- Revoking an invitation is a delete. There is deliberately NO update policy: an
-- issued token must not be able to change which org, role or project it grants.
create policy "owners_admins_delete_invitations"
  on public.invitations for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.user_role[]));

-- No policy for `anon`. An invitee is not authenticated when they follow the link, and
-- they do not need to read this table: they pass the raw token to signUp() and the
-- trigger resolves it. Exposing invitations to anon would let anyone enumerate who has
-- been invited to which org.
