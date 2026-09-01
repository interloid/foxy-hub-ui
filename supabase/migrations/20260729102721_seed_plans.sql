-- Seed the plans table with the pricing tiers your app supports.
-- Idempotent: safe to run against a fresh DB, safe to re-run after edits.
--
-- Tiers are the DESIGN's (Foxy Hub Update.dc.html, onboard step 2) — Starter / Studio /
-- Agency at $19 / $49 / $99, with duration_months 1 = monthly and 12 = yearly, matching the
-- wizard's two-way billing toggle. See decisions.md D020.
--
-- `features` holds ENFORCEMENT LIMITS, not display copy. -1 means unlimited. The values
-- below are derived from the design's own feature bullets, so the card and the entitlement
-- cannot drift:
--
--   Starter  "Up to 5 active projects"          -> max_projects 5
--            "2 seats"                          -> max_members  2
--   Studio   "Unlimited projects & clients"     -> max_projects -1, max_clients -1
--            "5 seats"                          -> max_members  5
--   Agency   "Everything in Studio" + 15 seats  -> unlimited, max_members 15
--
-- The wizard's blurb, seats line and bullets live in src/features/onboarding/data.ts —
-- marketing copy is not data anyone queries, and changing a word should not need a
-- migration.

-- `seats` is NOT set here — the column doesn't exist yet at this point in migration
-- history (it's added by 20260811052725_dashboard_updates.sql, which runs after this
-- one). The actual seat counts (Starter 5, Studio 10, Agency 15) are backfilled by that
-- later migration, right after it adds the column — see the note there.
insert into public.plans (name, price_cents, duration_months, features, is_active, price_id)
values
  -- ---------------------------------------------------------------------------------
  -- Free is NOT a card in the design. It is the plan every workspace STARTS on:
  -- `handle_new_user_signup` does `select id from plans where name = 'Free'` for the
  -- subscription it creates at signup, before any plan has been chosen. Without this row
  -- that lookup returns NULL, every new workspace gets a null plan_id, and the first
  -- upgrade attempt crashes `create-checkout` — it reads `subscription.plans.name` to work
  -- out the current tier.
  --
  -- is_active MUST stay true. `10_rls_plans` only exposes active rows, so a false here
  -- would hide a user's own current plan from every joined read — including the one
  -- create-checkout depends on. A pricing page that should not offer Free must filter it
  -- out by name; it cannot be hidden at the data layer without breaking billing.
  --
  -- duration_months 0 keeps it distinct under the (name, duration_months) unique key.
  -- ---------------------------------------------------------------------------------
  ('Free', 0, 0, '{
    "max_projects": 3,
    "max_members": 2,
    "max_clients": 3
  }'::jsonb, true, null),

  ('Starter', 1900, 1, '{
    "max_projects": 5,
    "max_members": 2,
    "max_clients": 5
  }'::jsonb, true, 'price_1U1nt0RlHwZbnxueh57fvB2Z'),

  ('Starter', 19000, 12, '{
    "max_projects": 5,
    "max_members": 2,
    "max_clients": 5
  }'::jsonb, true, 'price_1U1nxpRlHwZbnxuekSHfzVCt'),

  -- Both Studio rows carry the SAME limits. They previously disagreed — monthly gave
  -- 15 projects / 10 seats, yearly gave unlimited / 5 seats — so the entitlement changed
  -- with the billing period, and the monthly row contradicted the design's "Unlimited
  -- projects & clients" and "5 seats". Billing period must never alter what you get.
  ('Studio', 4900, 1, '{
    "max_projects": -1,
    "max_members": 5,
    "max_clients": -1
  }'::jsonb, true, 'price_1U1nybRlHwZbnxuesb2du53X'),

  ('Studio', 49000, 12, '{
    "max_projects": -1,
    "max_members": 5,
    "max_clients": -1
  }'::jsonb, true, 'price_1U1nyxRlHwZbnxueepzH1A9A'),

  ('Agency', 9900, 1, '{
    "max_projects": -1,
    "max_members": 15,
    "max_clients": -1
  }'::jsonb, true, 'price_1U1o01RlHwZbnxuetZb9m7Xc'),

  ('Agency', 99000, 12, '{
    "max_projects": -1,
    "max_members": 15,
    "max_clients": -1
  }'::jsonb, true, 'price_1U1o0HRlHwZbnxueSm6ujxQI')

on conflict (name, duration_months) do update
set price_cents = excluded.price_cents,
    features    = excluded.features,
    is_active   = excluded.is_active,
    price_id    = excluded.price_id;