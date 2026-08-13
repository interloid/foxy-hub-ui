create table public.plans (
  id                  uuid        primary key default gen_random_uuid(),
  created_at          timestamptz not null    default now(),
  name                text        not null,
  duration_months     smallint    not null,
  price_cents         integer     not null,
  features            jsonb       not null    default '{}'::jsonb,
  is_active           boolean     not null    default true,
  price_id            varchar,

  -- How many seats the plan includes — the denominator in the dashboard's plan card
  -- ("3 of 5 seats"). A COLUMN rather than a `features` key: the card cannot render without it,
  -- and `features` defaults to `'{}'`, so a jsonb lookup has no way to tell "this plan is
  -- unlimited" from "somebody forgot to set it". Nullable means unlimited, stated once here
  -- rather than inferred at each call site.
  seats               smallint    check (seats is null or seats > 0),
  unique (name, duration_months)
);

create unique index if not exists plans_price_id_key on public.plans(price_id)
  where price_id is not null;