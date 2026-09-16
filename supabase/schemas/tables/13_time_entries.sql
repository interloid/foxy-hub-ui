create table public.time_entries (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null    references auth.users(id) on delete cascade,
  project_id       uuid        not null    references public.projects(id) on delete cascade,
  milestone_id     uuid                    references public.milestones(id) on delete set null,
  work_date        date        not null,
  duration_minutes integer     not null    check (duration_minutes > 0),
  description      text        not null,
  status           public.time_entry_status        not null    default 'draft',
  created_at       timestamptz not null    default now(),

  -- ── Billing state ──────────────────────────────────────────────────────────────────────
  --
  -- Null means UNBILLED. The New invoice panel promises lines "from approved, unbilled hours"
  -- and had no way to keep that promise: nothing recorded that an hour had already been
  -- invoiced, so every generated invoice re-billed the same entries from scratch.
  --
  -- **`invoice_id` is BILLED. `invoices.status` is PAID.** Two different facts, and conflating
  -- them is the bug this column exists to prevent. An entry stays attached to its invoice while
  -- that invoice is unpaid and while it is overdue; releasing it back into the pool because
  -- nobody paid is exactly how next month's invoice bills September's hours a second time.
  -- Non-payment is a collections problem and it never rewinds billing state.
  --
  -- The one legitimate release is a CANCELLED invoice, whose hours belong on the next one.
  -- That is a status change, so the application clears this column; `on delete set null` covers
  -- only the harder case of an invoice row actually being removed. Correcting an issued invoice
  -- is a cancel plus a re-issue, never an edit — the same append-only discipline
  -- `project_allocations` uses for rates and `activity_events` for mistakes.
  invoice_id       uuid                    references public.invoices(id) on delete set null
);

create index if not exists time_entries_user_id_idx      on public.time_entries(user_id);
create index if not exists time_entries_project_id_idx   on public.time_entries(project_id);
create index if not exists time_entries_milestone_id_idx on public.time_entries(milestone_id);
create index if not exists time_entries_work_date_idx    on public.time_entries(work_date);

-- The unbilled query reads `invoice_id is null` for a project on every visit to the New invoice
-- panel, so this is the index that feature depends on, not a nicety.
create index if not exists time_entries_invoice_id_idx   on public.time_entries(invoice_id);
