-- =====================================================================
-- foxy-hub — demo seed data (re-run as a fresh migration)
--
-- Copied from 20260811124449_seed_data.sql per that file's own "HOW TO
-- RUN" form 3: that version's timestamp is already recorded as applied
-- on this project, so `supabase db push` silently skips it even though
-- its content has since changed (Sofia Marchetti / Lumen client login
-- added). This file has a new timestamp, so push will actually run it.
--
-- The source file's trigger-disable block (its section 1) and matching
-- re-enable are NOT carried over, and deliberately so: they are commented
-- out there for a reason. `on_auth_user_created` already skips these rows
-- on its own — see section 1 — and `alter table auth.users ... trigger`
-- needs ownership of a table owned by `supabase_auth_admin`, which
-- `postgres` does not have on a hosted project.
--
-- RE-RUNNABLE. Section 0 deletes exactly the rows this file creates, by
-- fixed UUID — nothing else. That means running this WILL DELETE any
-- other rows you've added by hand under org
-- '20000000-0000-4000-8000-000000000001' (e.g. ad-hoc extra `deliveries`
-- rows inserted with `gen_random_uuid()`), because they hang off the
-- same organization via cascade.
--
-- It writes to `auth.users` and `auth.identities`, so it needs a role with
-- DML on the `auth` schema — `postgres` has that, and `supabase db push`
-- connects as `postgres`. It needs no DDL there, and no ownership.
--
-- DEMO CREDENTIALS — all five accounts share the password
--
--   priya.nair@example.com          owner    Priya Nair
--   marcus.lee@example.com          admin    Marcus Lee
--   ana.torres@example.com          member   Ana Torres
--   erik.lund@nordwave.example.com  client   Erik Lund   (Nordwave Coffee)
--   sofia@lumen.example.com         client   Sofia Marchetti (Lumen Analytics)
--
--   password: FoxyDemo!2345
--
-- Fixed UUIDs, by prefix:
--   1… users   2… org        3… clients      4… projects   5… milestones
--   6… allocs  7… deliveries 71… assets      8… invoices   9… time entries
--   a… updates b… activity   c… subscription d… invitation
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Clean the previous run
--
-- Deleting the organization cascades to projects, milestones, allocations,
-- deliveries, assets, invoices, clients, subscriptions and activity events.
-- Deleting the five users cascades to profiles, memberships, time entries
-- and updates. Between them that is every row below — nothing else in the
-- database is touched, because every id here is one this file wrote.
-- ---------------------------------------------------------------------
delete from public.organizations where id = '20000000-0000-4000-8000-000000000001';

delete from auth.users where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005'
);

-- ---------------------------------------------------------------------
-- 1. Accounts
--
-- `on_auth_user_created` fires `public.handle_new_user_signup()` for every
-- INSERT on auth.users, and its two ordinary paths — redeem an `invite_token`,
-- or build a brand-new org from `org_name` / `slug` — both do the wrong thing
-- for a seed that wants five users in ONE org whose id it controls. So the
-- function opens with an escape hatch:
--
--   IF COALESCE(NEW.raw_user_meta_data->>'seed_user', 'false') = 'true' THEN
--     RETURN NEW;
--   END IF;
--
-- Every user below carries `"seed_user":true`, so the trigger returns before
-- it can raise "An organisation name is required" — and before it writes the
-- profile row, which is why section 1 writes profiles by hand.
--
-- That escape hatch is the whole reason this file does not (and must not)
-- disable the trigger. Check it is actually deployed, because if it is
-- missing the failure downstream is an opaque signup error.
-- ---------------------------------------------------------------------
do $$
declare
  v_fn oid := to_regprocedure('public.handle_new_user_signup()');
begin
  if v_fn is null then
    raise exception
      'public.handle_new_user_signup() does not exist — run the migrations before seeding.';
  end if;

  if pg_get_functiondef(v_fn) not like '%seed_user%' then
    raise exception
      'handle_new_user_signup() has no seed_user escape hatch — apply 20260811124437_update_new_user_signup.sql before seeding.';
  end if;
end
$$;

-- `crypt`/`gen_salt` come from pgcrypto, which `schemas/extensions` installs
-- into the `extensions` schema — hence the qualification.
--
-- `email_confirmed_at` is set so these accounts can sign in immediately: with
-- confirmations enabled an unconfirmed user is rejected at the password grant,
-- and there is no inbox to click through to.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000',
   '10000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated',
   'priya.nair@example.com',
   extensions.crypt('FoxyDemo!2345', extensions.gen_salt('bf')),
   now() - interval '120 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"user_name":"Priya Nair","seed_user":true}'::jsonb,
   now() - interval '120 days', now() - interval '120 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '10000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated',
   'marcus.lee@example.com',
   extensions.crypt('FoxyDemo!2345', extensions.gen_salt('bf')),
   now() - interval '96 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"user_name":"Marcus Lee","seed_user":true}'::jsonb,
   now() - interval '96 days', now() - interval '96 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '10000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated',
   'ana.torres@example.com',
   extensions.crypt('FoxyDemo!2345', extensions.gen_salt('bf')),
   now() - interval '74 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"user_name":"Ana Torres","seed_user":true}'::jsonb,
   now() - interval '74 days', now() - interval '74 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '10000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated',
   'erik.lund@nordwave.example.com',
   extensions.crypt('FoxyDemo!2345', extensions.gen_salt('bf')),
   now() - interval '40 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"user_name":"Erik Lund","seed_user":true}'::jsonb,
   now() - interval '40 days', now() - interval '40 days', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '10000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated',
   'sofia@lumen.example.com',
   extensions.crypt('FoxyDemo!2345', extensions.gen_salt('bf')),
   now() - interval '20 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"user_name":"Sofia Marchetti","seed_user":true}'::jsonb,
   now() - interval '20 days', now() - interval '20 days', '', '', '', '');

-- Without a matching identity row GoTrue treats the account as having no
-- email provider linked, and the password grant fails even though the hash
-- above is correct. `provider_id` is the provider's own key for the user,
-- which for the email provider is the user id.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  u.id,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  u.id::text,
  u.created_at,
  u.created_at,
  u.created_at
from auth.users u
where u.id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005'
);

-- The trigger's own first act, done by hand. `full_name` is what
-- `namesByUserId()` reads for the capacity panel and the activity feed;
-- a missing row there renders "Unnamed member".
insert into public.profiles (id, full_name, avatar_url)
values
  ('10000000-0000-4000-8000-000000000001', 'Priya Nair', null),
  ('10000000-0000-4000-8000-000000000002', 'Marcus Lee', null),
  ('10000000-0000-4000-8000-000000000003', 'Ana Torres', null),
  ('10000000-0000-4000-8000-000000000004', 'Erik Lund',  null),
  ('10000000-0000-4000-8000-000000000005', 'Sofia Marchetti', null);

-- ---------------------------------------------------------------------
-- 2. The workspace
-- ---------------------------------------------------------------------
insert into public.organizations (
  id, name, slug, logo_url, website_url, user_id,
  daily_capacity_hours, days_per_week, currency, rounding_minutes, created_at
)
values (
  '20000000-0000-4000-8000-000000000001',
  'Foxy Studio',
  'foxy-studio',
  null,
  'https://foxystudio.example.com',
  '10000000-0000-4000-8000-000000000001',
  8, 5, 'USD', 15,
  now() - interval '120 days'
);

-- Seats are staff only — `getDashboardMetrics` counts owner/admin/member and
-- excludes clients, so Erik and Sofia are guests on the plan rather than
-- billed seats.
insert into public.memberships (id, user_id, org_id, role, created_at)
values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'owner',  now() - interval '120 days'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', 'admin',  now() - interval '96 days'),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000001', 'member', now() - interval '74 days'),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000001', 'client', now() - interval '40 days'),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000005',
   '20000000-0000-4000-8000-000000000001', 'client', now() - interval '20 days');

-- The plan comes from `plans`, which is seeded by MIGRATIONS
-- (20260729102721_seed_plans.sql), not from here.
do $$
declare
  v_plan_id uuid;
begin
  select id into v_plan_id
    from public.plans
   where name = 'Studio' and duration_months = 1 and is_active
   limit 1;

  if v_plan_id is null then
    raise exception
      'No active Studio/monthly plan — run the migrations before seeding (supabase/migrations/20260729102721_seed_plans.sql).';
  end if;

  insert into public.subscriptions (
    id, org_id, plan_id, stripe_customer_id, stripe_subscription_id,
    stripe_payment_intent, status, current_period_end,
    payment_method_type, payment_method_details, created_at
  )
  values (
    'c0000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    v_plan_id,
    'cus_foxyhub_demo',
    'sub_foxyhub_demo',
    null,
    'active',
    now() + interval '22 days',
    'card',
    '{"brand":"visa","last4":"4242","exp_month":11,"exp_year":2029}'::jsonb,
    now() - interval '120 days'
  );
end
$$;

-- ---------------------------------------------------------------------
-- 3. Client companies
--
-- The COMPANY, per `tables/16_clients.sql` — this is what the dashboard
-- labels project rows and approvals with. It is not the same thing as
-- `projects.client_id`, which stays an `auth.users` id and is what the client
-- portal's RLS compares against `auth.uid()`. Nordwave and Lumen have both:
-- the company row here, and a user (Erik / Sofia) who may sign in.
-- ---------------------------------------------------------------------
insert into public.clients (id, org_id, name, contact_name, contact_email, created_at)
values
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   'Nordwave Coffee',  'Erik Lund',     'erik.lund@nordwave.example.com', now() - interval '110 days'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'Orbit Foods',      'Dana Whitfield', 'dana@orbitfoods.example.com',   now() - interval '80 days'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   'Harbor Financial', 'Tomas Reid',     'tomas@harborfin.example.com',   now() - interval '45 days'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   'Lumen Analytics',  'Sofia Marchetti', 'sofia@lumen.example.com',      now() - interval '20 days');

-- ---------------------------------------------------------------------
-- 4. Projects
-- ---------------------------------------------------------------------
insert into public.projects (
  id, org_id, name, client_id, client_org_id, description, status,
  start_date, due_date, created_at, updated_at,
  engagement, contract_value,
  retainer_hours, retainer_period, retainer_amount, retainer_overage,
  override_reason
)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Nordwave Rebrand & Site',
    null,
   '10000000-0000-4000-8000-000000000004',
   'Identity refresh, packaging system and a new marketing site.',
   'in-progress',
   now() - interval '38 days', now() + interval '24 days',
   now() - interval '38 days', now() - interval '2 days',
   'retainer', null,
   40.00, 'monthly', 9000.00, 1.25,
   null),

  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'Orbit Foods Packaging',
   null,
   '30000000-0000-4000-8000-000000000002',
   'Dieline system and shelf-ready artwork for the autumn range.',
   'pending-approval',
   now() - interval '26 days', now() + interval '9 days',
   date_trunc('month', now()), now() - interval '1 day',
   'fixed', 24000.00,
   null, null, null, null,
   null),

  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   'Harbor Financial App',
   null,
   '30000000-0000-4000-8000-000000000003',
   'Design system and onboarding flows for the mobile app.',
   'pending',
   now() - interval '12 days', now() + interval '75 days',
   least(date_trunc('month', now()) + interval '1 day', now()), null,
   'full_time', 48000.00,
   null, null, null, null,
   'Client committed to a fixed launch date; Marcus is double-booked for two sprints with the team''s agreement.'),

  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   'Lumen Analytics Dashboard',
   '10000000-0000-4000-8000-000000000005',
   '30000000-0000-4000-8000-000000000004',
   'Scoping a reporting dashboard — not started.',
   'draft',
   null, now() + interval '110 days',
   now() - interval '6 days', null,
   'part_time', 15000.00,
   null, null, null, null,
   null),

  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   'Nordwave Cafe Signage',
   null,
   '10000000-0000-4000-8000-000000000004',
   'Wayfinding and storefront signage. Shipped.',
   'completed',
   now() - interval '150 days', now() - interval '60 days',
   now() - interval '150 days', now() - interval '58 days',
   'fixed', 11000.00,
   null, null, null, null,
   null),

  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001',
   'Orbit Foods Site Refresh',
   null,
   '30000000-0000-4000-8000-000000000002',
   'Paused at the client''s request pending their Q4 budget.',
   'on-hold',
   now() - interval '70 days', null,
   now() - interval '70 days', now() - interval '30 days',
   'part_time', 18000.00,
   null, null, null, null,
   null);

-- ---------------------------------------------------------------------
-- 5. Milestones
-- ---------------------------------------------------------------------
insert into public.milestones (id, project_id, title, due_date, status, created_at)
values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   'Discovery & audit',        current_date - 30, 'completed',   now() - interval '38 days'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001',
   'Identity direction',       current_date - 18, 'completed',   now() - interval '38 days'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001',
   'Logo suite & guidelines',  current_date - 4,  'completed',   now() - interval '38 days'),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001',
   'Marketing site build',     current_date + 12, 'in_progress', now() - interval '38 days'),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001',
   'Handoff & launch',         current_date + 24, 'pending',     now() - interval '38 days'),

  ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002',
   'Structural dielines',      current_date - 14, 'completed',   now() - interval '26 days'),
  ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002',
   'Illustration set',         current_date - 5,  'completed',   now() - interval '26 days'),
  ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000002',
   'Print-ready artwork',      current_date + 6,  'in_progress', now() - interval '26 days'),
  ('50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000002',
   'Press check',              current_date + 9,  'pending',     now() - interval '26 days'),

  ('50000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000003',
   'Design system foundations', current_date + 20, 'pending',    now() - interval '12 days'),
  ('50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000003',
   'Onboarding flows',          current_date + 45, 'pending',    now() - interval '12 days'),
  ('50000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000003',
   'Handoff to engineering',    current_date + 72, 'pending',    now() - interval '12 days'),

  ('50000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000005',
   'Survey & concepts',        current_date - 120, 'completed',  now() - interval '150 days'),
  ('50000000-0000-4000-8000-000000000014', '40000000-0000-4000-8000-000000000005',
   'Fabrication files',        current_date - 70,  'completed',  now() - interval '150 days');

-- ---------------------------------------------------------------------
-- 6. Team allocations
-- ---------------------------------------------------------------------
insert into public.project_allocations (
  id, project_id, user_id, hours_per_day, days_per_week, rate,
  effective_from, effective_to, created_at
)
values
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 6.80, 5, 145.00,
   current_date - 38, null, now() - interval '38 days'),

  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 5.00, 5, 120.00,
   current_date - 38, null, now() - interval '38 days'),

  ('60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002', 3.20, 5, 120.00,
   current_date - 26, null, now() - interval '26 days'),

  ('60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000003', 4.40, 5, 95.00,
   current_date - 26, null, now() - interval '26 days'),

  ('60000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005',
   '10000000-0000-4000-8000-000000000003', 5.40, 5, 88.00,
   current_date - 150, current_date - 62, now() - interval '150 days');

-- ---------------------------------------------------------------------
-- 7. Deliverables and their assets
-- ---------------------------------------------------------------------
insert into public.deliveries (
  id, project_id, org_id, milestone_id, title, description,
  status, approved_at, due_date, created_at
)
values
  ('70000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003',
   'Logo suite v4', 'Primary, secondary and monogram lockups with clear-space rules.',
   'submitted', null, current_date + 3, now() - interval '9 days'),

  ('70000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
   'Homepage hero', 'Desktop and mobile hero, final art.',
   'approved', now() - interval '2 days', current_date - 3, now() - interval '7 days'),

  ('70000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000008',
   'Packaging dielines', 'Structural dielines for the four SKUs.',
   'submitted', null, current_date + 5, now() - interval '5 days'),

  ('70000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', null,
   'Brand guidelines PDF', 'Full usage guidelines, v1.',
   'submitted', null, current_date + 20, now() - interval '3 days'),

  ('70000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000010',
   'Discovery report', 'Findings from the stakeholder interviews.',
   'pending', null, current_date + 12, now() - interval '2 days'),

  ('70000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
   'Identity direction B', 'Rejected in favour of direction A.',
   'rejected', null, current_date - 20, now() - interval '30 days');

insert into public.delivery_assets (id, delivery_id, file_path)
values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/Logo_Suite_v4.zip'),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/Homepage_hero.png'),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/Packaging_dielines.pdf');

-- ---------------------------------------------------------------------
-- 8. Invoices
-- ---------------------------------------------------------------------
insert into public.invoices (
  id, invoice_number, org_id, project_id, amount, subtotal, tax_amount, currency,
  description, invoice_url, status, payment_intent, created_at, due_date, paid_at
)
values
  ('80000000-0000-4000-8000-000000000001', 'INV-1039',
   '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   5280.00, 4800.00, 480.00, 'USD',
   'Nordwave retainer — previous month.', null,
   'overdue', null, now() - interval '36 days', now() - interval '6 days', null),

  ('80000000-0000-4000-8000-000000000002', 'INV-1041',
   '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
   13200.00, 12000.00, 1200.00, 'USD',
   'Orbit Foods packaging — milestone 2 of 3.', null,
   'due', null, now() - interval '8 days', now() + interval '9 days', null),

  ('80000000-0000-4000-8000-000000000003', 'INV-1042',
   '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005',
   9900.00, 9000.00, 900.00, 'USD',
   'Nordwave cafe signage — final.', null,
   'paid', 'pi_foxyhub_demo_1042', now() - interval '64 days',
   now() - interval '34 days', now() - interval '12 days'),

  ('80000000-0000-4000-8000-000000000004', 'INV-1043',
   '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004',
   3520.00, 3200.00, 320.00, 'USD',
   'Lumen Analytics — discovery phase. Not sent yet.', null,
   'draft', null, now() - interval '4 days', null, null);

-- ---------------------------------------------------------------------
-- 9. Time entries
-- ---------------------------------------------------------------------
insert into public.time_entries (
  id, user_id, project_id, milestone_id, work_date,
  duration_minutes, description, status, created_at
)
values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
   current_date - 2, 210, 'Web design — hero explorations', 'submitted', now() - interval '2 days'),

  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
   current_date - 2, 75, 'Client call — feedback round 2', 'submitted', now() - interval '2 days'),

  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008',
   current_date - 3, 360, 'Component build-out', 'submitted', now() - interval '3 days'),

  ('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003',
   current_date - 9, 480, 'Logo suite production', 'approved', now() - interval '9 days'),

  ('90000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000007',
   current_date - 7, 300, 'Illustration set — final passes', 'approved', now() - interval '7 days'),

  ('90000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000003', null,
   current_date, 120, 'Stakeholder interview notes', 'draft', now() - interval '4 hours'),

  ('90000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
   current_date - 21, 240, 'Identity direction B — revisions', 'rejected', now() - interval '21 days');

-- ---------------------------------------------------------------------
-- 10. Project updates
-- ---------------------------------------------------------------------
insert into public.updates (id, project_id, author_id, body, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   'Logo suite v4 is with Erik for sign-off. Site build starts as soon as it lands — everything else is on track for the launch date.',
   now() - interval '9 days'),

  ('a0000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002',
   'Dielines approved by the printer. Press check is booked for the week after next.',
   now() - interval '5 days'),

  ('a0000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000003',
   'Stakeholder interviews wrapped. Discovery report goes out on Friday.',
   now() - interval '2 days');

-- ---------------------------------------------------------------------
-- 11. Invitation and activity feed
-- ---------------------------------------------------------------------
insert into public.invitations (
  id, org_id, project_id, email, role, token_hash,
  invited_by, created_at, expires_at, accepted_at, accepted_by
)
values (
  'd0000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  null,
  'jules.okafor@example.com',
  'member',
  encode(extensions.digest('foxy-demo-invite-0001', 'sha256'), 'hex'),
  '10000000-0000-4000-8000-000000000001',
  now() - interval '2 days',
  now() + interval '5 days',
  null,
  null
);

insert into public.activity_events (
  id, org_id, actor_id, actor_kind, type, summary,
  project_id, entity_type, entity_id, payload, created_at
)
values
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000004', 'client', 'delivery_approved',
   'Erik Lund approved Homepage_hero.png',
   '40000000-0000-4000-8000-000000000001', 'delivery', '70000000-0000-4000-8000-000000000002',
   '{"file_name":"Homepage_hero.png"}'::jsonb, now() - interval '2 days'),

  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   null, 'system', 'invoice_paid',
   'INV-1042 was paid — $9,900.00',
   '40000000-0000-4000-8000-000000000005', 'invoice', '80000000-0000-4000-8000-000000000003',
   '{"invoice_number":"INV-1042","amount_cents":990000,"currency":"USD"}'::jsonb,
   now() - interval '12 days'),

  ('b0000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'member', 'update_posted',
   'Marcus Lee posted an update on Orbit Foods Packaging',
   '40000000-0000-4000-8000-000000000002', 'update', 'a0000000-0000-4000-8000-000000000002',
   '{}'::jsonb, now() - interval '5 days'),

  ('b0000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'member', 'asset_uploaded',
   'Priya Nair uploaded Logo_Suite_v4.zip to Nordwave Rebrand & Site',
   '40000000-0000-4000-8000-000000000001', 'delivery_asset', '71000000-0000-4000-8000-000000000001',
   '{"file_name":"Logo_Suite_v4.zip"}'::jsonb, now() - interval '9 days'),

  ('b0000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'member', 'member_invited',
   'Priya Nair invited jules.okafor@example.com as a Member',
   null, 'invitation', 'd0000000-0000-4000-8000-000000000001',
   '{"email":"jules.okafor@example.com","role":"member"}'::jsonb, now() - interval '2 days'),

  ('b0000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000003', 'member', 'project_created',
   'Ana Torres created Harbor Financial App',
   '40000000-0000-4000-8000-000000000003', 'project', '40000000-0000-4000-8000-000000000003',
   '{}'::jsonb, now() - interval '12 days'),

  ('b0000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000004', 'client', 'delivery_submitted',
   'Logo suite v4 was sent to Nordwave Coffee for sign-off',
   '40000000-0000-4000-8000-000000000001', 'delivery', '70000000-0000-4000-8000-000000000001',
   '{}'::jsonb, now() - interval '9 days');

-- ---------------------------------------------------------------------
-- 12. (No trigger to restore — see section 1.)
-- ---------------------------------------------------------------------

-- A short receipt, so a run that inserted nothing is obvious rather than quiet.
do $$
declare
  v_org uuid := '20000000-0000-4000-8000-000000000001';
begin
  raise notice 'foxy-hub seed: % staff + % client, % projects (% open), % deliverables (% awaiting sign-off), % invoices, % time entries, % activity events',
    (select count(*) from public.memberships where org_id = v_org and role <> 'client'),
    (select count(*) from public.memberships where org_id = v_org and role  = 'client'),
    (select count(*) from public.projects    where org_id = v_org),
    (select count(*) from public.projects    where org_id = v_org
       and status in ('draft', 'pending', 'in-progress', 'pending-approval')),
    (select count(*) from public.deliveries  where org_id = v_org),
    (select count(*) from public.deliveries  where org_id = v_org and status = 'submitted'),
    (select count(*) from public.invoices    where org_id = v_org),
    (select count(*) from public.time_entries te
       join public.projects p on p.id = te.project_id where p.org_id = v_org),
    (select count(*) from public.activity_events where org_id = v_org);
end
$$;