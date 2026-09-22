create table public.invoices (
  id             uuid        primary key default gen_random_uuid(),
  invoice_number text        not null,
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
  -- Stripe's hosted invoice page. Written when the invoice is ISSUED, not when it is paid:
  -- the invoice-first flow finalises a Stripe invoice up front, so this is the link a client
  -- follows to pay and to download the document. It used to hold Stripe's post-payment
  -- receipt, which meant the only invoices with a payment link were the ones already settled.
  invoice_url    text,

  -- The Stripe invoice this row was issued as. The webhook matches payments back by it, and
  -- its presence is what makes re-issuing idempotent — a second click returns the existing
  -- hosted URL rather than billing the client twice.
  stripe_invoice_id text unique,
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

create unique index if not exists invoices_org_number_key
  on public.invoices(org_id, invoice_number);

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
