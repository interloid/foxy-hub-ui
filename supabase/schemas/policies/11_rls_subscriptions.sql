alter table public.subscriptions enable row level security;

-- **Owners and admins, by ROLE.** This used to read
--
--   `exists (select 1 from organizations o where o.id = subscriptions.org_id
--             and o.user_id = auth.uid())`
--
-- — `organizations.user_id` is the single person who CREATED the workspace, not a role. So an
-- invited admin, with every other admin power, could not read the subscription row at all: the
-- dashboard's Studio MRR read `$0` and the plan card did not render, both silently, because a
-- policy that returns no rows is indistinguishable from a workspace with no subscription.
--
-- That is the same mistake D021 corrected on `projects`, `invoices`, `milestones` and `updates`,
-- where a membership test that ignored the role admitted the wrong people; here it excluded the
-- right ones. `has_org_role` is the SECURITY DEFINER helper every other policy uses, so this now
-- matches the shape of the rest of the schema instead of being the one exception.
--
-- Members are still out: what the agency pays for its own tooling is not theirs to read, and the
-- dashboard no longer offers them the card either (decisions.md **D048**).
create policy "owners_admins_view_subscription"
  on public.subscriptions for select to authenticated
  using (
    public.has_org_role(
      subscriptions.org_id,
      array['owner', 'admin']::public.user_role[]
    )
  );
