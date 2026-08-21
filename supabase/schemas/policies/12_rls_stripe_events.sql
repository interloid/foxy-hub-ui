alter table public.stripe_events enable row level security;
-- No policies: only service_role touches this table.