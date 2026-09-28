create table public.subscriptions (
  id                 uuid        primary key default gen_random_uuid(),
  org_id             uuid        not null    references public.organizations(id) on delete cascade,
  plan_id            uuid                    references public.plans(id) on delete restrict,
  stripe_customer_id text        unique,
  stripe_subscription_id  text unique,
  stripe_payment_intent   text,
  status             public.subscription_status not null default 'active',
  current_period_end timestamptz,
  payment_method_type     text,
  payment_method_details  jsonb       not null default '{}'::jsonb,
  pending_plan_id    uuid                    references public.plans(id) on delete set null,
  pending_change_at  timestamptz,

  -- One plan change at a time per workspace. `manage-subscription` claims it with a
  -- conditional update (only when null or older than a minute) before calling Stripe and
  -- clears it when done; the minute is the fallback if the function dies mid-change.
  plan_change_started_at timestamptz,

  -- When a cancellation takes effect: set when the subscription is cancelled at the end
  -- of its period (from Stripe's `cancel_at_period_end` / `cancel_at`), null otherwise.
  -- The plan stays fully usable until then; the billing page shows "Ends on …" with
  -- "Keep my plan". When it ends, stripe-webhook moves the row back to Free.
  cancel_at          timestamptz,

  created_at         timestamptz not null    default now()
);

create index if not exists subscriptions_org_id_idx  on public.subscriptions(org_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create unique index if not exists subscriptions_org_id_active_key
  on public.subscriptions(org_id)
  where status = 'active';