create table public.stripe_events (
  id           uuid        primary key default gen_random_uuid(),
  event_id     text        not null    unique,
  type         text        not null,
  processed_at timestamptz not null    default now()
);

create index if not exists stripe_events_type_idx on public.stripe_events(type);