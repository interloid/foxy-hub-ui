-- ============================================================
-- Reseed plans to the design's tiers
--
-- The onboard wizard offers Starter / Studio / Agency at
-- $19 / $49 / $99 (Foxy Hub Update.dc.html, onboard step 2).
-- 20260729102721_seed_plans.sql seeded Free / Pro / Enterprise.
-- The developer chose the design as the winner — see
-- decisions.md D019 / D020.
--
-- Pro and Enterprise are RETIRED, not deleted.
-- subscriptions.plan_id references plans(id) ON DELETE RESTRICT,
-- so deleting a plan any subscription points at would fail. Setting
-- is_active = false keeps referential integrity and history intact
-- while removing them from the UI: 10_rls_plans.sql only exposes
-- rows where is_active = true.
--
-- Free is KEPT. `handle_new_user_signup` looks up
-- `where name = 'Free'` for the subscription it creates at signup,
-- before any plan has been chosen. Remove it and every new workspace
-- silently gets a NULL plan_id. It is also what "start with a 14-day
-- free trial" means in practice — the trial precedes checkout.
--
-- price_id IS NULL on the new rows ON PURPOSE. Six Stripe prices
-- (three tiers x monthly/yearly) do not exist yet and can only be
-- created in the Stripe dashboard. `create-checkout` refuses to build
-- a session for a plan with no price_id, so an unpriced plan fails
-- loudly instead of sending `price: null` to Stripe.
--
--   TODO before checkout works: create the six prices in Stripe and
--   update the matching rows' price_id.
--
-- `features` stays the enforcement limits. The wizard's blurb, seats
-- line and bullets are marketing copy and live in
-- src/features/onboarding/data.ts (D020) — not here.
-- ============================================================

-- 1. Retire the old paid tiers.
update public.plans
   set is_active = false
 where name in ('Pro', 'Enterprise');

-- 2. Seed the design's tiers. duration_months 1 = monthly, 12 = yearly,
--    matching the wizard's two-way billing toggle. The unique key is
--    (name, duration_months), so this is idempotent.
insert into public.plans (name, price_cents, duration_months, features, is_active, price_id)
values
  ('Starter', 1900, 1, '{
    "max_projects": 5,
    "max_members": 2,
    "max_clients": 5
  }'::jsonb, true, null),

  ('Starter', 19000, 12, '{
    "max_projects": 5,
    "max_members": 2,
    "max_clients": 5
  }'::jsonb, true, null),

  ('Studio', 4900, 1, '{
    "max_projects": -1,
    "max_members": 5,
    "max_clients": -1
  }'::jsonb, true, null),

  ('Studio', 49000, 12, '{
    "max_projects": -1,
    "max_members": 5,
    "max_clients": -1
  }'::jsonb, true, null),

  ('Agency', 9900, 1, '{
    "max_projects": -1,
    "max_members": 15,
    "max_clients": -1
  }'::jsonb, true, null),

  ('Agency', 99000, 12, '{
    "max_projects": -1,
    "max_members": 15,
    "max_clients": -1
  }'::jsonb, true, null)

on conflict (name, duration_months) do update
set price_cents = excluded.price_cents,
    features    = excluded.features,
    is_active   = excluded.is_active;
-- price_id is deliberately NOT overwritten on conflict: once the real
-- Stripe ids are filled in, re-running this migration must not blank them.
