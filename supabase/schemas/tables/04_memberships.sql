create table public.memberships (
  id         uuid             primary key default gen_random_uuid(),
  created_at timestamptz      not null    default now(),
  role       public.user_role not null,
  org_id     uuid             not null references public.organizations(id)
                              on update cascade on delete cascade,
  user_id    uuid             not null references auth.users(id)
                              on update cascade on delete cascade,

  -- ── Whether this person still has access to THIS organization ─────────────────────────
  --
  -- Deactivation is what the Members screen offers instead of deletion: "keeps every
  -- timesheet, invoice and comment intact — it only removes access and frees the seat".
  -- Deleting the row would satisfy neither half, since `project_allocations.user_id` and
  -- `time_entries.user_id` point at `auth.users` and would outlive it as orphans nobody
  -- can name.
  --
  -- On `memberships` rather than `profiles` because access is a fact INSIDE one
  -- organization — the same person can sit in two orgs, and one agency revoking them must
  -- not touch the other. `profiles` is global identity. It is also what the existing
  -- `owners_admins_update_member_role` policy already guards, down to its `role <> 'owner'`
  -- clause, so the owner cannot be deactivated at all.
  --
  -- NOT NULL with a default: every existing row and every row the signup trigger writes
  -- starts active, and a flag that gates access has no third "unknown" state.
  status     boolean          not null    default true,

  -- ── What a person is worth, per organization ───────────────────────────────────────────
  --
  -- A person had no rate anywhere. `project_allocations.rate` was the ONLY rate column in the
  -- schema, so every project re-typed it from scratch and the New project panel pre-filled a
  -- hardcoded $120 (then $100 on each added row) that was identical for everyone and said
  -- nothing about the person it was attached to.
  --
  -- On `memberships` rather than `profiles` because a rate is an employment fact INSIDE one
  -- organization — the same person can sit in two orgs at two different rates — and this table
  -- already carries the (user_id, org_id) grain that needs. `profiles` is global identity.
  --
  -- **Both are prefill sources and nothing more. Neither is ever read at invoice time.**
  -- Invoicing reads `project_allocations.rate`, which snapshots the value when someone is
  -- staffed. That is what stops a raise from silently re-pricing projects already running, and
  -- it keeps a raise being what the allocations file says it is: a new dated row, not an edit.
  --
  -- Nullable, and deliberately with NO default. A `default 120` would move the form's fake
  -- pre-fill one table over, where it would look authoritative.

  -- What you CHARGE for this person. Seeds the allocation's bill rate, and so reaches the
  -- client's invoice on the two hourly engagements.
  default_rate numeric(10, 2) check (default_rate is null or default_rate >= 0),

  -- What this person COSTS you, fully loaded. Internal — it must never reach an invoice.
  --
  -- It is the only number that can answer "did this job make money" on the two engagements
  -- that do not bill hours: a fixed fee and a retainer bucket are both flat, so the bill rate
  -- says nothing about margin there. Without it, `fixed` and `retainer` are unmeasurable.
  cost_rate    numeric(10, 2) check (cost_rate    is null or cost_rate    >= 0)
);

create index if not exists memberships_user_id_idx on public.memberships(user_id);
create index if not exists memberships_org_id_idx  on public.memberships(org_id);
create unique index if not exists memberships_user_org_key
  on public.memberships(user_id, org_id);
