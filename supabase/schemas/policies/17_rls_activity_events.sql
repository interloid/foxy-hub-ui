alter table public.activity_events enable row level security;

-- Staff only. The feed is the agency's internal record of everything moving across the
-- workspace — every project, every client, every invoice. A client admitted here would see
-- activity on work that is not theirs, which is the same exposure
-- `05_rls_project_allocations` refuses.
--
-- The client portal has its own updates surface (`public.updates`, scoped per project). If a
-- client-facing feed is ever wanted, it is a separate policy filtered by `project_id`, not a
-- widening of this one.
create policy "staff_view_activity_events"
  on public.activity_events for select to authenticated
  using (
    public.has_org_role(
      activity_events.org_id,
      array['owner', 'admin', 'member']::public.user_role[]
    )
  );

-- **INSERT only, and no UPDATE or DELETE policy exists at all.** That absence is the design:
-- with RLS enabled and no policy for a command, Postgres refuses it outright, so this table is
-- append-only for every API caller by construction rather than by convention. Rewriting history
-- would defeat the point of keeping it.
--
-- Any member may write, because any member's actions are what the feed reports — the writer is
-- whoever did the thing. Two things are pinned rather than trusted:
--
--   `actor_id` must be the caller (or null for a system event), so nobody can post activity
--   under somebody else's name;
--   `org_id` must be an org the caller belongs to, so nobody can write into another workspace.
--
-- Genuine system events (a Stripe webhook marking an invoice paid) arrive under service_role,
-- which carries BYPASSRLS and does not consult this policy — that is the only path that may
-- write `actor_id = null` alongside an `actor_kind` of 'system'.
create policy "members_insert_activity_events"
  on public.activity_events for insert to authenticated
  with check (
    public.has_org_role(
      activity_events.org_id,
      array['owner', 'admin', 'member']::public.user_role[]
    )
    and activity_events.actor_id = (select auth.uid())
  );
