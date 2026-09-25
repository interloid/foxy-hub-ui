SET check_function_bodies = false;
create extension if not exists "pg_cron"           with schema "pg_catalog";
create extension if not exists "pg_net"            with schema "extensions";
create extension if not exists "pg_partman"        with schema "extensions";
create extension if not exists "pg_stat_statements" with schema "extensions";
create extension if not exists "pgcrypto"          with schema "extensions";
create extension if not exists "pgmq";
create extension if not exists "supabase_vault"    with schema "vault";
create extension if not exists "uuid-ossp"         with schema "extensions";
create extension if not exists "wrappers"          with schema "extensions";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
CREATE TYPE public.activity_actor_kind AS ENUM ('system', 'client', 'member');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'submitted', 'approved', 'rejected');
CREATE TYPE public.engagement_model AS ENUM ('full_time', 'part_time', 'retainer', 'fixed');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'due', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE public.project_status AS ENUM ('draft', 'in-progress', 'pending-approval', 'pending', 'on-hold', 'completed', 'cancelled');
CREATE TYPE public.retainer_period AS ENUM ('weekly', 'monthly');
CREATE TYPE public.roles AS ENUM ('admin', 'user');
CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'cancelled', 'expired', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');
CREATE TYPE public.time_entry_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE public.user_role AS ENUM ('primary_admin', 'admin', 'manager', 'contributor', 'client');
CREATE FUNCTION public.approve_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.approve_time_entry(uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_time_entry(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_time_entry(uuid) TO service_role;
CREATE FUNCTION public.check_email_exists(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
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
$function$;
GRANT ALL ON FUNCTION public.check_email_exists(text) TO anon;
GRANT ALL ON FUNCTION public.check_email_exists(text) TO authenticated;
GRANT ALL ON FUNCTION public.check_email_exists(text) TO service_role;
CREATE FUNCTION public.create_invoice_with_entries(invoice_data jsonb, entry_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.create_invoice_with_entries(jsonb, uuid[]) TO anon;
GRANT ALL ON FUNCTION public.create_invoice_with_entries(jsonb, uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_with_entries(jsonb, uuid[]) TO service_role;
CREATE FUNCTION public.create_project_with_allocations(project_data jsonb, allocations_data jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.create_project_with_allocations(jsonb, jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_project_with_allocations(jsonb, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_with_allocations(jsonb, jsonb) TO service_role;
CREATE FUNCTION public.create_time_entry_with_capacity_check(p_user_id uuid, p_project_id uuid, p_milestone_id uuid, p_work_date date, p_duration_minutes integer, p_description text, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) TO anon;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) TO service_role;
CREATE FUNCTION public.current_user_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select org_id from public.memberships
  where user_id = auth.uid() and status;
$function$;
GRANT ALL ON FUNCTION public.current_user_orgs() TO anon;
GRANT ALL ON FUNCTION public.current_user_orgs() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_orgs() TO service_role;
CREATE FUNCTION public.handle_new_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();
GRANT ALL ON FUNCTION public.handle_new_user_signup() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user_signup() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user_signup() TO service_role;
CREATE FUNCTION public.has_org_role(target_org_id uuid, allowed_roles public.user_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id  = target_org_id
      and role    = any(allowed_roles)
      and status
  );
$function$;
GRANT ALL ON FUNCTION public.has_org_role(uuid, public.user_role[]) TO anon;
GRANT ALL ON FUNCTION public.has_org_role(uuid, public.user_role[]) TO authenticated;
GRANT ALL ON FUNCTION public.has_org_role(uuid, public.user_role[]) TO service_role;
CREATE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id and status
  );
$function$;
GRANT ALL ON FUNCTION public.is_org_member(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_member(uuid) TO service_role;
CREATE FUNCTION public.is_slug_available(candidate text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (
    select 1 from public.organizations
    where lower(slug) = lower(trim(candidate))
  );
$function$;
GRANT ALL ON FUNCTION public.is_slug_available(text) TO anon;
GRANT ALL ON FUNCTION public.is_slug_available(text) TO authenticated;
GRANT ALL ON FUNCTION public.is_slug_available(text) TO service_role;
CREATE FUNCTION public.reject_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.reject_time_entry(uuid) TO anon;
GRANT ALL ON FUNCTION public.reject_time_entry(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reject_time_entry(uuid) TO service_role;
CREATE FUNCTION public.revoke_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_user_id is null then
    raise exception 'A user id is required' using errcode = '22023';
  end if;

  delete from auth.sessions where user_id = p_user_id;
end;
$function$;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
CREATE FUNCTION public.set_member_rates(target_user_id uuid, target_org_id uuid, new_default_rate numeric DEFAULT NULL::numeric, new_cost_rate numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.set_member_rates(uuid, uuid, numeric, numeric) TO anon;
GRANT ALL ON FUNCTION public.set_member_rates(uuid, uuid, numeric, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.set_member_rates(uuid, uuid, numeric, numeric) TO service_role;
CREATE FUNCTION public.submit_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.submit_time_entry(uuid) TO anon;
GRANT ALL ON FUNCTION public.submit_time_entry(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.submit_time_entry(uuid) TO service_role;
CREATE FUNCTION public.update_delivery_status(p_status public.delivery_status, p_delivery_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.update_delivery_status(public.delivery_status, uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.update_delivery_status(public.delivery_status, uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_delivery_status(public.delivery_status, uuid, uuid) TO service_role;
CREATE TABLE public.activity_events (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, actor_id uuid, actor_kind public.activity_actor_kind NOT NULL, type text NOT NULL, summary text NOT NULL, project_id uuid, entity_type text, entity_id uuid, payload jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);
GRANT ALL ON public.activity_events TO anon;
GRANT ALL ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
CREATE INDEX activity_events_project_id_idx ON public.activity_events (project_id);
CREATE INDEX activity_events_org_created_idx ON public.activity_events (org_id, created_at DESC);
CREATE POLICY members_insert_activity_events ON public.activity_events FOR INSERT TO authenticated WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]) AND (actor_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY staff_view_activity_events ON public.activity_events FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]));
CREATE TABLE public.clients (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, name text NOT NULL, contact_name text, contact_email text, status boolean DEFAULT true NOT NULL, stripe_customer_id text, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ADD CONSTRAINT clients_org_id_name_key UNIQUE (org_id, name);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_stripe_customer_id_key UNIQUE (stripe_customer_id);
GRANT ALL ON public.clients TO anon;
GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
CREATE INDEX clients_org_id_idx ON public.clients (org_id, status);
CREATE POLICY owners_admins_write_clients ON public.clients TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role])) WITH CHECK (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]));
CREATE POLICY staff_view_clients ON public.clients FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]));
CREATE TABLE public.deliveries (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, org_id uuid NOT NULL, milestone_id uuid, author_id uuid, title text NOT NULL, description text, file_size text, file_type text, status public.delivery_status DEFAULT 'pending'::public.delivery_status NOT NULL, approved_at timestamp with time zone, due_date date, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);
GRANT ALL ON public.deliveries TO anon;
GRANT ALL ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
CREATE INDEX deliveries_org_status_due_idx ON public.deliveries (org_id, status, due_date);
CREATE INDEX deliveries_author_id_idx ON public.deliveries (author_id);
CREATE INDEX deliveries_org_id_idx ON public.deliveries (org_id);
CREATE INDEX deliveries_project_id_idx ON public.deliveries (project_id);
CREATE TABLE public.delivery_assets (id uuid DEFAULT gen_random_uuid() NOT NULL, delivery_id uuid NOT NULL, file_path text NOT NULL);
ALTER TABLE public.delivery_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assets ADD CONSTRAINT delivery_assets_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_assets ADD CONSTRAINT delivery_assets_pkey PRIMARY KEY (id);
GRANT ALL ON public.delivery_assets TO anon;
GRANT ALL ON public.delivery_assets TO authenticated;
GRANT ALL ON public.delivery_assets TO service_role;
CREATE INDEX delivery_assets_delivery_id_idx ON public.delivery_assets (delivery_id);
CREATE TABLE public.invitations (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, project_id uuid, email text NOT NULL, role public.user_role NOT NULL, token_hash text NOT NULL, invited_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL, accepted_at timestamp with time zone, accepted_by uuid);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (role = ANY (ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role, 'client'::public.user_role]));
ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);
GRANT ALL ON public.invitations TO anon;
GRANT ALL ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
CREATE UNIQUE INDEX invitations_pending_email_org_key ON public.invitations (org_id, lower(email)) WHERE accepted_at IS NULL;
CREATE INDEX invitations_org_id_idx ON public.invitations (org_id);
CREATE INDEX invitations_email_idx ON public.invitations (lower(email));
CREATE POLICY owners_admins_create_invitations ON public.invitations FOR INSERT TO authenticated WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]) AND (invited_by = ( SELECT auth.uid() AS uid)) AND (accepted_at IS NULL) AND (accepted_by IS NULL)));
CREATE POLICY owners_admins_delete_invitations ON public.invitations FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]));
CREATE POLICY owners_admins_view_invitations ON public.invitations FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]));
CREATE TABLE public.invoice_lines (id uuid DEFAULT gen_random_uuid() NOT NULL, invoice_id uuid NOT NULL, description text NOT NULL, type_label text NOT NULL, quantity numeric(10,2), unit_rate numeric(10,2), amount numeric(12,2) NOT NULL, sort_order smallint DEFAULT 0 NOT NULL);
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_amount_check CHECK (amount >= 0::numeric);
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_quantity_check CHECK (quantity IS NULL OR quantity >= 0::numeric);
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_unit_rate_check CHECK (unit_rate IS NULL OR unit_rate >= 0::numeric);
GRANT ALL ON public.invoice_lines TO anon;
GRANT ALL ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
CREATE INDEX invoice_lines_invoice_id_idx ON public.invoice_lines (invoice_id);
CREATE TABLE public.invoices (id uuid DEFAULT gen_random_uuid() NOT NULL, invoice_number text NOT NULL, org_id uuid NOT NULL, project_id uuid NOT NULL, amount numeric NOT NULL, subtotal numeric DEFAULT 0 NOT NULL, tax_amount numeric DEFAULT 0 NOT NULL, currency text DEFAULT 'USD'::text NOT NULL, description text, invoice_url text, stripe_invoice_id text, status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL, payment_intent text, created_at timestamp with time zone DEFAULT now() NOT NULL, due_date timestamp with time zone, paid_at timestamp with time zone, period_start date, period_end date);
CREATE POLICY owners_admins_insert_invoice_lines ON public.invoice_lines FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_lines.invoice_id) AND public.has_org_role(i.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role])))));
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_amount_check CHECK (amount >= 0::numeric);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_check CHECK (period_end IS NULL OR period_end >= period_start);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_currency_check CHECK (char_length(currency) = 3);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_intent_key UNIQUE (payment_intent);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_subtotal_check CHECK (subtotal >= 0::numeric);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_tax_amount_check CHECK (tax_amount >= 0::numeric);
GRANT ALL ON public.invoices TO anon;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
CREATE INDEX invoices_project_id_idx ON public.invoices (project_id);
CREATE INDEX invoices_org_id_idx ON public.invoices (org_id);
CREATE UNIQUE INDEX invoices_org_number_key ON public.invoices (org_id, invoice_number);
CREATE UNIQUE INDEX invoices_project_period_key ON public.invoices (project_id, period_start) WHERE period_start IS NOT NULL;
CREATE INDEX invoices_number_idx ON public.invoices (invoice_number);
CREATE TABLE public.memberships (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, role public.user_role NOT NULL, org_id uuid NOT NULL, user_id uuid NOT NULL, status boolean DEFAULT true NOT NULL, default_rate numeric(10,2), cost_rate numeric(10,2));
CREATE POLICY owners_admins_insert_deliveries ON public.deliveries FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = deliveries.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))));
CREATE POLICY staff_update_deliveries ON public.deliveries FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = deliveries.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_insert_delivery_assets ON public.delivery_assets FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.deliveries d
     JOIN public.memberships m ON ((d.org_id = m.org_id)))
  WHERE ((d.id = delivery_assets.delivery_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_update_delivery_assets ON public.delivery_assets FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.deliveries d
     JOIN public.memberships m ON ((d.org_id = m.org_id)))
  WHERE ((d.id = delivery_assets.delivery_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY owners_admins_insert_invoices ON public.invoices FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = invoices.org_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]))))));
CREATE POLICY owners_admins_update_invoices ON public.invoices FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = invoices.org_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]))))));
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_cost_rate_check CHECK (cost_rate IS NULL OR cost_rate >= 0::numeric);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_default_rate_check CHECK (default_rate IS NULL OR default_rate >= 0::numeric);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
GRANT ALL ON public.memberships TO anon;
GRANT ALL ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
CREATE UNIQUE INDEX memberships_user_org_key ON public.memberships (user_id, org_id);
CREATE INDEX memberships_user_id_idx ON public.memberships (user_id);
CREATE INDEX memberships_org_id_idx ON public.memberships (org_id);
CREATE POLICY owners_admins_can_insert_members ON public.memberships FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]));
CREATE POLICY owners_admins_update_member_role ON public.memberships FOR UPDATE TO authenticated USING ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]) AND (role <> 'primary_admin'::public.user_role))) WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]) AND (role <> 'primary_admin'::public.user_role)));
CREATE POLICY owners_can_delete_members ON public.memberships FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role]));
CREATE POLICY view_org_members ON public.memberships FOR SELECT TO authenticated USING ((org_id IN ( SELECT public.current_user_orgs() AS current_user_orgs)));
CREATE POLICY view_own_membership ON public.memberships FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.milestones (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, title text NOT NULL, due_date date, status public.milestone_status DEFAULT 'pending'::public.milestone_status NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE CASCADE;
GRANT ALL ON public.milestones TO anon;
GRANT ALL ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
CREATE INDEX milestones_project_id_idx ON public.milestones (project_id);
CREATE TABLE public.organizations (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, name text NOT NULL, slug text NOT NULL, logo_url text, website_url text, user_id uuid, daily_capacity_hours smallint DEFAULT 8 NOT NULL, days_per_week smallint DEFAULT 5 NOT NULL, currency text DEFAULT 'USD'::text NOT NULL, rounding_minutes smallint DEFAULT 15 NOT NULL, payment_terms_days smallint DEFAULT 30 NOT NULL);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_currency_check CHECK (char_length(currency) = 3);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_daily_capacity_hours_check CHECK (daily_capacity_hours >= 1 AND daily_capacity_hours <= 24);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_days_per_week_check CHECK (days_per_week >= 1 AND days_per_week <= 7);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_payment_terms_days_check CHECK (payment_terms_days >= 0 AND payment_terms_days <= 365);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_rounding_minutes_check CHECK (rounding_minutes >= 1 AND rounding_minutes <= 60);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.organizations TO anon;
GRANT ALL ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
CREATE UNIQUE INDEX organizations_slug_key ON public.organizations (slug);
CREATE INDEX organizations_user_id_idx ON public.organizations (user_id);
CREATE POLICY org_members_can_view ON public.organizations FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = organizations.id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY org_owner_can_update ON public.organizations FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.plans (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, name text NOT NULL, duration_months smallint NOT NULL, price_cents integer NOT NULL, features jsonb DEFAULT '{}'::jsonb NOT NULL, is_active boolean DEFAULT true NOT NULL, price_id character varying, seats smallint);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ADD CONSTRAINT plans_name_duration_months_key UNIQUE (name, duration_months);
ALTER TABLE public.plans ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
ALTER TABLE public.plans ADD CONSTRAINT plans_seats_check CHECK (seats IS NULL OR seats > 0);
GRANT ALL ON public.plans TO anon;
GRANT ALL ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
CREATE UNIQUE INDEX plans_price_id_key ON public.plans (price_id) WHERE price_id IS NOT NULL;
CREATE POLICY anyone_view_active_plans ON public.plans FOR SELECT TO authenticated USING ((is_active = true));
CREATE TABLE public.profiles (id uuid NOT NULL, full_name text, avatar_url text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY own_insert_profile ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_update_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY view_own_and_co_member_profiles ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = profiles.id) AND (m.org_id IN ( SELECT public.current_user_orgs() AS current_user_orgs)))))));
CREATE TABLE public.project_allocations (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, hours_per_day numeric(4,2) NOT NULL, days_per_week smallint DEFAULT 5 NOT NULL, rate numeric(10,2), cost_rate numeric(10,2), effective_from date NOT NULL, effective_to date, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_check CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_cost_rate_check CHECK (cost_rate IS NULL OR cost_rate >= 0::numeric);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_days_per_week_check CHECK (days_per_week >= 1 AND days_per_week <= 7);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_hours_per_day_check CHECK (hours_per_day > 0::numeric AND hours_per_day <= 24::numeric);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_project_id_user_id_effective_from_key UNIQUE (project_id, user_id, effective_from);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_rate_check CHECK (rate IS NULL OR rate >= 0::numeric);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.project_allocations TO anon;
GRANT ALL ON public.project_allocations TO authenticated;
GRANT ALL ON public.project_allocations TO service_role;
CREATE INDEX project_allocations_user_id_idx ON public.project_allocations (user_id);
CREATE INDEX project_allocations_project_id_idx ON public.project_allocations (project_id);
CREATE TABLE public.projects (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, name text NOT NULL, client_id uuid, description text, status public.project_status DEFAULT 'pending'::public.project_status NOT NULL, start_date date, start_from text, due_date timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone, engagement public.engagement_model DEFAULT 'full_time'::public.engagement_model NOT NULL, contract_value numeric(12,2), retainer_hours numeric(6,2), retainer_period public.retainer_period, retainer_amount numeric(12,2), retainer_overage numeric(4,2), estimated_hours numeric(8,2), override_reason text, client_org_id uuid);
CREATE POLICY staff_and_project_client_view_deliveries ON public.deliveries FOR SELECT TO authenticated USING ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = deliveries.project_id) AND (p.client_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY staff_and_project_client_view_delivery_assets ON public.delivery_assets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.deliveries d
  WHERE ((d.id = delivery_assets.delivery_id) AND (public.has_org_role(d.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]) OR (EXISTS ( SELECT 1
           FROM public.projects p
          WHERE ((p.id = d.project_id) AND (p.client_id = ( SELECT auth.uid() AS uid))))))))));
CREATE POLICY view_invoice_lines_with_invoice ON public.invoice_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE ((i.id = invoice_lines.invoice_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_and_own_client_view_invoices ON public.invoices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_and_own_client_view_milestones ON public.milestones FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = milestones.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_delete_milestones ON public.milestones FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = milestones.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_insert_milestones ON public.milestones FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = milestones.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_update_milestones ON public.milestones FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = milestones.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY owners_admins_write_project_allocations ON public.project_allocations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_allocations.project_id) AND public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_allocations.project_id) AND public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role])))));
CREATE POLICY staff_view_project_allocations ON public.project_allocations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_allocations.project_id) AND public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role])))));
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_client_org_id_fkey FOREIGN KEY (client_org_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_contract_value_check CHECK (contract_value IS NULL OR contract_value >= 0::numeric);
ALTER TABLE public.projects ADD CONSTRAINT projects_estimated_hours_check CHECK (estimated_hours IS NULL OR estimated_hours > 0::numeric);
ALTER TABLE public.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_retainer_amount_check CHECK (retainer_amount IS NULL OR retainer_amount >= 0::numeric);
ALTER TABLE public.projects ADD CONSTRAINT projects_retainer_hours_check CHECK (retainer_hours IS NULL OR retainer_hours > 0::numeric);
ALTER TABLE public.projects ADD CONSTRAINT projects_retainer_overage_check CHECK (retainer_overage IS NULL OR retainer_overage >= 0::numeric);
GRANT ALL ON public.projects TO anon;
GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
CREATE INDEX projects_org_id_idx ON public.projects (org_id);
CREATE INDEX projects_client_id_idx ON public.projects (client_id);
CREATE UNIQUE INDEX projects_id_org_id_key ON public.projects (id, org_id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_project_in_org FOREIGN KEY (project_id, org_id) REFERENCES public.projects(id, org_id) ON DELETE CASCADE;
CREATE INDEX projects_client_org_id_idx ON public.projects (client_org_id);
CREATE POLICY owners_admins_delete_projects ON public.projects FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))));
CREATE POLICY owners_admins_insert_projects ON public.projects FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))));
CREATE POLICY staff_and_own_client_view_projects ON public.projects FOR SELECT TO authenticated USING (((client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role])));
CREATE POLICY staff_update_projects ON public.projects FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE TABLE public.stripe_events (id uuid DEFAULT gen_random_uuid() NOT NULL, event_id text NOT NULL, type text NOT NULL, processed_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_event_id_key UNIQUE (event_id);
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);
GRANT ALL ON public.stripe_events TO anon;
GRANT ALL ON public.stripe_events TO authenticated;
GRANT ALL ON public.stripe_events TO service_role;
CREATE INDEX stripe_events_type_idx ON public.stripe_events (type);
CREATE TABLE public.subscriptions (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, plan_id uuid, stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent text, status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL, current_period_end timestamp with time zone, payment_method_type text, payment_method_details jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
GRANT ALL ON public.subscriptions TO anon;
GRANT ALL ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
CREATE UNIQUE INDEX subscriptions_org_id_active_key ON public.subscriptions (org_id) WHERE status = 'active'::public.subscription_status;
CREATE INDEX subscriptions_plan_id_idx ON public.subscriptions (plan_id);
CREATE INDEX subscriptions_org_id_idx ON public.subscriptions (org_id);
CREATE POLICY owners_admins_view_subscription ON public.subscriptions FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
CREATE TABLE public.time_entries (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid NOT NULL, milestone_id uuid, work_date date NOT NULL, duration_minutes integer NOT NULL, description text NOT NULL, status public.time_entry_status DEFAULT 'draft'::public.time_entry_status NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, invoice_id uuid);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_duration_minutes_check CHECK (duration_minutes > 0);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.time_entries TO anon;
GRANT ALL ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
CREATE INDEX time_entries_work_date_idx ON public.time_entries (work_date);
CREATE INDEX time_entries_milestone_id_idx ON public.time_entries (milestone_id);
CREATE INDEX time_entries_invoice_id_idx ON public.time_entries (invoice_id);
CREATE INDEX time_entries_project_id_idx ON public.time_entries (project_id);
CREATE INDEX time_entries_user_id_idx ON public.time_entries (user_id);
CREATE POLICY members_insert_entries ON public.time_entries FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = time_entries.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY org_staff_update_entries ON public.time_entries FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = time_entries.project_id) AND public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = time_entries.project_id) AND public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role])))));
CREATE POLICY own_delete_draft_entries ON public.time_entries FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::public.time_entry_status)));
CREATE POLICY own_or_org_staff_view_entries ON public.time_entries FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = time_entries.project_id) AND public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))));
CREATE POLICY own_update_draft_entries ON public.time_entries FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.updates (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, author_id uuid NOT NULL, body text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries, TABLE public.updates;
ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.updates REPLICA IDENTITY FULL;
ALTER TABLE public.updates ADD CONSTRAINT updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.updates ADD CONSTRAINT updates_pkey PRIMARY KEY (id);
ALTER TABLE public.updates ADD CONSTRAINT updates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
GRANT ALL ON public.updates TO anon;
GRANT ALL ON public.updates TO authenticated;
GRANT ALL ON public.updates TO service_role;
CREATE INDEX updates_author_id_idx ON public.updates (author_id);
CREATE INDEX updates_project_id_idx ON public.updates (project_id);
CREATE POLICY own_delete_own_update ON public.updates FOR DELETE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_update_own_update ON public.updates FOR UPDATE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY staff_and_own_client_view_updates ON public.updates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = updates.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_insert_updates ON public.updates FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = updates.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role])))))));
