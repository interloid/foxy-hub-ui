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
-- Time entry: approve (submitted → approved, org owner only)
-- ---------------------------------------------------------------------
create or replace function public.approve_time_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Owners AND admins may approve. The old join was on `organizations.user_id` — the org's
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
        array['owner', 'admin']::public.user_role[]
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
     set status = p_status
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
-- fresh org + membership + subscription for a new owner.
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
-- role and project are read off the `public.invitations` row an owner or
-- admin created. See `schemas/tables/15_invitations.sql`.
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
    -- constraint forbids 'owner'.
    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_invite.org_id, v_invite.role);

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
    -- ---- New owner path ---------------------------------------------------
    -- org_name and slug are user-supplied, and that is safe: this user is creating
    -- their OWN new organisation and becoming its owner. There is no existing tenant
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
    values (v_user_id, v_org_id, 'owner');

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

create or replace function public.current_user_orgs()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.memberships where user_id = auth.uid();
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
    where user_id = auth.uid() and org_id = target_org_id
  );
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
  );
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

  -- 1. Authorization check: caller must be an owner or admin of the organization
  if not public.has_org_role(v_org_id, array['owner', 'admin']::public.user_role[]) then
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
    status
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
    coalesce(nullif(project_data->>'status', '')::public.project_status, 'pending'::public.project_status)
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
  v_period     date;
  v_year       text;
  v_seq        int;
  v_number     text;
  v_claimed    int;
begin
  v_org_id     := (invoice_data->>'org_id')::uuid;
  v_project_id := (invoice_data->>'project_id')::uuid;
  v_period     := nullif(invoice_data->>'period_start', '')::date;

  -- 1. Authorization: only owners and admins bill.
  if not public.has_org_role(v_org_id, array['owner', 'admin']::public.user_role[]) then
    raise exception 'Not authorized to create invoices for this organization' using errcode = '42501';
  end if;

  -- 2. The project must belong to the org the caller is billing under. Without this a caller
  --    who administers org A could raise an invoice against org B's project by passing its id.
  if not exists (
    select 1 from public.projects p
    where p.id = v_project_id and p.org_id = v_org_id
  ) then
    raise exception 'Project does not belong to this organization' using errcode = '42501';
  end if;

  -- 3. Period guard for the flat engagements. `invoices_project_period_key` enforces this too,
  --    but reaching it surfaces a unique-violation; this raises something a user can read.
  if v_period is not null and exists (
    select 1 from public.invoices i
    where i.project_id = v_project_id and i.period_start = v_period
  ) then
    raise exception 'This project is already invoiced for the period starting %', v_period
      using errcode = '23505';
  end if;

  -- 4. Invoice number: INV-<year>-<seq>, sequential per org per year. Derived inside the
  --    transaction so two concurrent generations cannot read the same max; if they interleave
  --    anyway, `invoice_number`'s unique constraint rejects the loser rather than duplicating.
  v_year := to_char(now(), 'YYYY');

  select coalesce(max((regexp_replace(i.invoice_number, '^.*-', ''))::int), 0) + 1
    into v_seq
    from public.invoices i
   where i.org_id = v_org_id
     and i.invoice_number like 'INV-' || v_year || '-%';

  v_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  -- 5. Insert the invoice.
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

  -- 6. Freeze the lines.
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

  -- 7. Claim the hours. The where clause re-states every precondition rather than trusting the
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
--   1. `owners_admins_update_member_role` gates EVERY update on `role <> 'owner'`. That is
--      right for role edits — an admin must not demote the owner — but it also means the
--      owner's own rates could never be set through the API, and in a small agency the owner
--      is usually the most billable person in it.
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
  if not public.has_org_role(target_org_id, array['owner', 'admin']::public.user_role[]) then
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
begin
  -- 1. Authorization check: caller must be an active member of the organization
  if not public.has_org_role(p_org_id, array['owner', 'admin', 'member']::public.user_role[]) then
    raise exception 'Not authorized to log time for this organization' using errcode = '42501';
  end if;

  -- 2. Acquire a transaction-level advisory lock to serialize concurrent requests for the same user, date, and org
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || p_work_date::text || p_org_id::text)
  );

  -- 3. Get organization's daily capacity
  select coalesce(daily_capacity_hours, 8)
  into v_daily_capacity_hours
  from public.organizations
  where id = p_org_id;

  v_daily_capacity_minutes := floor(v_daily_capacity_hours * 60);

  -- 4. Calculate existing logged minutes for the given day & organization
  select coalesce(sum(te.duration_minutes), 0)
  into v_already_logged_minutes
  from public.time_entries te
  inner join public.projects p on p.id = te.project_id
  where te.user_id = p_user_id
    and te.work_date = p_work_date
    and p.org_id = p_org_id;

  -- 5. Check if total exceeds daily capacity
  if (v_already_logged_minutes + p_duration_minutes) > v_daily_capacity_minutes then
    v_remaining_minutes := greatest(0, v_daily_capacity_minutes - v_already_logged_minutes);
    v_remaining_hours := round((v_remaining_minutes::numeric / 60.0), 1);
    
    return jsonb_build_object(
      'ok', false,
      'error', format('Exceeds daily capacity. You only have %s hours remaining for %s.', v_remaining_hours::text, p_work_date::text)
    );
  end if;

  -- 6. Atomic insert
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