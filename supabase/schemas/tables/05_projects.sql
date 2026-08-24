create table public.projects (
  id          uuid                  primary key default gen_random_uuid(),
  org_id      uuid                  not null references public.organizations(id) on delete cascade,
  name        text                  not null,
  client_id   uuid                  references auth.users(id) on delete set null,
  description text,
  status      public.project_status not null    default 'pending',
  start_date  date,
  start_from  text,
  due_date    timestamptz,
  created_at  timestamptz           not null    default now(),
  updated_at  timestamptz,

  -- ── Engagement, per the design's New project panel. See decisions.md D044. ──────────────
  --
  -- The form collected these long before there was anywhere to put them, so `createProject`
  -- shipped writing only name/client/due_date/description and the panel said so out loud
  -- (D042). These are the columns that close that gap.
  --
  -- `engagement` defaults to `full_time` because every existing row predates the column and
  -- the design's own form opens on that card. It is NOT NULL: a project always bills somehow,
  -- and a null would mean "nobody has decided", which the form does not allow.
  engagement       public.engagement_model not null default 'full_time',

  -- The hourly engagements' budget and the fixed engagement's fee share one column: they are
  -- the same fact (what this project is worth), and the design shows one field for both —
  -- "Contract value / budget ($)". Nullable because a retainer states its value in the
  -- retainer columns instead.
  contract_value   numeric(12, 2) check (contract_value is null or contract_value >= 0),

  -- ── Retainer terms ─────────────────────────────────────────────────────────────────────
  -- Four columns rather than one jsonb: they are queryable, typed, and there are only four.
  -- A retainer is "N hours per period for AMOUNT, with overage billed at ×MULTIPLIER" — the
  -- prototype renders exactly that (`engRetHoursLabel`, `engRetAmountLabel`,
  -- `engRetOverageLabel`). All nullable, since three engagements in four never set them.
  retainer_hours   numeric(6, 2)  check (retainer_hours is null or retainer_hours > 0),
  retainer_period  public.retainer_period,
  retainer_amount  numeric(12, 2) check (retainer_amount is null or retainer_amount >= 0),
  retainer_overage numeric(4, 2)  check (retainer_overage is null or retainer_overage >= 0),

  -- Why an over-commit was accepted. The design blocks Create when an allocation pushes
  -- someone past a working day and demands a reason to proceed — so this column is the audit
  -- trail for a rule that was deliberately overridden, not a note field.
  override_reason  text
);

create index if not exists projects_org_id_idx    on public.projects(org_id);
create index if not exists projects_client_id_idx on public.projects(client_id);
