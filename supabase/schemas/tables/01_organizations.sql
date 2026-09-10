create table public.organizations (
  id                   uuid        primary key default gen_random_uuid(),
  created_at           timestamptz not null    default now(),
  -- NOT NULL: the onboard wizard requires both, and a workspace with no name or no URL
  -- is unusable — it cannot be displayed or addressed. `handle_new_user_signup` validates
  -- them before inserting so the failure reads as a message rather than a constraint
  -- violation. See decisions.md D020.
  name                 text        not null,
  slug                 text        not null,
  logo_url             text,
  website_url          text,
  user_id              uuid        references auth.users(id) on delete cascade,
  daily_capacity_hours smallint    not null    default 8
    check (daily_capacity_hours between 1 and 24),

  -- ── The rest of the prototype's `orgCfg`. See decisions.md D044. ────────────────────────
  --
  -- `daily_capacity_hours` above is already the design's `standardDayMin / 60`, and it is what
  -- the over-commit rule measures an allocation against ("pushes someone past a standard
  -- working day"). These three were carried in the prototype's state and had no column.
  days_per_week        smallint    not null    default 5
    check (days_per_week between 1 and 7),

  -- ISO 4217, so money can be formatted without guessing from a locale. Org-level rather than
  -- per-project: an agency bills in one currency, and the design shows no per-project picker.
  currency             text        not null    default 'USD'
    check (char_length(currency) = 3),

  -- **Reporting only.** Time entries store the exact minute — the Log time panel says so on
  -- screen ("Stored to the exact minute") and `time_entries.duration_minutes` holds it that
  -- way (D041/D043). This is what timesheets and invoices ROUND TO when they summarise, and
  -- it must never be applied on input, or the stored figure stops matching what was typed.
  rounding_minutes     smallint    not null    default 15
    check (rounding_minutes between 1 and 60),

  -- How long a client has to pay, in days, counted from the day the invoice is issued.
  --
  -- Nothing stored payment terms, so nothing could set `invoices.due_date` — and without a due
  -- date an invoice can never lapse. `invoice-overdue-handler` selects exactly
  -- `status = 'due' and due_date < now()`, so every invoice the app generated sat outside that
  -- query forever: never chased, never counted as outstanding, never payable.
  --
  -- Org-level rather than per-invoice: an agency has standard terms, and the design shows no
  -- per-invoice picker. Beside `currency` and `rounding_minutes` because it is the same kind of
  -- fact — a billing default every invoice inherits.
  --
  -- 30 is the common default. The range allows same-day (0 would mean "due on receipt", which
  -- is a real term) through a year, which is well past anything legitimate.
  payment_terms_days   smallint    not null    default 30
    check (payment_terms_days between 0 and 365)
);

create index if not exists organizations_user_id_idx on public.organizations(user_id);
create unique index if not exists organizations_slug_key on public.organizations(slug);