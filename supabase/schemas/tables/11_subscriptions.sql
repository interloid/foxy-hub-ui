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
  created_at         timestamptz not null    default now()
);

create index if not exists subscriptions_org_id_idx  on public.subscriptions(org_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create unique index if not exists subscriptions_org_id_active_key
  on public.subscriptions(org_id)
  where status = 'active';