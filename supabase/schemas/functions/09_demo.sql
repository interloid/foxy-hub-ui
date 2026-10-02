-- =====================================================================
-- The shared demo workspace: detecting it, guarding its writes, and the hourly reset.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
-- =====================================================================

-- Whether an org is the shared demo workspace. The demo guards (triggers, storage policy,
-- the hourly reset) all ask this one question, so "which org is the demo" lives in one
-- place: `organizations.is_demo`.
create or replace function public.is_demo_org(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select o.is_demo from public.organizations o where o.id = target_org_id),
    false
  );
$$;

-- Whether someone is an active member of a demo workspace - the database's version of the
-- app's `isDemoUser()`. For rows that belong to a person rather than an org (profiles,
-- storage uploads).
create or replace function public.is_demo_member(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = target_user_id
       and m.status
       and o.is_demo
  );
$$;

-- True inside the hourly demo reset, which sets `app.demo_reset` for its own transaction
-- only (`set_config(..., true)`). The one way past `guard_demo_writes`. API callers cannot
-- set it: PostgREST exposes no way to change an `app.*` setting.
create or replace function public.demo_reset_running()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.demo_reset', true), '') = 'on';
$$;

-- ---------------------------------------------------------------------
-- Demo workspace guards
--
-- The app refuses these changes for demo visitors already (`demoBlocked()`), but anyone
-- holding the shared demo login can call PostgREST directly. These are the same rules at
-- the table, for every writer - including the signup trigger, so the seeded invitation
-- (its token is in the repo) cannot be redeemed into the demo. Everything not listed here
-- stays writable and is put back by the hourly reset.
-- ---------------------------------------------------------------------
create or replace function public.guard_demo_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked boolean := false;
begin
  if public.demo_reset_running() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'organizations' then
    -- Any workspace: the flag is what switches every other guard on, so no API caller
    -- may flip it. SQL run without a user (editor, migrations) still can.
    if tg_op = 'UPDATE'
       and new.is_demo is distinct from old.is_demo
       and (select auth.uid()) is not null then
      v_blocked := true;
    -- The name, URL and owner are what every visitor sees and signs in through; the logo
    -- and website are links shown to all of them.
    elsif old.is_demo and (
      tg_op = 'DELETE'
      or new.name        is distinct from old.name
      or new.slug        is distinct from old.slug
      or new.user_id     is distinct from old.user_id
      or new.logo_url    is distinct from old.logo_url
      or new.website_url is distinct from old.website_url
    ) then
      v_blocked := true;
    end if;

  elsif tg_table_name = 'memberships' then
    -- Each demo login must stay in its role: no one joins, leaves, moves or changes role.
    -- Job titles stay editable.
    if public.is_demo_org(coalesce(new.org_id, old.org_id)) and (
      tg_op in ('INSERT', 'DELETE')
      or new.role    is distinct from old.role
      or new.status  is distinct from old.status
      or new.user_id is distinct from old.user_id
      or new.org_id  is distinct from old.org_id
    ) then
      v_blocked := true;
    end if;

  elsif tg_table_name = 'invitations' then
    -- An invitation is an email to a real address.
    v_blocked := public.is_demo_org(new.org_id);

  elsif tg_table_name = 'clients' then
    -- Deactivating a client cuts the demo client login off from the portal.
    v_blocked := public.is_demo_org(new.org_id)
      and new.status is distinct from old.status;

  elsif tg_table_name = 'invoices' then
    -- The portal sends the client to `invoice_url` to pay; a planted link would reach
    -- the next visitor. The Stripe ids only ever come from Stripe.
    v_blocked := public.is_demo_org(new.org_id) and (
      tg_op = 'INSERT' and (new.invoice_url is not null or new.stripe_invoice_id is not null)
      or tg_op = 'UPDATE' and (
        new.invoice_url       is distinct from old.invoice_url
        or new.stripe_invoice_id is distinct from old.stripe_invoice_id
      )
    );

  elsif tg_table_name = 'profiles' then
    -- Uploads are off in the demo; an avatar_url pointing anywhere else would be shown
    -- to every visitor.
    v_blocked := new.avatar_url is distinct from old.avatar_url
      and public.is_demo_member(new.id);
  end if;

  if v_blocked then
    raise exception 'Disabled in the demo.' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Demo workspace reset (hourly, pg_cron job `demo-reset`)
--
-- Puts "Foxy Studio" back exactly as seeded: every row visitors added, changed or removed
-- in the workspace is replaced, and the six demo logins get their email, password, name
-- and settings back, with any 2FA factor removed. Visitors are NOT signed out - their
-- sessions survive and simply see fresh data.
--
-- The data is 20260922102823_seed_data.sql's, plus Sofia Reyes (manager, from
-- 20260929130814_mark_demo_org.sql) with work of her own. Dates are relative to now(), so
-- "due this week" stays true on every run.
--
-- Does nothing unless the demo workspace already exists, so it can never create one in a
-- database that was not seeded. Server-only: execute is revoked from the API roles in
-- grants/grants.sql.
-- ---------------------------------------------------------------------
create or replace function public.reset_demo_org()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid := '20000000-0000-4000-8000-000000000001';
  v_password text := 'FoxyDemo!2345';
  v_users    uuid[] := array[
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006'
  ]::uuid[];
  v_plan_id  uuid;
begin
  if not exists (select 1 from public.organizations where id = v_org and is_demo) then
    raise notice 'reset_demo_org: no demo workspace here - nothing to reset.';
    return;
  end if;

  select id into v_plan_id
    from public.plans
   where name = 'Studio' and duration_months = 1 and is_active
   limit 1;
  if v_plan_id is null then
    raise exception 'reset_demo_org: no active Studio/monthly plan.';
  end if;

  -- Lets this transaction past guard_demo_writes. Transaction-local, so it ends with it.
  perform set_config('app.demo_reset', 'on', true);

  -- 1. The workspace. Cascades to everything inside it: clients, projects and all their
  --    rows, invoices, invitations, activity, the subscription and payments.
  delete from public.organizations where id = v_org;

  -- 2. The accounts - restored in place rather than re-created, which is what keeps
  --    visitors signed in. Upserts, so a missing account comes back too.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated',
    d.email, extensions.crypt(v_password, extensions.gen_salt('bf')),
    now() - d.joined,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('user_name', d.full_name, 'seed_user', true),
    now() - d.joined, now(), '', '', '', ''
  from (values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'priya.nair@example.com',         'Priya Nair',      interval '120 days'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'marcus.lee@example.com',         'Marcus Lee',      interval '96 days'),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'ana.torres@example.com',         'Ana Torres',      interval '74 days'),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'erik.lund@nordwave.example.com', 'Erik Lund',       interval '40 days'),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'sofia@lumen.example.com',        'Sofia Marchetti', interval '20 days'),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'sofia.reyes@example.com',        'Sofia Reyes',     interval '88 days')
  ) as d(id, email, full_name, joined)
  on conflict (id) do update set
    email                      = excluded.email,
    encrypted_password         = excluded.encrypted_password,
    email_confirmed_at         = excluded.email_confirmed_at,
    raw_app_meta_data          = excluded.raw_app_meta_data,
    -- Also drops the inactivity timeout and password-changed keys the app keeps here.
    raw_user_meta_data         = excluded.raw_user_meta_data,
    updated_at                 = now(),
    confirmation_token         = '',
    recovery_token             = '',
    email_change_token_new     = '',
    email_change_token_current = '',
    email_change               = '',
    banned_until               = null;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  select
    u.id, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email,
                       'email_verified', true, 'phone_verified', false),
    'email', u.id::text, u.created_at, u.created_at, now()
  from auth.users u
  where u.id = any(v_users)
  on conflict (provider_id, provider) do update set
    identity_data = excluded.identity_data,
    updated_at    = now();

  -- 2FA never belongs on a shared login; reset links and codes die with the password.
  delete from auth.mfa_factors     where user_id = any(v_users);
  delete from auth.one_time_tokens where user_id = any(v_users);

  insert into public.profiles (id, full_name, avatar_url)
  values
    ('10000000-0000-4000-8000-000000000001', 'Priya Nair',      null),
    ('10000000-0000-4000-8000-000000000002', 'Marcus Lee',      null),
    ('10000000-0000-4000-8000-000000000003', 'Ana Torres',      null),
    ('10000000-0000-4000-8000-000000000004', 'Erik Lund',       null),
    ('10000000-0000-4000-8000-000000000005', 'Sofia Marchetti', null),
    ('10000000-0000-4000-8000-000000000006', 'Sofia Reyes',     null)
  on conflict (id) do update set
    full_name  = excluded.full_name,
    avatar_url = null;

  -- Theme, language, time zone and digest back to the defaults.
  delete from public.user_preferences where user_id = any(v_users);

  -- 3. The workspace and its team.
  insert into public.organizations (
    id, name, slug, logo_url, website_url, user_id,
    daily_capacity_hours, days_per_week, currency, rounding_minutes, created_at, is_demo
  )
  values (
    v_org, 'Foxy Studio', 'foxy-studio', null, 'https://foxystudio.example.com',
    '10000000-0000-4000-8000-000000000001',
    8, 5, 'USD', 15, now() - interval '120 days', true
  );

  insert into public.memberships (id, user_id, org_id, role, created_at)
  values
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', v_org, 'primary_admin', now() - interval '120 days'),
    ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', v_org, 'admin',         now() - interval '96 days'),
    ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000006', v_org, 'manager',       now() - interval '88 days'),
    ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000003', v_org, 'contributor',   now() - interval '74 days'),
    ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000004', v_org, 'client',        now() - interval '40 days'),
    ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000005', v_org, 'client',        now() - interval '20 days');

  insert into public.subscriptions (
    id, org_id, plan_id, stripe_customer_id, stripe_subscription_id,
    stripe_payment_intent, status, current_period_end,
    payment_method_type, payment_method_details, created_at
  )
  values (
    'c0000000-0000-4000-8000-000000000001', v_org, v_plan_id,
    'cus_foxyhub_demo', 'sub_foxyhub_demo', null, 'active',
    now() + interval '22 days', 'card',
    '{"brand":"visa","last4":"4242","exp_month":11,"exp_year":2029}'::jsonb,
    now() - interval '120 days'
  );

  -- 4. Client companies.
  insert into public.clients (id, org_id, name, contact_name, contact_email, created_at)
  values
    ('10000000-0000-4000-8000-000000000004', v_org, 'Nordwave Coffee',  'Erik Lund',       'erik.lund@nordwave.example.com', now() - interval '110 days'),
    ('30000000-0000-4000-8000-000000000002', v_org, 'Orbit Foods',      'Dana Whitfield',  'dana@orbitfoods.example.com',    now() - interval '80 days'),
    ('30000000-0000-4000-8000-000000000003', v_org, 'Harbor Financial', 'Tomas Reid',      'tomas@harborfin.example.com',    now() - interval '45 days'),
    ('30000000-0000-4000-8000-000000000004', v_org, 'Lumen Analytics',  'Sofia Marchetti', 'sofia@lumen.example.com',        now() - interval '20 days');

  -- 5. Projects.
  insert into public.projects (
    id, org_id, name, client_id, client_org_id, description, status,
    start_date, due_date, created_at, updated_at,
    engagement, contract_value,
    retainer_hours, retainer_period, retainer_amount, retainer_overage,
    override_reason
  )
  values
    ('40000000-0000-4000-8000-000000000001', v_org, 'Nordwave Rebrand & Site', null,
     '10000000-0000-4000-8000-000000000004',
     'Identity refresh, packaging system and a new marketing site.', 'in-progress',
     now() - interval '38 days', now() + interval '24 days',
     now() - interval '38 days', now() - interval '2 days',
     'retainer', null, 40.00, 'monthly', 9000.00, 1.25, null),

    ('40000000-0000-4000-8000-000000000002', v_org, 'Orbit Foods Packaging', null,
     '30000000-0000-4000-8000-000000000002',
     'Dieline system and shelf-ready artwork for the autumn range.', 'pending-approval',
     now() - interval '26 days', now() + interval '9 days',
     date_trunc('month', now()), now() - interval '1 day',
     'fixed', 24000.00, null, null, null, null, null),

    ('40000000-0000-4000-8000-000000000003', v_org, 'Harbor Financial App', null,
     '30000000-0000-4000-8000-000000000003',
     'Design system and onboarding flows for the mobile app.', 'pending',
     now() - interval '12 days', now() + interval '75 days',
     least(date_trunc('month', now()) + interval '1 day', now()), null,
     'budget', 48000.00, null, null, null, null,
     'Client committed to a fixed launch date; Marcus is double-booked for two sprints with the team''s agreement.'),

    ('40000000-0000-4000-8000-000000000004', v_org, 'Lumen Analytics Dashboard',
     '10000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000004',
     'Scoping a reporting dashboard — not started.', 'draft',
     null, now() + interval '110 days', now() - interval '6 days', null,
     'budget', 15000.00, null, null, null, null, null),

    ('40000000-0000-4000-8000-000000000005', v_org, 'Nordwave Cafe Signage', null,
     '10000000-0000-4000-8000-000000000004',
     'Wayfinding and storefront signage. Shipped.', 'completed',
     now() - interval '150 days', now() - interval '60 days',
     now() - interval '150 days', now() - interval '58 days',
     'fixed', 11000.00, null, null, null, null, null),

    ('40000000-0000-4000-8000-000000000006', v_org, 'Orbit Foods Site Refresh', null,
     '30000000-0000-4000-8000-000000000002',
     'Paused at the client''s request pending their Q4 budget.', 'on-hold',
     now() - interval '70 days', null,
     now() - interval '70 days', now() - interval '30 days',
     'budget', 18000.00, null, null, null, null, null);

  -- 6. Milestones.
  insert into public.milestones (id, project_id, title, due_date, status, created_at)
  values
    ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Discovery & audit',         current_date - 30,  'completed',   now() - interval '38 days'),
    ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Identity direction',        current_date - 18,  'completed',   now() - interval '38 days'),
    ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'Logo suite & guidelines',   current_date - 4,   'completed',   now() - interval '38 days'),
    ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'Marketing site build',      current_date + 12,  'in_progress', now() - interval '38 days'),
    ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', 'Handoff & launch',          current_date + 24,  'pending',     now() - interval '38 days'),
    ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', 'Structural dielines',       current_date - 14,  'completed',   now() - interval '26 days'),
    ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002', 'Illustration set',          current_date - 5,   'completed',   now() - interval '26 days'),
    ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000002', 'Print-ready artwork',       current_date + 6,   'in_progress', now() - interval '26 days'),
    ('50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000002', 'Press check',               current_date + 9,   'pending',     now() - interval '26 days'),
    ('50000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000003', 'Design system foundations', current_date + 20,  'pending',     now() - interval '12 days'),
    ('50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000003', 'Onboarding flows',          current_date + 45,  'pending',     now() - interval '12 days'),
    ('50000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000003', 'Handoff to engineering',    current_date + 72,  'pending',     now() - interval '12 days'),
    ('50000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000005', 'Survey & concepts',         current_date - 120, 'completed',   now() - interval '150 days'),
    ('50000000-0000-4000-8000-000000000014', '40000000-0000-4000-8000-000000000005', 'Fabrication files',         current_date - 70,  'completed',   now() - interval '150 days');

  -- 7. Team allocations. The last two are Sofia's, so the manager login has work of its own.
  insert into public.project_allocations (
    id, project_id, user_id, hours_per_day, days_per_week, rate,
    effective_from, effective_to, created_at
  )
  values
    ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 6.80, 5, 145.00, current_date - 38,  null,              now() - interval '38 days'),
    ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 5.00, 5, 120.00, current_date - 38,  null,              now() - interval '38 days'),
    ('60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 3.20, 5, 120.00, current_date - 26,  null,              now() - interval '26 days'),
    ('60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 4.40, 5,  95.00, current_date - 26,  null,              now() - interval '26 days'),
    ('60000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 5.40, 5,  88.00, current_date - 150, current_date - 62, now() - interval '150 days'),
    ('60000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 4.00, 5, 110.00, current_date - 12,  null,              now() - interval '12 days'),
    ('60000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', 2.00, 5, 110.00, current_date - 26,  null,              now() - interval '26 days');

  -- 8. Deliverables and their assets (the files are placeholders; nothing is in storage).
  insert into public.deliveries (
    id, project_id, org_id, milestone_id, title, description,
    status, approved_at, due_date, created_at
  )
  values
    ('70000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', v_org, '50000000-0000-4000-8000-000000000003',
     'Logo suite v4', 'Primary, secondary and monogram lockups with clear-space rules.',
     'submitted', null, current_date + 3, now() - interval '9 days'),
    ('70000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', v_org, '50000000-0000-4000-8000-000000000004',
     'Homepage hero', 'Desktop and mobile hero, final art.',
     'approved', now() - interval '2 days', current_date - 3, now() - interval '7 days'),
    ('70000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', v_org, '50000000-0000-4000-8000-000000000008',
     'Packaging dielines', 'Structural dielines for the four SKUs.',
     'submitted', null, current_date + 5, now() - interval '5 days'),
    ('70000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', v_org, null,
     'Brand guidelines PDF', 'Full usage guidelines, v1.',
     'submitted', null, current_date + 20, now() - interval '3 days'),
    ('70000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003', v_org, '50000000-0000-4000-8000-000000000010',
     'Discovery report', 'Findings from the stakeholder interviews.',
     'pending', null, current_date + 12, now() - interval '2 days'),
    ('70000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', v_org, '50000000-0000-4000-8000-000000000002',
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

  -- 9. Invoices.
  insert into public.invoices (
    id, invoice_number, org_id, project_id, amount, subtotal, tax_amount, currency,
    description, invoice_url, status, payment_intent, created_at, due_date, paid_at
  )
  values
    ('80000000-0000-4000-8000-000000000001', 'INV-1039', v_org, '40000000-0000-4000-8000-000000000001',
     5280.00, 4800.00, 480.00, 'USD', 'Nordwave retainer — previous month.', null,
     'overdue', null, now() - interval '36 days', now() - interval '6 days', null),
    ('80000000-0000-4000-8000-000000000002', 'INV-1041', v_org, '40000000-0000-4000-8000-000000000002',
     13200.00, 12000.00, 1200.00, 'USD', 'Orbit Foods packaging — milestone 2 of 3.', null,
     'due', null, now() - interval '8 days', now() + interval '9 days', null),
    ('80000000-0000-4000-8000-000000000003', 'INV-1042', v_org, '40000000-0000-4000-8000-000000000005',
     9900.00, 9000.00, 900.00, 'USD', 'Nordwave cafe signage — final.', null,
     'paid', 'pi_foxyhub_demo_1042', now() - interval '64 days',
     now() - interval '34 days', now() - interval '12 days'),
    ('80000000-0000-4000-8000-000000000004', 'INV-1043', v_org, '40000000-0000-4000-8000-000000000004',
     3520.00, 3200.00, 320.00, 'USD', 'Lumen Analytics — discovery phase. Not sent yet.', null,
     'draft', null, now() - interval '4 days', null, null);

  -- 10. Time entries. The last three are Sofia's.
  insert into public.time_entries (
    id, user_id, project_id, milestone_id, work_date,
    duration_minutes, description, status, created_at
  )
  values
    ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
     current_date - 2,  210, 'Web design — hero explorations',       'submitted', now() - interval '2 days'),
    ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
     current_date - 2,   75, 'Client call — feedback round 2',       'submitted', now() - interval '2 days'),
    ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008',
     current_date - 3,  360, 'Component build-out',                  'submitted', now() - interval '3 days'),
    ('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003',
     current_date - 9,  480, 'Logo suite production',                'approved',  now() - interval '9 days'),
    ('90000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000007',
     current_date - 7,  300, 'Illustration set — final passes',      'approved',  now() - interval '7 days'),
    ('90000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', null,
     current_date,      120, 'Stakeholder interview notes',          'draft',     now() - interval '4 hours'),
    ('90000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
     current_date - 21, 240, 'Identity direction B — revisions',     'rejected',  now() - interval '21 days'),
    ('90000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000010',
     current_date - 10, 180, 'Kickoff workshop with Harbor',          'approved',  now() - interval '10 days'),
    ('90000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008',
     current_date - 4,   90, 'Print vendor coordination',             'submitted', now() - interval '4 days'),
    ('90000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000010',
     current_date - 1,   60, 'Sprint planning',                       'draft',     now() - interval '1 day');

  -- 11. Project updates. The last is Sofia's.
  insert into public.updates (id, project_id, author_id, body, created_at)
  values
    ('a0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
     'Logo suite v4 is with Erik for sign-off. Site build starts as soon as it lands — everything else is on track for the launch date.',
     now() - interval '9 days'),
    ('a0000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
     'Dielines approved by the printer. Press check is booked for the week after next.',
     now() - interval '5 days'),
    ('a0000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003',
     'Stakeholder interviews wrapped. Discovery report goes out on Friday.',
     now() - interval '2 days'),
    ('a0000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006',
     'Kickoff done and the sprint plan is agreed with Harbor. Design system foundations start this week.',
     now() - interval '1 day');

  -- 12. The pending invitation and the activity feed.
  insert into public.invitations (
    id, org_id, project_id, email, role, token_hash,
    invited_by, created_at, expires_at, accepted_at, accepted_by
  )
  values (
    'd0000000-0000-4000-8000-000000000001', v_org, null,
    'jules.okafor@example.com', 'contributor',
    encode(extensions.digest('foxy-demo-invite-0001', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000001',
    now() - interval '2 days', now() + interval '5 days', null, null
  );

  -- `actor_kind` is its own enum ('system' | 'client' | 'member'); 'member' is right here.
  insert into public.activity_events (
    id, org_id, actor_id, actor_kind, type, summary,
    project_id, entity_type, entity_id, payload, created_at
  )
  values
    ('b0000000-0000-4000-8000-000000000001', v_org, '10000000-0000-4000-8000-000000000004', 'client', 'delivery_approved',
     'Erik Lund approved Homepage_hero.png',
     '40000000-0000-4000-8000-000000000001', 'delivery', '70000000-0000-4000-8000-000000000002',
     '{"file_name":"Homepage_hero.png"}'::jsonb, now() - interval '2 days'),
    ('b0000000-0000-4000-8000-000000000002', v_org, null, 'system', 'invoice_paid',
     'INV-1042 was paid — $9,900.00',
     '40000000-0000-4000-8000-000000000005', 'invoice', '80000000-0000-4000-8000-000000000003',
     '{"invoice_number":"INV-1042","amount_cents":990000,"currency":"USD"}'::jsonb, now() - interval '12 days'),
    ('b0000000-0000-4000-8000-000000000003', v_org, '10000000-0000-4000-8000-000000000002', 'member', 'update_posted',
     'Marcus Lee posted an update on Orbit Foods Packaging',
     '40000000-0000-4000-8000-000000000002', 'update', 'a0000000-0000-4000-8000-000000000002',
     '{}'::jsonb, now() - interval '5 days'),
    ('b0000000-0000-4000-8000-000000000004', v_org, '10000000-0000-4000-8000-000000000001', 'member', 'asset_uploaded',
     'Priya Nair uploaded Logo_Suite_v4.zip to Nordwave Rebrand & Site',
     '40000000-0000-4000-8000-000000000001', 'delivery_asset', '71000000-0000-4000-8000-000000000001',
     '{"file_name":"Logo_Suite_v4.zip"}'::jsonb, now() - interval '9 days'),
    ('b0000000-0000-4000-8000-000000000005', v_org, '10000000-0000-4000-8000-000000000001', 'member', 'member_invited',
     'Priya Nair invited jules.okafor@example.com as a Member',
     null, 'invitation', 'd0000000-0000-4000-8000-000000000001',
     '{"email":"jules.okafor@example.com","role":"member"}'::jsonb, now() - interval '2 days'),
    ('b0000000-0000-4000-8000-000000000006', v_org, '10000000-0000-4000-8000-000000000003', 'member', 'project_created',
     'Ana Torres created Harbor Financial App',
     '40000000-0000-4000-8000-000000000003', 'project', '40000000-0000-4000-8000-000000000003',
     '{}'::jsonb, now() - interval '12 days'),
    ('b0000000-0000-4000-8000-000000000007', v_org, '10000000-0000-4000-8000-000000000004', 'client', 'delivery_submitted',
     'Logo suite v4 was sent to Nordwave Coffee for sign-off',
     '40000000-0000-4000-8000-000000000001', 'delivery', '70000000-0000-4000-8000-000000000001',
     '{}'::jsonb, now() - interval '9 days'),
    ('b0000000-0000-4000-8000-000000000008', v_org, '10000000-0000-4000-8000-000000000006', 'member', 'update_posted',
     'Sofia Reyes posted an update on Harbor Financial App',
     '40000000-0000-4000-8000-000000000003', 'update', 'a0000000-0000-4000-8000-000000000004',
     '{}'::jsonb, now() - interval '1 day');

  -- set_config(..., true) lasts until the end of the TRANSACTION, not this function, so the
  -- guards are switched back on for anything that runs after it in the same one.
  perform set_config('app.demo_reset', '', true);
end;
$$;
