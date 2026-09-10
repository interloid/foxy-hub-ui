create table public.invoices (
  id             uuid        primary key default gen_random_uuid(),
  invoice_number text        not null unique,
  org_id         uuid        not null    references public.organizations(id) on delete cascade,
  project_id     uuid        not null    references public.projects(id) on delete cascade,
  amount         numeric     not null    check (amount >= 0),
  subtotal       numeric     not null default 0 check (subtotal >= 0),
  tax_amount     numeric     not null default 0 check (tax_amount >= 0),
  -- Matches `organizations.currency`, which is where an invoice's currency actually comes
  -- from. This default was 'INR' while the org default was 'USD', so an invoice written
  -- without an explicit currency disagreed with the org that issued it.
  currency       text        not null default 'USD' check (char_length(currency) = 3),
  description    text,
  invoice_url    text,
  status         public.invoice_status        not null    default 'draft',
  payment_intent text        unique,
  created_at     timestamptz not null    default now(),
  due_date       timestamptz,
  paid_at        timestamptz,

  -- ── Billing period ─────────────────────────────────────────────────────────────────────
  --
  -- WHAT WORK this invoice covers. Not when it was issued (`created_at`) and not when it is
  -- payable (`due_date`) — three dates answering three different questions. September's
  -- retainer covers 1–30 September, is issued on 1 October and falls due on the 15th.
  --
  -- **This is the only double-billing guard the flat engagements have.**
  -- `time_entries.invoice_id` protects the hourly models by marking the hours it consumed, but
  -- a retainer bills a bucket and a fixed project bills a fee — neither has hours to mark, so
  -- nothing stopped September's $6,000 from being generated a second time. The partial unique
  -- index below is that guard.
  --
  -- Nullable, because not every invoice bills a span: a fixed-price deposit and an ad-hoc
  -- mid-month top-up are not periods, and the index deliberately leaves those alone.
  --
  -- It also gives the line a name — twelve identical "Monthly retainer" rows become
  -- "Monthly retainer — September 2026" — and it is the date the retainer bucket reset, so
  -- consumption and billing agree by construction rather than by convention.
  --
  -- `date`, not `timestamptz`: a billing period starts on a day, not at an instant, and a
  -- timezone-bearing moment would make "September" mean different spans for different readers.
  -- Same reasoning as `time_entries.work_date` and `project_allocations.effective_from`.
  period_start   date,
  period_end     date        check (period_end is null or period_end >= period_start)
);

create index if not exists invoices_org_id_idx     on public.invoices(org_id);
create index if not exists invoices_project_id_idx on public.invoices(project_id);
create index if not exists invoices_number_idx     on public.invoices(invoice_number);

-- One invoice per project per period — PARTIAL, so only the invoices that actually claim a
-- period are constrained. An hourly project can still be billed twice in a month; a retainer
-- cannot be billed twice for September. This makes "has September been billed?" a database
-- fact rather than something a person has to remember.
create unique index if not exists invoices_project_period_key
  on public.invoices(project_id, period_start)
  where period_start is not null;
