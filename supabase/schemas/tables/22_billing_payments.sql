-- =====================================================================
-- Agency subscription payments - one row per Stripe subscription invoice.
--
-- The app's own record of what the agency was charged for Foxy HUB and where each charge
-- stands (paid, failed, refunded, disputed…), so the billing page and support can see it
-- without asking Stripe, and a refund made in the Stripe dashboard reaches the app.
--
-- NOT client invoices: those are `invoices`, money the agency's clients owe the agency.
--
-- Written only by `stripe-webhook` with the service role (invoice.* and charge.* events),
-- keyed on `stripe_invoice_id`, so a repeated event updates the same row. Stripe can
-- deliver events out of order; `last_event_at` is the `created` time of the newest event
-- applied, and an older event than that is ignored rather than rolling the row back
-- (a late "failed" must not overwrite a "paid").
-- =====================================================================
create table public.billing_payments (
  id                       uuid        primary key default gen_random_uuid(),
  org_id                   uuid        not null references public.organizations(id) on delete cascade,
  subscription_id          uuid                 references public.subscriptions(id) on delete set null,
  -- The plan the invoice was for (its first line's price), when it maps to one.
  plan_id                  uuid                 references public.plans(id) on delete set null,

  stripe_invoice_id        text        not null unique,
  -- The number printed on the invoice and receipt (e.g. "1ZRZIQFH-0002") - what customers
  -- and accountants quote. Not the `in_…` id above, which only Stripe uses. Stripe sets it
  -- when the invoice is finalised, so it is null only for a draft.
  invoice_number           text,
  stripe_payment_intent_id text                 unique,
  stripe_charge_id         text                 unique,

  -- Stripe's `billing_reason`: subscription_create, subscription_cycle (renewal),
  -- subscription_update (an upgrade's proration), manual…
  billing_reason           text,
  description              text,

  -- Minor units (cents), like `plans.price_cents`.
  amount_due_cents         integer     not null default 0,
  amount_paid_cents        integer     not null default 0,
  amount_refunded_cents    integer     not null default 0,
  -- The invoice's price (Stripe `total`) and how much of it account credit paid:
  -- amount_due = total − credit. A plan switch paid entirely from credit has amount_due 0
  -- but is still a charge the customer must be able to see. 0 on rows recorded before
  -- these columns existed.
  total_cents              integer     not null default 0,
  credit_applied_cents     integer     not null default 0,
  currency                 text        not null,

  status                   public.billing_payment_status not null,

  -- The latest decline, for "Your card was declined" on the billing page.
  failure_code             text,
  failure_message          text,
  attempt_count            integer     not null default 0,
  -- When Stripe will try the card again; null once it has given up or the invoice is paid.
  next_attempt_at          timestamptz,

  hosted_invoice_url       text,
  period_start             timestamptz,
  period_end               timestamptz,

  paid_at                  timestamptz,
  failed_at                timestamptz,
  refunded_at              timestamptz,

  last_event_id            text,
  last_event_at            timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists billing_payments_org_created_idx
  on public.billing_payments (org_id, created_at desc);
