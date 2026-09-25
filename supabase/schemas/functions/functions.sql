-- =====================================================================
-- SECURITY DEFINER functions
-- All must set search_path = '' and fully qualify every reference.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Time entry: submit (draft → submitted)
-- ---------------------------------------------------------------------
create or replace function public.submit_time_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Two-factor: an aal1 session of a user with 2FA may not act (see mfa_satisfied).
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.time_entries
    where id = entry_id
      and user_id = auth.uid()
      and status = 'draft'
  ) then
    update public.time_entries
       set status = 'submitted'
     where id = entry_id;
  else
    raise exception 'Not authorized or entry is not in draft state';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Time entry: approve (submitted → approved, primary admin / admin / manager)
-- ---------------------------------------------------------------------
create or replace function public.approve_time_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Primary admins, admins AND managers may approve. The old join was on
  -- `organizations.user_id` — the org's
  -- single creator — so a user with the `admin` role could not approve anything, even
  -- though approvals are an Admin-dashboard action in the design.
  if exists (
    select 1
    from public.time_entries te
    join public.projects p on te.project_id = p.id
    where te.id     = entry_id
      and te.status = 'submitted'
      and public.has_org_role(
        p.org_id,
        array['primary_admin', 'admin', 'manager']::public.user_role[]
      )
  ) then
    update public.time_entries
       set status = 'approved'
     where id = entry_id;
  else
    raise exception 'Not authorized to approve this entry';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Time entry: reject (submitted → rejected, primary admin / admin / manager)
-- ---------------------------------------------------------------------
create or replace function public.reject_time_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.time_entries te
    join public.projects p on te.project_id = p.id
    where te.id     = entry_id
      and te.status = 'submitted'
      and public.has_org_role(
        p.org_id,
        array['primary_admin', 'admin', 'manager']::public.user_role[]
      )
  ) then
    update public.time_entries
       set status = 'rejected'
     where id = entry_id;
  else
    raise exception 'Not authorized to reject this entry';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Delivery: client marks status + auto-approve deliverable
-- ---------------------------------------------------------------------
create or replace function public.update_delivery_status(
  p_status      public.delivery_status,
  p_delivery_id uuid,
  p_project_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Two-factor: an aal1 session of a user with 2FA may not act (see mfa_satisfied).
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;

  -- The caller must be the client OF THIS PROJECT, not merely a client somewhere in the
  -- org. The previous test was `memberships.role = 'client'` for the delivery's org, which
  -- let any one of an agency's clients change the status of every other client's
  --   — the write-side twin of the read leak fixed in `06_rls_deliveries`.
  -- Scoping the SELECT alone would have left this open, since a caller only needs the id.
  --
  -- `p_project_id` is now actually used: it was accepted and ignored, so a caller could
  -- pass anything. Requiring it to match the delivery's own project makes a mismatched
  -- pair fail instead of silently succeeding.
  update public.deliveries
     set status      = p_status,
         approved_at = case when p_status = 'approved' then now() else null end
   where id = p_delivery_id
     and deliveries.project_id = p_project_id
     and exists (
       select 1 from public.projects p
       where p.id        = deliveries.project_id
         and p.client_id = auth.uid()
     );

  if not found then
    raise exception 'Not authorized to update this delivery';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Auth trigger: new user signup
-- Runs on INSERT into auth.users. Redeems an invitation, OR creates a
-- fresh org + membership + subscription for a new primary admin.
--
-- SECURITY — this function must never derive org_id, role or project_id
-- from `raw_user_meta_data`. That field is whatever the caller passed to
-- signUp({ options: { data } }); it is an INPUT, not a claim the backend
-- made. The previous version read all three from it, so anyone could
-- register with { org_id: <any org>, role: 'admin' } and land inside
-- another tenant with full RLS rights — every policy in schemas/policies
-- keys off `memberships`, so forging one membership row inherits the lot.
--
-- The only field trusted here is `invite_token`, and it is trusted as a
-- BEARER SECRET rather than an assertion: holding it is the proof. Org,
-- role and project are read off the `public.invitations` row a primary
-- admin, admin or manager created. See `schemas/tables/15_invitations.sql`.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_user_id     uuid := new.id;
  v_plan_id     uuid;
  v_token       text := nullif(new.raw_user_meta_data->>'invite_token', '');
  v_user_name   text := new.raw_user_meta_data->>'user_name';
  v_invite      public.invitations%rowtype;
  v_org_name    text;
  v_slug        text;
begin
  IF COALESCE(NEW.raw_user_meta_data->>'seed_user', 'false') = 'true' THEN
    RETURN NEW;
  END IF;
  insert into public.profiles (id, full_name)
  values (v_user_id, v_user_name);

  if v_token is not null then
    -- ---- Invited user path ------------------------------------------------
    -- `digest` comes from pgcrypto, installed into the extensions schema, so it
    -- must be qualified: search_path is '' and nothing but pg_catalog resolves.
    --
    -- FOR UPDATE locks the row for this transaction, so two signups racing on the
    -- same token cannot both redeem it — the second blocks, then fails the
    -- accepted_at check below.
    select * into v_invite
      from public.invitations
     where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
       for update;

    -- Every branch fails CLOSED. This trigger is AFTER INSERT on auth.users, so a
    -- raise rolls the whole signup back and no account is created.
    if not found then
      raise exception 'Invalid invitation token' using errcode = '22023';
    end if;

    if v_invite.accepted_at is not null then
      raise exception 'This invitation has already been used' using errcode = '22023';
    end if;

    if v_invite.expires_at <= now() then
      raise exception 'This invitation has expired' using errcode = '22023';
    end if;

    -- Binds the token to one address, so a forwarded or intercepted link cannot be
    -- redeemed by a different account.
    if lower(v_invite.email) <> lower(coalesce(new.email, '')) then
      raise exception 'This invitation was issued to a different email address'
        using errcode = '22023';
    end if;

    -- org_id and role come from the INVITATION, never from the payload. No text cast
    -- either: v_invite.role is already public.user_role, and the table's check
    -- constraint forbids 'primary_admin'. 'manager' IS invitable.
    insert into public.memberships (user_id, org_id, role, job_title)
    values (v_user_id, v_invite.org_id, v_invite.role, v_invite.job_title);

    if v_invite.role = 'client' then
      -- The composite FK on invitations already guarantees this project belongs to
      -- v_invite.org_id, so there is no way to point a client at another org's work.
      update public.projects
         set client_id = v_user_id
       where id = v_invite.project_id;
    end if;

    update public.invitations
       set accepted_at = now(),
           accepted_by = v_user_id
     where id = v_invite.id;

  else
    -- ---- New primary-admin path ------------------------------------------
    -- org_name and slug are user-supplied, and that is safe: this user is creating
    -- their OWN new organisation and becoming its primary admin. There is no existing tenant
    -- to escalate into. Contrast the invited path above, where org and role must come
    -- from an invitation precisely because they name someone else's tenant.
    --
    -- They are VALIDATED, though. `organizations.name` and `slug` are NOT NULL, but a
    -- constraint violation here surfaces as an opaque 500 from the auth endpoint; these
    -- checks fail with a message the wizard can show. Signup rolls back either way —
    -- this is an AFTER INSERT trigger on auth.users.
    v_org_name := nullif(trim(new.raw_user_meta_data->>'org_name'), '');
    v_slug     := lower(nullif(trim(new.raw_user_meta_data->>'slug'), ''));

    if v_org_name is null then
      raise exception 'An organisation name is required' using errcode = '22023';
    end if;

    if v_slug is null then
      raise exception 'A workspace URL is required' using errcode = '22023';
    end if;

    -- Checked explicitly so a taken slug reads as a taken slug rather than as
    -- "organizations_slug_key violated". `is_slug_available` is the same function the
    -- wizard calls on step 1; this is the authoritative re-check at write time, since
    -- anything can change between the two.
    if not public.is_slug_available(v_slug) then
      raise exception 'That workspace URL is already taken' using errcode = '22023';
    end if;

    -- The subscription every new workspace starts on, before any plan is chosen.
    -- 'Free' must therefore always exist as an active row — see
    -- migrations/20260807150000_reseed_design_plans.sql, which keeps it for this reason.
    select id into v_plan_id
      from public.plans
     where name = 'Free'
     limit 1;

    insert into public.organizations (name, slug, user_id)
    values (v_org_name, v_slug, v_user_id)
    returning id into v_org_id;

    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_org_id, 'primary_admin');

    insert into public.subscriptions (plan_id, org_id)
    values (v_plan_id, v_org_id);
  end if;

  return new;
end;
$$;

-- `public.handle_new_user_membership` was DROPPED here, deliberately.
--
-- It carried the same flaw as the function above — inserting a membership from
-- `raw_user_meta_data->>'org_id'` and `->>'role'` — and then copied both into
-- `raw_app_meta_data`, the field applications normally treat as trustworthy because
-- users cannot write it. Nothing referenced it (`auth_trigger.sql` points at
-- handle_new_user_signup), but it was a live SECURITY DEFINER function, so wiring it
-- up would have been a one-line privilege escalation. Removing it from this file is
-- what makes `supabase db diff` emit the DROP.

-- ---------------------------------------------------------------------
-- Workspace URL availability
--
-- The onboard wizard asks for a workspace slug on step 1 and cannot
-- validate it: `organizations` has no anon SELECT policy (and no INSERT
-- policy at all — only the signup trigger creates orgs), so a signed-out
-- visitor cannot see whether a slug is taken. Without this the user fills
-- all four steps, presses Launch, and gets a raw unique-violation on
-- `organizations_slug_key` as a 500 at the very last moment.
--
-- SECURITY DEFINER so it can see past RLS, but it returns ONLY a boolean.
-- It never exposes which org holds a slug, or that any org exists — the
-- caller learns exactly one bit, which is the minimum the form needs.
-- ---------------------------------------------------------------------
create or replace function public.is_slug_available(candidate text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.organizations
    where lower(slug) = lower(trim(candidate))
  );
$$;

-- Signed-out visitors are the ones filling this form, so anon needs it too.
grant execute on function public.is_slug_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS helpers
-- These run as postgres (SECURITY DEFINER), bypassing RLS on memberships
-- when called from within a memberships policy. This prevents infinite
-- recursion.
-- ---------------------------------------------------------------------

-- `status` is filtered in all three. Every policy in schemas/policies keys off one of
-- these, so a deactivated membership stops granting access everywhere at once rather
-- than each policy having to remember the check.
-- ---------------------------------------------------------------------
-- Two-factor gate for the database
--
-- True when this request may act on data: the session passed the code
-- (`aal2`), or the user has no verified authenticator at all. False only
-- for an aal1 session of a user WITH 2FA — someone holding the password
-- but not the phone, who could otherwise skip the app's code page and
-- call the API directly with the public anon key.
--
-- Used three ways: the restrictive `require_mfa_when_enrolled` policy on
-- every table, the membership helpers below (so every RPC that authorises
-- through them is covered), and an explicit guard in the few definer
-- functions that only check auth.uid().
--
-- SECURITY DEFINER because auth.mfa_factors is not readable by the API
-- roles. No uid (anon, service_role) → no factors → true.
-- ---------------------------------------------------------------------
create or replace function public.mfa_satisfied()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

create or replace function public.current_user_orgs()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.memberships
  where user_id = auth.uid() and status
    and public.mfa_satisfied();
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id and status
  ) and public.mfa_satisfied();
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.user_role[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id  = target_org_id
      and role    = any(allowed_roles)
      and status
  ) and public.mfa_satisfied();
$$;

-- ---------------------------------------------------------------------
-- Project & Allocation Creation (Atomic RPC)
-- ---------------------------------------------------------------------
create or replace function public.create_project_with_allocations(
  project_data jsonb,
  allocations_data jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_alloc      jsonb;
  v_org_id     uuid;
begin
  v_org_id := (project_data->>'org_id')::uuid;

  -- 1. Authorization check: caller must be a primary admin, admin or manager of the org
  if not public.has_org_role(v_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]) then
    raise exception 'Not authorized to create projects for this organization' using errcode = '42501';
  end if;

  -- 2. Insert Project
  insert into public.projects (
    org_id,
    name,
    due_date,
    engagement,
    client_id,
    client_org_id,
    contract_value,
    estimated_hours,
    retainer_hours,
    retainer_period,
    retainer_amount,
    retainer_overage,
    description,
    override_reason,
    start_from,
    status,
    created_by
  )
  values (
    v_org_id,
    project_data->>'name',
    nullif(project_data->>'due_date', '')::timestamptz,
    nullif(project_data->>'engagement', '')::public.engagement_model,
    nullif(project_data->>'client_id', '')::uuid,
    -- The COMPANY the work is for. The New project panel's dropdown lists `clients` rows, and
    -- the action wrote that id into `client_id` — a column pointing at `auth.users` — so the
    -- insert failed its foreign key whenever a client was selected. `client_id` stays what it
    -- always was: the client's LOGIN, set by `handle_new_user_signup` when they accept an
    -- invitation, and null until then.
    nullif(project_data->>'client_org_id', '')::uuid,
    nullif(project_data->>'contract_value', '')::numeric,
    nullif(project_data->>'estimated_hours', '')::numeric,
    nullif(project_data->>'retainer_hours', '')::numeric,
    nullif(project_data->>'retainer_period', '')::public.retainer_period,
    nullif(project_data->>'retainer_amount', '')::numeric,
    nullif(project_data->>'retainer_overage', '')::numeric,
    project_data->>'description',
    project_data->>'override_reason',
    coalesce(project_data->>'start_from', 'blank'),
    coalesce(nullif(project_data->>'status', '')::public.project_status, 'pending'::public.project_status),
    -- Never from project_data: the creator is who is calling, not who they say.
    auth.uid()
  )
  
  returning id into v_project_id;

  -- 3. Insert Allocations (if any provided)
  if jsonb_array_length(allocations_data) > 0 then
    for v_alloc in select * from jsonb_array_elements(allocations_data)
    loop
      insert into public.project_allocations (
        project_id,
        user_id,
        hours_per_day,
        days_per_week,
        rate,
        cost_rate,
        effective_from
      )
      values (
        v_project_id,
        (v_alloc->>'user_id')::uuid,
        (v_alloc->>'hours_per_day')::numeric,
        (v_alloc->>'days_per_week')::numeric,
        nullif(v_alloc->>'rate', '')::numeric,
        -- Cost is snapshotted HERE rather than sent by the caller. It is an internal figure,
        -- so it has no reason to travel to a browser and back, and reading it at insert time
        -- is what freezes it: a later raise changes `memberships.cost_rate` and leaves every
        -- allocation already booked at the cost it was actually booked at.
        (
          select m.cost_rate
          from public.memberships m
          where m.user_id = (v_alloc->>'user_id')::uuid
            and m.org_id  = v_org_id
        ),
        nullif(v_alloc->>'effective_from', '')::date
      );
    end loop;
  end if;

  return v_project_id;
end;
$$;

-- Grant execution permission to authenticated users (role authorization happens inside the function)
grant execute on function public.create_project_with_allocations(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Invoice: create and claim the hours it bills, in one transaction
-- ---------------------------------------------------------------------
--
-- The two writes MUST be atomic. An invoice that inserts but fails to stamp its entries
-- leaves those hours looking unbilled, and next month's invoice bills them a second time —
-- which is the exact bug `time_entries.invoice_id` was added to close. Doing it from the
-- action as two round trips reintroduces it on any error between them.
--
-- SECURITY DEFINER is required, not preferred: `09_rls_time_entries` lets a user update only
-- their OWN entries and only while they are `draft`. Stamping an approved entry that belongs
-- to a teammate is impossible under that policy, so the role check happens here instead —
-- the same shape as `approve_time_entry` and `create_project_with_allocations`.
--
-- Lines travel INSIDE `invoice_data` rather than as a third parameter. `create or replace`
-- cannot change a function's signature — it would define an overload and leave the old
-- two-argument version behind, which PostgREST then has to disambiguate. Keeping the
-- signature stable means this file replaces the function it already declared.
create or replace function public.create_invoice_with_entries(
  invoice_data jsonb,
  entry_ids    uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_line       jsonb;
  v_sort       smallint := 0;
  v_org_id     uuid;
  v_project_id uuid;
  v_engagement public.engagement_model;
  v_period     date;
  v_year       text;
  v_seq        int;
  v_number     text;
  v_claimed    int;
  v_fixed_count int;
  v_status      public.project_status;
begin
  v_org_id     := (invoice_data->>'org_id')::uuid;
  v_project_id := (invoice_data->>'project_id')::uuid;
  v_period     := nullif(invoice_data->>'period_start', '')::date;

  -- 1. Authorization: only primary admins and admins bill. `manager` is deliberately absent —
  --    billing is the one thing that role does not do. See schemas/types/types.sql.
  if not public.has_org_role(v_org_id, array['primary_admin', 'admin']::public.user_role[]) then
    raise exception 'Not authorized to create invoices for this organization' using errcode = '42501';
  end if;

  -- 2. The project must belong to the org the caller is billing under, and its engagement model
  --    decides which double-billing guard applies below. Read from the table rather than trusted
  --    from the payload, since without the org check a caller who administers org A could raise
  --    an invoice against org B's project by passing its id.
  select p.engagement into v_engagement
    from public.projects p
   where p.id = v_project_id and p.org_id = v_org_id;

  if v_engagement is null then
    raise exception 'Project does not belong to this organization' using errcode = '42501';
  end if;

  -- 3. Period guard for retainers. `invoices_project_period_key` enforces this too, but reaching
  --    it surfaces a unique-violation; this raises something a user can read.
  if v_period is not null and exists (
    select 1 from public.invoices i
    where i.project_id = v_project_id and i.period_start = v_period
  ) then
    raise exception 'This project is already invoiced for the period starting %', v_period
      using errcode = '23505';
  end if;

  -- 4. Fixed-price guard. A fixed engagement bills in exactly two stages rather than one flat
  --    fee: half once the project reaches `in-progress`, the remaining half once it reaches
  --    `pending-approval`. Capped at two invoices total, and each stage can only be raised while
  --    the project is actually at that stage — read from the table rather than trusted from the
  --    payload, so a stale client can't submit the wrong half out of order.
  if v_engagement = 'fixed' then
    select count(*) into v_fixed_count
      from public.invoices i where i.project_id = v_project_id;

    if v_fixed_count >= 2 then
      raise exception 'This fixed-price project has already been fully invoiced' using errcode = '23505';
    end if;

    select p.status into v_status from public.projects p where p.id = v_project_id;

    if v_fixed_count = 0 and v_status <> 'in-progress' then
      raise exception 'The first fixed-price invoice can only be raised while the project is in progress'
        using errcode = '22023';
    end if;

    if v_fixed_count = 1 and v_status <> 'pending-approval' then
      raise exception 'The final fixed-price invoice can only be raised once the project is pending approval'
        using errcode = '22023';
    end if;
  end if;

  -- 5. Invoice number: INV-<year>-<seq>, sequential per org per year. Derived inside the
  --    transaction so two concurrent generations cannot read the same max; if they interleave
  --    anyway, `invoice_number`'s unique constraint rejects the loser rather than duplicating.
  v_year := to_char(now(), 'YYYY');

  select coalesce(max((regexp_replace(i.invoice_number, '^.*-', ''))::int), 0) + 1
    into v_seq
    from public.invoices i
   where i.org_id = v_org_id
     and i.invoice_number like 'INV-' || v_year || '-%';

  v_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  -- 6. Insert the invoice.
  insert into public.invoices (
    invoice_number,
    org_id,
    project_id,
    amount,
    subtotal,
    currency,
    description,
    status,
    due_date,
    period_start,
    period_end
  )
  values (
    v_number,
    v_org_id,
    v_project_id,
    (invoice_data->>'amount')::numeric,
    (invoice_data->>'amount')::numeric,
    coalesce(nullif(invoice_data->>'currency', ''), 'USD'),
    nullif(invoice_data->>'description', ''),
    coalesce(nullif(invoice_data->>'status', '')::public.invoice_status, 'draft'::public.invoice_status),
    nullif(invoice_data->>'due_date', '')::timestamptz,
    v_period,
    nullif(invoice_data->>'period_end', '')::date
  )
  returning id into v_invoice_id;

  -- 7. Freeze the lines.
  --
  -- Written in the same transaction as the invoice for the same reason the hours are: an
  -- invoice whose lines failed to save is a total with nothing behind it, and no later run
  -- can reconstruct them once rates or entries have moved on.
  if jsonb_array_length(coalesce(invoice_data->'lines', '[]'::jsonb)) > 0 then
    for v_line in select * from jsonb_array_elements(invoice_data->'lines')
    loop
      insert into public.invoice_lines (
        invoice_id,
        description,
        type_label,
        quantity,
        unit_rate,
        amount,
        sort_order
      )
      values (
        v_invoice_id,
        v_line->>'description',
        v_line->>'type_label',
        nullif(v_line->>'quantity', '')::numeric,
        nullif(v_line->>'unit_rate', '')::numeric,
        (v_line->>'amount')::numeric,
        v_sort
      );

      v_sort := v_sort + 1;
    end loop;
  end if;

  -- 8. Claim the hours. The where clause re-states every precondition rather than trusting the
  --    caller's list: right project, approved, and STILL unbilled. `invoice_id is null` is the
  --    one that matters — it makes the claim idempotent under a concurrent generation, because
  --    the second transaction finds nothing left to take.
  if array_length(entry_ids, 1) > 0 then
    update public.time_entries te
       set invoice_id = v_invoice_id
     where te.id         = any(entry_ids)
       and te.project_id = v_project_id
       and te.status     = 'approved'
       and te.invoice_id is null;

    get diagnostics v_claimed = row_count;

    -- Under-claiming means someone billed these hours between the draft being built and this
    -- call. Rolling back is right: the amount was computed FROM those hours, so an invoice
    -- that keeps the total but loses the lines would overbill.
    if v_claimed <> array_length(entry_ids, 1) then
      raise exception 'Some hours were already invoiced; refresh and try again'
        using errcode = '40001';
    end if;
  end if;

  return v_invoice_id;
end;
$$;

-- Role authorization happens inside the function, as with the other definers above.
grant execute on function public.create_invoice_with_entries(jsonb, uuid[]) to authenticated;


-- ---------------------------------------------------------------------
-- Membership: set a person's standard rates
-- ---------------------------------------------------------------------
--
-- SECURITY DEFINER for two reasons the row policy cannot express:
--
--   1. `owners_admins_update_member_role` gates EVERY update on `role <> 'primary_admin'`. That is
--      right for role edits — an admin must not demote the primary admin — but it also means
--      the primary admin's own rates could never be set through the API, and in a small agency
--      they are usually the most billable person in it.
--   2. It confines the write to the two rate columns. The general update policy allows any
--      column, so an endpoint built on it would be one typo away from editing roles.
--
-- Nulls are meaningful and are written through: clearing a rate is how you say "unset", which
-- is not the same as zero.
create or replace function public.set_member_rates(
  target_user_id   uuid,
  target_org_id    uuid,
  new_default_rate numeric default null,
  new_cost_rate    numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_org_role(target_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]) then
    raise exception 'Not authorized to set rates for this organization' using errcode = '42501';
  end if;

  update public.memberships
     set default_rate = new_default_rate,
         cost_rate    = new_cost_rate
   where user_id = target_user_id
     and org_id  = target_org_id;

  if not found then
    raise exception 'No membership found for that user in this organization';
  end if;
end;
$$;

-- Role authorization happens inside the function, as with the other definers above.
grant execute on function public.set_member_rates(uuid, uuid, numeric, numeric) to authenticated;

create or replace function public.create_time_entry_with_capacity_check(
  p_user_id uuid,
  p_project_id uuid,
  p_milestone_id uuid,
  p_work_date date,
  p_duration_minutes integer,
  p_description text,
  p_org_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_capacity_hours numeric;
  v_daily_capacity_minutes integer;
  v_already_logged_minutes integer;
  v_remaining_minutes integer;
  v_remaining_hours numeric;
  v_new_entry_id uuid;
  v_is_admin boolean;
begin
  -- 1. Authorization check: caller must be an active member of the organization
  if not public.has_org_role(p_org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]) then
    raise exception 'Not authorized to log time for this organization' using errcode = '42501';
  end if;

  -- 2. Determine if the caller holds elevated privileges (primary admin, admin or manager)
  v_is_admin := public.has_org_role(p_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]);

  -- 3. Enforce user boundary: contributors can only log time for themselves
  if not v_is_admin and p_user_id <> auth.uid() then
    raise exception 'Contributors can only log time for themselves' using errcode = '42501';
  end if;

  -- 4. Verify that the target project belongs to the specified organization
  if not exists (
    select 1 
    from public.projects 
    where id = p_project_id 
      and org_id = p_org_id
  ) then
    raise exception 'Project does not belong to this organization' using errcode = '22023';
  end if;

  -- 5. Acquire a transaction-level advisory lock to serialize concurrent requests for the same user, date, and org
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || p_work_date::text || p_org_id::text)
  );

  -- 6. Get organization's daily capacity
  select coalesce(daily_capacity_hours, 8)
  into v_daily_capacity_hours
  from public.organizations
  where id = p_org_id;

  v_daily_capacity_minutes := floor(v_daily_capacity_hours * 60);

  -- 7. Calculate existing logged minutes for the given day & organization
  select coalesce(sum(te.duration_minutes), 0)
  into v_already_logged_minutes
  from public.time_entries te
  inner join public.projects p on p.id = te.project_id
  where te.user_id = p_user_id
    and te.work_date = p_work_date
    and p.org_id = p_org_id;

  -- 8. Check if total exceeds daily capacity
  if (v_already_logged_minutes + p_duration_minutes) > v_daily_capacity_minutes then
    v_remaining_minutes := greatest(0, v_daily_capacity_minutes - v_already_logged_minutes);
    v_remaining_hours := round((v_remaining_minutes::numeric / 60.0), 1);
    
    return jsonb_build_object(
      'ok', false,
      'error', format('Exceeds daily capacity. You only have %s hours remaining for %s.', v_remaining_hours::text, p_work_date::text)
    );
  end if;

  -- 9. Atomic insert
  insert into public.time_entries (
    user_id,
    project_id,
    milestone_id,
    work_date,
    duration_minutes,
    description,
    status
  ) values (
    p_user_id,
    p_project_id,
    p_milestone_id,
    p_work_date,
    p_duration_minutes,
    p_description,
    'draft'
  )
  returning id into v_new_entry_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_entry_id
  );
end;
$$;

-- Grant execution permission to authenticated users
grant execute on function public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) to authenticated;

create or replace function public.check_email_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server-only (invite flows, via the service-role key). Checked HERE, not only by
  -- grant: open to anon it let anyone with the public key test unlimited addresses to
  -- find who has an account (RISK-021).
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Reject malformed inputs immediately
  if p_email is null or length(p_email) < 3 or position('@' in p_email) = 0 then
    raise exception 'Invalid email format' using errcode = '22023';
  end if;

  return exists (
    select 1 
    from auth.users 
    where lower(email) = lower(trim(p_email))
  );
end;
$$;

revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
grant  execute on function public.check_email_exists(text) to service_role;

-- ---------------------------------------------------------------------
-- Revoke every session a user holds (called when they are deactivated)
-- ---------------------------------------------------------------------

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server-only (deactivation, via the service-role key). Checked HERE, not only by
  -- grant: grants.sql grants every routine to anon/authenticated, which silently undid the
  -- revoke below and let anyone with the public anon key sign any user out everywhere.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'A user id is required' using errcode = '22023';
  end if;

  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.revoke_user_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Hand the primary_admin role to another admin
--
-- SECURITY DEFINER because the row policy makes this impossible from the API by design:
-- `owners_admins_update_member_role` carries `role <> 'primary_admin'` in BOTH its USING
-- and WITH CHECK, so neither half of the swap can run through it — demoting the current
-- primary admin fails the USING, promoting the new one fails the WITH CHECK. That policy
-- is right: it stops an admin quietly promoting themselves. Transferring is a different
-- act, and this is the only door for it.
--
-- Both writes happen in one statement pair inside one transaction, so the partial unique
-- index `memberships_one_primary_admin_per_org` never sees two holders. The order matters:
-- demote first, then promote. The reverse would collide with the index.
--
-- `organizations.user_id` moves too. It is the column `org_owner_can_update` keys on, so
-- leaving it behind would hand the outgoing primary admin the workspace settings and
-- lock the incoming one out of them — the role would transfer in name only.
-- ---------------------------------------------------------------------
create or replace function public.transfer_primary_admin(target_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id  uuid;
  v_user_id uuid;
  v_role    public.user_role;
  v_status  boolean;
begin
  select org_id, user_id, role, status
    into v_org_id, v_user_id, v_role, v_status
    from public.memberships
   where id = target_membership_id;

  if v_org_id is null then
    raise exception 'Membership not found' using errcode = '42501';
  end if;

  -- Only the sitting primary admin may hand it over. An admin cannot take it.
  if not public.has_org_role(v_org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can transfer this role' using errcode = '42501';
  end if;

  if v_role = 'primary_admin' then
    raise exception 'They are already the primary admin' using errcode = '22023';
  end if;

  -- Admins only. A contributor or manager being handed billing and ownership in one
  -- click is a mis-click, not a decision; promote them to admin first.
  if v_role <> 'admin' then
    raise exception 'Only an admin can be made primary admin' using errcode = '22023';
  end if;

  if not v_status then
    raise exception 'Reactivate them before handing over the primary admin role'
      using errcode = '22023';
  end if;

  update public.memberships
     set role = 'admin'
   where org_id = v_org_id and role = 'primary_admin';

  update public.memberships
     set role = 'primary_admin'
   where id = target_membership_id;

  update public.organizations
     set user_id = v_user_id
   where id = v_org_id;
end;
$$;

grant execute on function public.transfer_primary_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Edit a teammate's name, role and job title in one call
--
-- SECURITY DEFINER for ONE reason: `profiles.full_name`. `13_rls_profiles` allows
-- `own_update_profile` only — id = auth.uid() — so an admin cannot rename anybody but
-- themselves through the API. Role and job_title would both go through the normal
-- membership policy; the name is what forces a definer.
--
-- WORTH KNOWING: `profiles` is GLOBAL identity, not per-organization. Renaming someone
-- here changes their name in every workspace they belong to. That is the existing shape
-- of the table, not a decision made here — `job_title` sits on `memberships` precisely so
-- it does not behave this way.
--
-- NULL (or leaving the argument out) means different things per argument (RISK-025):
--   new_full_name — keep the current name
--   new_job_title — clear the job title
--   new_role      — required; the default exists only because Postgres allows no
--                   argument without a default after one that has one
-- ---------------------------------------------------------------------
create or replace function public.update_membership_details(
  target_membership_id uuid,
  new_full_name        text             default null,
  new_job_title        text             default null,
  new_role             public.user_role default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id  uuid;
  v_user_id uuid;
  v_role    public.user_role;
begin
  select org_id, user_id, role
    into v_org_id, v_user_id, v_role
    from public.memberships
   where id = target_membership_id;

  if v_org_id is null then
    raise exception 'Membership not found' using errcode = '42501';
  end if;

  -- Primary admins and admins only (RISK-002). With managers allowed, a manager could
  -- set any role — their own included — through this definer function.
  if not public.has_org_role(
       v_org_id, array['primary_admin', 'admin']::public.user_role[]
     ) then
    raise exception 'Not authorized to edit this teammate' using errcode = '42501';
  end if;

  -- An admin edits themselves, managers and contributors — not other admins or the
  -- primary admin, so admins cannot rewrite each other. The primary admin edits anyone.
  if not public.has_org_role(v_org_id, array['primary_admin']::public.user_role[])
     and v_user_id is distinct from auth.uid()
     and v_role not in ('manager', 'contributor') then
    raise exception 'Admins can only edit themselves, managers and contributors'
      using errcode = '42501';
  end if;

  -- Nobody changes their own role here.
  if v_user_id = auth.uid() and new_role <> v_role then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  if new_role is null then
    raise exception 'Choose a role' using errcode = '22023';
  end if;

  -- The two guards `owners_admins_update_member_role` enforces, restated because a
  -- definer bypasses the policy that would otherwise apply them.
  if v_role = 'primary_admin' and new_role <> 'primary_admin' then
    raise exception 'Transfer the primary admin role instead of demoting it'
      using errcode = '22023';
  end if;

  if new_role = 'primary_admin' and v_role <> 'primary_admin' then
    raise exception 'Use transfer_primary_admin to hand over that role'
      using errcode = '22023';
  end if;

  if new_job_title is not null and char_length(new_job_title) not between 2 and 60 then
    raise exception 'Job title must be 2 to 60 characters' using errcode = '22023';
  end if;

  update public.memberships
     set role      = new_role,
         job_title = new_job_title
   where id = target_membership_id;

  if new_full_name is not null then
    update public.profiles
       set full_name = new_full_name
     where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.update_membership_details(uuid, text, text, public.user_role) to authenticated;

-- =====================================================================
-- Devices — Settings → Security
--
-- All three are SECURITY DEFINER because auth.sessions is owned by
-- supabase_auth_admin and not exposed to the API roles. Each one scopes
-- itself to `auth.uid()`, and "this device" is the `session_id` claim of
-- the caller's own access token.
-- =====================================================================

-- Records or refreshes this session's device details. Called by proxy.ts
-- at most every few minutes; the `last_seen_at` guard keeps a burst of
-- requests from rewriting the row on every one.
create or replace function public.touch_my_session(
  p_user_agent text,
  p_city       text,
  p_country    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_user_id is null or v_session_id is null or not public.mfa_satisfied() then
    return;
  end if;

  -- The session must really be the caller's; the FK alone would accept any id.
  if not exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.user_sessions (session_id, user_id, user_agent, city, country)
  values (
    v_session_id,
    v_user_id,
    left(nullif(trim(p_user_agent), ''), 512),
    left(nullif(trim(p_city), ''), 120),
    left(nullif(trim(p_country), ''), 2)
  )
  on conflict (session_id) do update
     set user_agent   = coalesce(excluded.user_agent, public.user_sessions.user_agent),
         city         = coalesce(excluded.city, public.user_sessions.city),
         country      = coalesce(excluded.country, public.user_sessions.country),
         last_seen_at = now()
   where public.user_sessions.last_seen_at < now() - interval '2 minutes';
end;
$$;

-- Every live session of the caller, newest activity first. Starts from
-- auth.sessions (the source of truth) so sessions with no recorded
-- details — signed in before this shipped — still appear.
create or replace function public.list_my_sessions()
returns table (
  session_id   uuid,
  user_agent   text,
  city         text,
  country      text,
  created_at   timestamptz,
  last_seen_at timestamptz,
  is_current   boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    s.id,
    u.user_agent,
    u.city,
    u.country,
    s.created_at,
    greatest(
      u.last_seen_at,
      s.refreshed_at at time zone 'utc',
      s.updated_at,
      s.created_at
    ) as last_seen_at,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  left join public.user_sessions u on u.session_id = s.id
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
    and public.mfa_satisfied()
  order by is_current desc, last_seen_at desc;
$$;

-- Signs ONE other device out. Deleting the auth.sessions row cascades to
-- its refresh tokens (it can never renew) and to its user_sessions row.
-- The current session is refused — that is what the normal sign-out is for.
create or replace function public.revoke_my_session(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Two-factor: an aal1 session of a user with 2FA may not act (see mfa_satisfied).
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;

  if target_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid then
    raise exception 'Use sign out for this device' using errcode = '22023';
  end if;

  delete from auth.sessions
   where id = target_session_id
     and user_id = v_user_id;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Workspace settings — Settings → Workspace (name, working day, billing)
--
-- Primary admins AND admins may change these; the profile page's Admin
-- access card promises it. The row policy `org_owner_can_update` stays
-- owner-only on purpose: row security cannot limit WHICH columns change,
-- so widening it to admins would let an admin rewrite
-- `organizations.user_id` and take the workspace. This function is the
-- admin door instead, and it can only ever touch the columns below.
--
-- Every argument but the org is optional: NULL keeps the current value,
-- so the rename sheet and the working-day card each send only their own
-- fields. The table's CHECK constraints still validate the numbers.
-- ---------------------------------------------------------------------
create or replace function public.update_workspace_settings(
  target_org_id            uuid,
  new_name                 text     default null,
  new_currency             text     default null,
  new_daily_capacity_hours smallint default null,
  new_days_per_week        smallint default null,
  new_rounding_minutes     smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name     text := nullif(trim(new_name), '');
  v_currency text := upper(nullif(trim(new_currency), ''));
begin
  -- has_org_role also carries the two-factor gate (mfa_satisfied).
  if not public.has_org_role(
       target_org_id, array['primary_admin', 'admin']::public.user_role[]
     ) then
    raise exception 'Only a primary admin or admin can change workspace settings'
      using errcode = '42501';
  end if;

  if new_name is not null and (v_name is null or char_length(v_name) > 80) then
    raise exception 'Workspace name must be 1 to 80 characters' using errcode = '22023';
  end if;

  if v_currency is not null and v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter code' using errcode = '22023';
  end if;

  update public.organizations
     set name                 = coalesce(v_name, name),
         currency             = coalesce(v_currency, currency),
         daily_capacity_hours = coalesce(new_daily_capacity_hours, daily_capacity_hours),
         days_per_week        = coalesce(new_days_per_week, days_per_week),
         rounding_minutes     = coalesce(new_rounding_minutes, rounding_minutes)
   where id = target_org_id;

  if not found then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Membership change rules a policy cannot express (RISK-002)
--
-- Row policies see only the NEW row on UPDATE, so they cannot say "this
-- column may not change". This BEFORE UPDATE trigger does:
--
--   * `status` (deactivate / reactivate) — the primary admin for anyone;
--     an admin for managers and contributors only, never another admin
--     (RISK-005).
--   * `user_id` and `org_id` never change: moving a seat to another
--     person or workspace is not an edit, it is a new membership.
--
-- Runs only for real users. The service role and internal work (sign-up,
-- invite acceptance) have no auth.uid() and are not blocked; SECURITY
-- DEFINER functions such as transfer_primary_admin keep the caller's
-- uid, never touch these columns, and so pass as well.
-- ---------------------------------------------------------------------
create or replace function public.guard_membership_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.org_id is distinct from old.org_id then
    raise exception 'A membership cannot be moved to another person or workspace'
      using errcode = '42501';
  end if;

  -- Primary admin: anyone. Admin: managers and contributors only, never another admin,
  -- so admins cannot lock each other out (RISK-005; same rule as canDeactivateRole in
  -- features/people/lib/can-deactivate-member.ts).
  if new.status is distinct from old.status
     and not (
       public.has_org_role(old.org_id, array['primary_admin']::public.user_role[])
       or (
         public.has_org_role(old.org_id, array['admin']::public.user_role[])
         and old.role in ('manager', 'contributor')
       )
     ) then
    raise exception 'Only the primary admin, or an admin for managers and contributors, can deactivate or reactivate people'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- Plan limits, enforced where two requests cannot both slip through
-- (RISK-017)
--
-- The app checks seats / clients BEFORE inserting, but read-then-write
-- has a gap: two admins inviting at the same moment both see the last
-- free seat and both succeed. This trigger closes it:
--
--   * a transaction-scoped advisory lock per workspace + limit makes
--     concurrent inserts for the SAME workspace run one after another
--     (other workspaces are not held up);
--   * it then counts exactly what the app counts (getSeatUsage /
--     getClientUsage) and refuses the row when the plan is full.
--
--   invitations (staff roles) → active staff + pending staff invites vs
--                               plans.features.max_members
--   clients (new, or reactivated) → active clients vs max_clients
--
-- No active subscription, or a limit of -1 / missing, means unlimited —
-- the same as the app's toLimit().
--
-- Real users only. Internal work — the Stripe webhook creating the
-- invitations chosen at sign-up, with the service role — has no
-- auth.uid() and is not blocked here: a refusal there would fail the
-- webhook and make Stripe retry the whole event.
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_limit integer;
  v_used  integer;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_table_name = 'invitations' then
    if new.role not in ('primary_admin', 'admin', 'manager', 'contributor') then
      return new;  -- client invites do not take a seat
    end if;
    v_key := 'max_members';
  elsif tg_table_name = 'memberships' then
    -- Reactivating a teammate takes a seat back (RISK-022): only a staff membership
    -- going from deactivated to active counts.
    if not new.status or old.status then
      return new;
    end if;
    if new.role not in ('primary_admin', 'admin', 'manager', 'contributor') then
      return new;
    end if;
    v_key := 'max_members';
  else  -- clients: only a client becoming active counts
    if not new.status then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status then
      return new;
    end if;
    v_key := 'max_clients';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('plan-limit:' || v_key || ':' || new.org_id::text, 0)
  );

  select nullif(p.features ->> v_key, '')::integer
    into v_limit
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.org_id = new.org_id
     and s.status = 'active'
   limit 1;

  if v_limit is null or v_limit < 0 then
    return new;
  end if;

  if v_key = 'max_members' then
    select
      (select count(*) from public.memberships m
        where m.org_id = new.org_id and m.status
          and m.role in ('primary_admin', 'admin', 'manager', 'contributor'))
      +
      (select count(*) from public.invitations i
        where i.org_id = new.org_id
          and i.accepted_at is null
          and i.expires_at > now()
          and i.role in ('primary_admin', 'admin', 'manager', 'contributor'))
      into v_used;

    if v_used >= v_limit then
      raise exception 'Your plan''s seats are all taken. Upgrade the plan or deactivate someone first.'
        using errcode = 'P0001';
    end if;
  else
    select count(*) into v_used
      from public.clients c
     where c.org_id = new.org_id and c.status;

    if v_used >= v_limit then
      raise exception 'Your plan''s client limit is reached. Upgrade the plan or deactivate a client first.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
