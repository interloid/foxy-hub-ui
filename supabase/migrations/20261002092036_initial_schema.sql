SET check_function_bodies = false;
CREATE EXTENSION pg_partman WITH SCHEMA extensions;
CREATE EXTENSION wrappers WITH SCHEMA extensions;
CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;
create extension if not exists pg_net with schema extensions;
CREATE EXTENSION pgmq;
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
CREATE TYPE public.billing_payment_status AS ENUM ('pending', 'requires_action', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed', 'dispute_lost', 'void');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'submitted', 'approved', 'rejected');
CREATE TYPE public.engagement_model AS ENUM ('retainer', 'fixed', 'budget', 'hourly');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'due', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE public.project_status AS ENUM ('draft', 'in-progress', 'pending-approval', 'pending', 'on-hold', 'completed', 'cancelled');
CREATE TYPE public.retainer_period AS ENUM ('weekly', 'monthly');
CREATE TYPE public.roles AS ENUM ('admin', 'user');
CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'cancelled', 'expired', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');
CREATE TYPE public.time_entry_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE public.update_cadence AS ENUM ('weekly_monday', 'weekly_friday', 'fortnightly', 'at_milestone', 'on_request');
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
$function$;
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

  -- Billable guard. Time logged as non-billable (the Log time page's toggle) is internal work:
  -- approved like any other, but never invoiced. The app already leaves it out of drafts; this
  -- refuses it outright, before anything is written, with a message that says why - rather
  -- than letting the claim below under-count and report it as "already invoiced".
  if array_length(entry_ids, 1) > 0 and exists (
    select 1
      from public.time_entries te
     where te.id = any(entry_ids)
       and not te.billable
  ) then
    raise exception 'Non-billable hours cannot be invoiced' using errcode = '22023';
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
  --    caller's list: right project, approved, billable, and STILL unbilled. `invoice_id is null` is the
  --    one that matters — it makes the claim idempotent under a concurrent generation, because
  --    the second transaction finds nothing left to take.
  if array_length(entry_ids, 1) > 0 then
    update public.time_entries te
       set invoice_id = v_invoice_id
     where te.id         = any(entry_ids)
       and te.project_id = v_project_id
       and te.status     = 'approved'
       and te.billable
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
CREATE FUNCTION public.create_project_with_allocations(project_data jsonb, allocations_data jsonb DEFAULT '[]'::jsonb, milestones_data jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project_id uuid;
  v_alloc      jsonb;
  v_org_id     uuid;
  v_owner_id   uuid;
begin
  v_org_id   := (project_data->>'org_id')::uuid;
  v_owner_id := nullif(project_data->>'owner_id', '')::uuid;

  -- 1. Authorization check: caller must be a primary admin, admin or manager of the org
  if not public.has_org_role(v_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]) then
    raise exception 'Not authorized to create projects for this organization' using errcode = '42501';
  end if;

  -- The owner is caller-supplied and this function bypasses RLS, so it must be checked here:
  -- only an active staff member of THIS org can own the project. A client, a deactivated
  -- member, or someone from another org would otherwise have timesheets routed to them.
  if v_owner_id is not null and not exists (
    select 1 from public.memberships m
    where m.user_id = v_owner_id
      and m.org_id  = v_org_id
      and m.status
      and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
  ) then
    raise exception 'Project owner must be an active member of this organization' using errcode = '22023';
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
    created_by,
    owner_id,
    start_date,
    scope_in,
    scope_out,
    done_when,
    sign_off_by,
    update_cadence
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
    auth.uid(),
    v_owner_id,
    nullif(project_data->>'start_date', '')::date,
    -- Blank text is stored as null, so "not filled in" has one spelling.
    nullif(btrim(project_data->>'scope_in'), ''),
    nullif(btrim(project_data->>'scope_out'), ''),
    nullif(btrim(project_data->>'done_when'), ''),
    nullif(btrim(project_data->>'sign_off_by'), ''),
    coalesce(
      nullif(project_data->>'update_cadence', '')::public.update_cadence,
      'weekly_monday'::public.update_cadence
    )
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

  -- 4. Insert Milestones (if any provided). `position` is the order they were listed in -
  -- `with ordinality` is 1-based, the column is 0-based.
  insert into public.milestones (
    project_id,
    title,
    due_date,
    estimated_hours,
    client_visible,
    position
  )
  select
    v_project_id,
    btrim(ms.value->>'title'),
    nullif(ms.value->>'due_date', '')::date,
    nullif(ms.value->>'estimated_hours', '')::numeric,
    coalesce((ms.value->>'client_visible')::boolean, true),
    (ms.ordinality - 1)::smallint
  from jsonb_array_elements(coalesce(milestones_data, '[]'::jsonb)) with ordinality as ms(value, ordinality);

  return v_project_id;
end;
$function$;
GRANT ALL ON FUNCTION public.create_project_with_allocations(jsonb, jsonb, jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_project_with_allocations(jsonb, jsonb, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_project_with_allocations(jsonb, jsonb, jsonb) TO service_role;
CREATE FUNCTION public.create_time_entry_with_capacity_check(p_user_id uuid, p_project_id uuid, p_milestone_id uuid, p_work_date date, p_duration_minutes integer, p_description text, p_org_id uuid, p_billable boolean DEFAULT true)
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
    status,
    billable
  ) values (
    p_user_id,
    p_project_id,
    p_milestone_id,
    p_work_date,
    p_duration_minutes,
    p_description,
    'draft',
    coalesce(p_billable, true)
  )
  returning id into v_new_entry_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_entry_id
  );
end;
$function$;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid, boolean) TO anon;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid, boolean) TO service_role;
CREATE FUNCTION public.current_user_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select org_id from public.memberships
  where user_id = auth.uid() and status
    and public.mfa_satisfied();
$function$;
GRANT ALL ON FUNCTION public.current_user_orgs() TO anon;
GRANT ALL ON FUNCTION public.current_user_orgs() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_orgs() TO service_role;
CREATE FUNCTION public.demo_reset_running()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(current_setting('app.demo_reset', true), '') = 'on';
$function$;
GRANT ALL ON FUNCTION public.demo_reset_running() TO anon;
GRANT ALL ON FUNCTION public.demo_reset_running() TO authenticated;
GRANT ALL ON FUNCTION public.demo_reset_running() TO service_role;
CREATE FUNCTION public.enforce_plan_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key           text;
  v_limit         integer;
  v_pending_limit integer;
  v_pending_name  text;
  v_used          integer;
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

  -- Seats come from the `plans.seats` column, the one the billing page, plan changes
  -- and the app's own invite check read. The client limit is still a features key.
  select case when v_key = 'max_members' then p.seats
              else nullif(p.features ->> v_key, '')::integer end,
         case when v_key = 'max_members' then pp.seats
              else nullif(pp.features ->> v_key, '')::integer end,
         pp.name
    into v_limit, v_pending_limit, v_pending_name
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    left join public.plans pp on pp.id = s.pending_plan_id
   where s.org_id = new.org_id
     and s.status = 'active'
   limit 1;

  -- Unlimited (null / -1) never tightens the limit.
  if v_limit is not null and v_limit < 0 then
    v_limit := null;
  end if;
  if v_key <> 'max_members' or v_pending_limit is null or v_pending_limit < 0 then
    v_pending_limit := null;
  end if;

  if v_limit is null and v_pending_limit is null then
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

    if v_pending_limit is not null
       and v_used >= v_pending_limit
       and (v_limit is null or v_pending_limit < v_limit) then
      raise exception 'Your plan is changing to %, which has % seats, and they are all taken. Cancel the change or deactivate someone first.',
        v_pending_name, v_pending_limit
        using errcode = 'P0001';
    end if;

    if v_limit is not null and v_used >= v_limit then
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
$function$;
GRANT ALL ON FUNCTION public.enforce_plan_limits() TO anon;
GRANT ALL ON FUNCTION public.enforce_plan_limits() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_plan_limits() TO service_role;
CREATE FUNCTION public.guard_demo_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.guard_demo_writes() TO anon;
GRANT ALL ON FUNCTION public.guard_demo_writes() TO authenticated;
GRANT ALL ON FUNCTION public.guard_demo_writes() TO service_role;
CREATE FUNCTION public.guard_membership_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Rates. The general update policy allows any column, so without this an admin could set
  -- a cost rate with a direct update instead of going through set_member_rates.
  if new.cost_rate is distinct from old.cost_rate
     and not public.has_org_role(old.org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can change a cost rate'
      using errcode = '42501';
  end if;

  if new.default_rate is distinct from old.default_rate
     and not public.has_org_role(old.org_id, array['primary_admin', 'admin']::public.user_role[]) then
    raise exception 'Only the primary admin or an admin can change a bill rate'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
GRANT ALL ON FUNCTION public.guard_membership_update() TO anon;
GRANT ALL ON FUNCTION public.guard_membership_update() TO authenticated;
GRANT ALL ON FUNCTION public.guard_membership_update() TO service_role;
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
  ) and public.mfa_satisfied();
$function$;
GRANT ALL ON FUNCTION public.has_org_role(uuid, public.user_role[]) TO anon;
GRANT ALL ON FUNCTION public.has_org_role(uuid, public.user_role[]) TO authenticated;
GRANT ALL ON FUNCTION public.has_org_role(uuid, public.user_role[]) TO service_role;
CREATE FUNCTION public.is_demo_member(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = target_user_id
       and m.status
       and o.is_demo
  );
$function$;
GRANT ALL ON FUNCTION public.is_demo_member(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_demo_member(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_demo_member(uuid) TO service_role;
CREATE FUNCTION public.is_demo_org(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select o.is_demo from public.organizations o where o.id = target_org_id),
    false
  );
$function$;
GRANT ALL ON FUNCTION public.is_demo_org(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_demo_org(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_demo_org(uuid) TO service_role;
CREATE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id and status
  ) and public.mfa_satisfied();
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
CREATE FUNCTION public.list_my_sessions()
 RETURNS TABLE(session_id uuid, user_agent text, city text, country text, created_at timestamp with time zone, last_seen_at timestamp with time zone, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.list_my_sessions() TO anon;
GRANT ALL ON FUNCTION public.list_my_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.list_my_sessions() TO service_role;
CREATE FUNCTION public.mfa_satisfied()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$function$;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO anon;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO authenticated;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO service_role;
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
CREATE FUNCTION public.reset_demo_org()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.reset_demo_org() TO service_role;
CREATE FUNCTION public.revoke_my_session(target_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.revoke_my_session(uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_my_session(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_my_session(uuid) TO service_role;
CREATE FUNCTION public.revoke_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
CREATE FUNCTION public.set_member_rates(target_user_id uuid, target_org_id uuid, new_default_rate numeric DEFAULT NULL::numeric, new_cost_rate numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_primary boolean;
begin
  if not public.has_org_role(target_org_id, array['primary_admin', 'admin']::public.user_role[]) then
    raise exception 'Not authorized to set rates for this organization' using errcode = '42501';
  end if;

  v_is_primary := public.has_org_role(target_org_id, array['primary_admin']::public.user_role[]);

  update public.memberships
     set default_rate = new_default_rate,
         cost_rate    = case when v_is_primary then new_cost_rate else cost_rate end
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
$function$;
GRANT ALL ON FUNCTION public.submit_time_entry(uuid) TO anon;
GRANT ALL ON FUNCTION public.submit_time_entry(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.submit_time_entry(uuid) TO service_role;
CREATE FUNCTION public.touch_my_session(p_user_agent text, p_city text, p_country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.touch_my_session(text, text, text) TO anon;
GRANT ALL ON FUNCTION public.touch_my_session(text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.touch_my_session(text, text, text) TO service_role;
CREATE FUNCTION public.transfer_primary_admin(target_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.transfer_primary_admin(uuid) TO anon;
GRANT ALL ON FUNCTION public.transfer_primary_admin(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_primary_admin(uuid) TO service_role;
CREATE FUNCTION public.update_delivery_status(p_status public.delivery_status, p_delivery_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.update_delivery_status(public.delivery_status, uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.update_delivery_status(public.delivery_status, uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_delivery_status(public.delivery_status, uuid, uuid) TO service_role;
CREATE FUNCTION public.update_membership_details(target_membership_id uuid, new_full_name text DEFAULT NULL::text, new_job_title text DEFAULT NULL::text, new_role public.user_role DEFAULT NULL::public.user_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Only the primary admin makes admins.
  if new_role = 'admin' and v_role <> 'admin'
     and not public.has_org_role(v_org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can make someone an admin'
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
$function$;
GRANT ALL ON FUNCTION public.update_membership_details(uuid, text, text, public.user_role) TO anon;
GRANT ALL ON FUNCTION public.update_membership_details(uuid, text, text, public.user_role) TO authenticated;
GRANT ALL ON FUNCTION public.update_membership_details(uuid, text, text, public.user_role) TO service_role;
CREATE FUNCTION public.update_workspace_settings(target_org_id uuid, new_name text DEFAULT NULL::text, new_currency text DEFAULT NULL::text, new_daily_capacity_hours smallint DEFAULT NULL::smallint, new_days_per_week smallint DEFAULT NULL::smallint, new_rounding_minutes smallint DEFAULT NULL::smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, smallint, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, smallint, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, smallint, smallint, smallint) TO service_role;
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
CREATE POLICY require_mfa_when_enrolled ON public.activity_events AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY staff_view_activity_events ON public.activity_events FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]));
CREATE TABLE public.billing_payments (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, subscription_id uuid, plan_id uuid, stripe_invoice_id text NOT NULL, invoice_number text, stripe_payment_intent_id text, stripe_charge_id text, billing_reason text, description text, amount_due_cents integer DEFAULT 0 NOT NULL, amount_paid_cents integer DEFAULT 0 NOT NULL, amount_refunded_cents integer DEFAULT 0 NOT NULL, total_cents integer DEFAULT 0 NOT NULL, credit_applied_cents integer DEFAULT 0 NOT NULL, currency text NOT NULL, status public.billing_payment_status NOT NULL, failure_code text, failure_message text, attempt_count integer DEFAULT 0 NOT NULL, next_attempt_at timestamp with time zone, hosted_invoice_url text, period_start timestamp with time zone, period_end timestamp with time zone, paid_at timestamp with time zone, failed_at timestamp with time zone, refunded_at timestamp with time zone, last_event_id text, last_event_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_stripe_charge_id_key UNIQUE (stripe_charge_id);
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);
GRANT ALL ON public.billing_payments TO anon;
GRANT ALL ON public.billing_payments TO authenticated;
GRANT ALL ON public.billing_payments TO service_role;
CREATE INDEX billing_payments_org_created_idx ON public.billing_payments (org_id, created_at DESC);
CREATE POLICY owners_admins_view_billing_payments ON public.billing_payments FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
CREATE TABLE public.clients (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, name text NOT NULL, contact_name text, contact_email text, status boolean DEFAULT true NOT NULL, portal boolean DEFAULT true NOT NULL, stripe_customer_id text, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ADD CONSTRAINT clients_org_id_name_key UNIQUE (org_id, name);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_stripe_customer_id_key UNIQUE (stripe_customer_id);
GRANT ALL ON public.clients TO anon;
GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
CREATE INDEX clients_org_id_idx ON public.clients (org_id, status);
CREATE TRIGGER enforce_client_limit BEFORE INSERT OR UPDATE OF status ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();
CREATE TRIGGER guard_demo_clients BEFORE UPDATE OF status ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE POLICY owners_admins_write_clients ON public.clients TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role])) WITH CHECK (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
CREATE POLICY require_mfa_when_enrolled ON public.clients AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY staff_view_clients ON public.clients FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]));
CREATE TABLE public.deliveries (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, org_id uuid NOT NULL, milestone_id uuid, author_id uuid, title text NOT NULL, description text, file_size text, file_type text, status public.delivery_status DEFAULT 'pending'::public.delivery_status NOT NULL, approved_at timestamp with time zone, due_date date, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);
GRANT ALL ON public.deliveries TO anon;
GRANT ALL ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
CREATE INDEX deliveries_org_id_idx ON public.deliveries (org_id);
CREATE INDEX deliveries_author_id_idx ON public.deliveries (author_id);
CREATE INDEX deliveries_org_status_due_idx ON public.deliveries (org_id, status, due_date);
CREATE INDEX deliveries_project_id_idx ON public.deliveries (project_id);
CREATE POLICY require_mfa_when_enrolled ON public.deliveries AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.delivery_assets (id uuid DEFAULT gen_random_uuid() NOT NULL, delivery_id uuid NOT NULL, file_path text NOT NULL);
ALTER TABLE public.delivery_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assets ADD CONSTRAINT delivery_assets_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_assets ADD CONSTRAINT delivery_assets_pkey PRIMARY KEY (id);
GRANT ALL ON public.delivery_assets TO anon;
GRANT ALL ON public.delivery_assets TO authenticated;
GRANT ALL ON public.delivery_assets TO service_role;
CREATE INDEX delivery_assets_delivery_id_idx ON public.delivery_assets (delivery_id);
CREATE POLICY require_mfa_when_enrolled ON public.delivery_assets AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.digest_deliveries (user_id uuid NOT NULL, org_id uuid NOT NULL, week_start date NOT NULL, status text NOT NULL, message_id text, error text, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.digest_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_pkey PRIMARY KEY (user_id, org_id, week_start);
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_status_check CHECK (status = ANY (ARRAY['sent'::text, 'skipped'::text, 'failed'::text]));
GRANT ALL ON public.digest_deliveries TO anon;
GRANT ALL ON public.digest_deliveries TO authenticated;
GRANT ALL ON public.digest_deliveries TO service_role;
CREATE INDEX digest_deliveries_week_idx ON public.digest_deliveries (week_start);
CREATE TABLE public.invitations (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, project_id uuid, email text NOT NULL, role public.user_role NOT NULL, job_title text, token_hash text NOT NULL, invited_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL, accepted_at timestamp with time zone, accepted_by uuid);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_job_title_check CHECK (job_title IS NULL OR char_length(job_title) >= 2 AND char_length(job_title) <= 60);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (role = ANY (ARRAY['admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role, 'client'::public.user_role]));
ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);
GRANT ALL ON public.invitations TO anon;
GRANT ALL ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
CREATE UNIQUE INDEX invitations_pending_email_org_key ON public.invitations (org_id, lower(email)) WHERE accepted_at IS NULL;
CREATE INDEX invitations_org_id_idx ON public.invitations (org_id);
CREATE INDEX invitations_email_idx ON public.invitations (lower(email));
CREATE TRIGGER enforce_member_limit BEFORE INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();
CREATE TRIGGER guard_demo_invitations BEFORE INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE POLICY owners_admins_create_invitations ON public.invitations FOR INSERT TO authenticated WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]) AND ((role <> 'admin'::public.user_role) OR public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role])) AND (invited_by = ( SELECT auth.uid() AS uid)) AND (accepted_at IS NULL) AND (accepted_by IS NULL)));
CREATE POLICY owners_admins_delete_invitations ON public.invitations FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
CREATE POLICY owners_admins_view_invitations ON public.invitations FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]));
CREATE POLICY require_mfa_when_enrolled ON public.invitations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
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
CREATE POLICY require_mfa_when_enrolled ON public.invoice_lines AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
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
CREATE UNIQUE INDEX invoices_org_number_key ON public.invoices (org_id, invoice_number);
CREATE INDEX invoices_org_id_idx ON public.invoices (org_id);
CREATE UNIQUE INDEX invoices_project_period_key ON public.invoices (project_id, period_start) WHERE period_start IS NOT NULL;
CREATE INDEX invoices_number_idx ON public.invoices (invoice_number);
CREATE INDEX invoices_project_id_idx ON public.invoices (project_id);
CREATE TRIGGER guard_demo_invoices BEFORE INSERT OR UPDATE OF invoice_url, stripe_invoice_id ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE POLICY require_mfa_when_enrolled ON public.invoices AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.memberships (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, role public.user_role NOT NULL, org_id uuid NOT NULL, user_id uuid NOT NULL, status boolean DEFAULT true NOT NULL, job_title text, default_rate numeric(10,2), cost_rate numeric(10,2));
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
ALTER TABLE public.memberships ADD CONSTRAINT memberships_job_title_check CHECK (job_title IS NULL OR char_length(job_title) >= 2 AND char_length(job_title) <= 60);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
GRANT ALL ON public.memberships TO anon;
GRANT ALL ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
CREATE UNIQUE INDEX memberships_user_org_key ON public.memberships (user_id, org_id);
CREATE UNIQUE INDEX memberships_one_primary_admin_per_org ON public.memberships (org_id) WHERE role = 'primary_admin'::public.user_role;
CREATE INDEX memberships_user_id_idx ON public.memberships (user_id);
CREATE INDEX memberships_org_id_idx ON public.memberships (org_id);
CREATE TRIGGER enforce_member_reactivation_limit BEFORE UPDATE OF status ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();
CREATE TRIGGER guard_demo_memberships BEFORE INSERT OR DELETE OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE TRIGGER guard_membership_update BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.guard_membership_update();
CREATE POLICY owners_admins_can_insert_members ON public.memberships FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
CREATE POLICY owners_admins_update_member_role ON public.memberships FOR UPDATE TO authenticated USING ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]) AND (role <> 'primary_admin'::public.user_role))) WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]) AND (role <> 'primary_admin'::public.user_role)));
CREATE POLICY owners_can_delete_members ON public.memberships FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role]));
CREATE POLICY require_mfa_when_enrolled ON public.memberships AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY view_org_members ON public.memberships FOR SELECT TO authenticated USING ((org_id IN ( SELECT public.current_user_orgs() AS current_user_orgs)));
CREATE POLICY view_own_membership ON public.memberships FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.milestones (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, title text NOT NULL, due_date date, status public.milestone_status DEFAULT 'pending'::public.milestone_status NOT NULL, estimated_hours numeric(8,2), client_visible boolean DEFAULT true NOT NULL, "position" smallint DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_estimated_hours_check CHECK (estimated_hours IS NULL OR estimated_hours > 0::numeric);
ALTER TABLE public.milestones ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE CASCADE;
GRANT ALL ON public.milestones TO anon;
GRANT ALL ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
CREATE INDEX milestones_project_id_idx ON public.milestones (project_id);
CREATE POLICY require_mfa_when_enrolled ON public.milestones AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.organizations (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, name text NOT NULL, slug text NOT NULL, logo_url text, website_url text, user_id uuid, daily_capacity_hours smallint DEFAULT 8 NOT NULL, days_per_week smallint DEFAULT 5 NOT NULL, currency text DEFAULT 'USD'::text NOT NULL, rounding_minutes smallint DEFAULT 15 NOT NULL, payment_terms_days smallint DEFAULT 30 NOT NULL, is_demo boolean DEFAULT false NOT NULL);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_currency_check CHECK (char_length(currency) = 3);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_daily_capacity_hours_check CHECK (daily_capacity_hours >= 1 AND daily_capacity_hours <= 24);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_days_per_week_check CHECK (days_per_week >= 1 AND days_per_week <= 7);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_payment_terms_days_check CHECK (payment_terms_days >= 0 AND payment_terms_days <= 365);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
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
CREATE TRIGGER guard_demo_organizations BEFORE DELETE OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE POLICY org_members_can_view ON public.organizations FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = organizations.id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY org_owner_can_update ON public.organizations FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY require_mfa_when_enrolled ON public.organizations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.plans (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, name text NOT NULL, duration_months smallint NOT NULL, price_cents integer NOT NULL, features jsonb DEFAULT '{}'::jsonb NOT NULL, is_active boolean DEFAULT true NOT NULL, price_id character varying, seats smallint);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ADD CONSTRAINT plans_name_duration_months_key UNIQUE (name, duration_months);
ALTER TABLE public.plans ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;
ALTER TABLE public.plans ADD CONSTRAINT plans_seats_check CHECK (seats IS NULL OR seats > 0);
GRANT ALL ON public.plans TO anon;
GRANT ALL ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
CREATE UNIQUE INDEX plans_price_id_key ON public.plans (price_id) WHERE price_id IS NOT NULL;
CREATE POLICY anyone_view_active_plans ON public.plans FOR SELECT TO authenticated USING ((is_active = true));
CREATE POLICY require_mfa_when_enrolled ON public.plans AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.profiles (id uuid NOT NULL, full_name text, avatar_url text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE TRIGGER guard_demo_profiles BEFORE UPDATE OF avatar_url ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE POLICY own_insert_profile ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_update_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY require_mfa_when_enrolled ON public.profiles AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
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
CREATE POLICY require_mfa_when_enrolled ON public.project_allocations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.projects (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, name text NOT NULL, client_id uuid, description text, status public.project_status DEFAULT 'pending'::public.project_status NOT NULL, start_date date, start_from text, due_date timestamp with time zone, created_by uuid, owner_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone, engagement public.engagement_model DEFAULT 'budget'::public.engagement_model NOT NULL, contract_value numeric(12,2), retainer_hours numeric(6,2), retainer_period public.retainer_period, retainer_amount numeric(12,2), retainer_overage numeric(4,2), estimated_hours numeric(8,2), override_reason text, scope_in text, scope_out text, done_when text, sign_off_by text, update_cadence public.update_cadence DEFAULT 'weekly_monday'::public.update_cadence NOT NULL, client_org_id uuid);
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
  WHERE ((p.id = milestones.project_id) AND (((p.client_id = ( SELECT auth.uid() AS uid)) AND milestones.client_visible) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
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
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_estimated_hours_check CHECK (estimated_hours IS NULL OR estimated_hours > 0::numeric);
ALTER TABLE public.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
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
CREATE UNIQUE INDEX projects_id_org_id_key ON public.projects (id, org_id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_project_in_org FOREIGN KEY (project_id, org_id) REFERENCES public.projects(id, org_id) ON DELETE CASCADE;
CREATE INDEX projects_client_org_id_idx ON public.projects (client_org_id);
CREATE INDEX projects_owner_id_idx ON public.projects (owner_id);
CREATE INDEX projects_client_id_idx ON public.projects (client_id);
CREATE INDEX projects_org_id_idx ON public.projects (org_id);
CREATE POLICY owners_admins_delete_projects ON public.projects FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))));
CREATE POLICY owners_admins_insert_projects ON public.projects FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role]))))));
CREATE POLICY require_mfa_when_enrolled ON public.projects AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
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
CREATE TABLE public.subscriptions (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, plan_id uuid, stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent text, status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL, current_period_end timestamp with time zone, payment_method_type text, payment_method_details jsonb DEFAULT '{}'::jsonb NOT NULL, pending_plan_id uuid, pending_change_at timestamp with time zone, plan_change_started_at timestamp with time zone, cancel_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pending_plan_id_fkey FOREIGN KEY (pending_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
GRANT ALL ON public.subscriptions TO anon;
GRANT ALL ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
CREATE INDEX subscriptions_org_id_idx ON public.subscriptions (org_id);
CREATE INDEX subscriptions_plan_id_idx ON public.subscriptions (plan_id);
CREATE UNIQUE INDEX subscriptions_org_id_active_key ON public.subscriptions (org_id) WHERE status = 'active'::public.subscription_status;
CREATE POLICY owners_admins_view_subscription ON public.subscriptions FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
CREATE POLICY require_mfa_when_enrolled ON public.subscriptions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE TABLE public.time_entries (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid NOT NULL, milestone_id uuid, work_date date NOT NULL, duration_minutes integer NOT NULL, description text NOT NULL, status public.time_entry_status DEFAULT 'draft'::public.time_entry_status NOT NULL, billable boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, invoice_id uuid);
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
CREATE INDEX time_entries_milestone_id_idx ON public.time_entries (milestone_id);
CREATE INDEX time_entries_project_id_idx ON public.time_entries (project_id);
CREATE INDEX time_entries_user_id_idx ON public.time_entries (user_id);
CREATE INDEX time_entries_invoice_id_idx ON public.time_entries (invoice_id);
CREATE INDEX time_entries_work_date_idx ON public.time_entries (work_date);
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
CREATE POLICY require_mfa_when_enrolled ON public.time_entries AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
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
CREATE POLICY require_mfa_when_enrolled ON public.updates AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY staff_and_own_client_view_updates ON public.updates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = updates.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
CREATE POLICY staff_insert_updates ON public.updates FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = updates.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role])))))));
CREATE TABLE public.user_preferences (user_id uuid NOT NULL, locale text DEFAULT 'en-GB'::text NOT NULL, time_zone text, last_device_time_zone text, theme text, weekly_digest boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_last_device_time_zone_check CHECK (last_device_time_zone IS NULL OR char_length(last_device_time_zone) >= 1 AND char_length(last_device_time_zone) <= 64);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_locale_check CHECK (locale = ANY (ARRAY['en-GB'::text, 'en-US'::text]));
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_theme_check CHECK (theme IS NULL OR (theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])));
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_time_zone_check CHECK (time_zone IS NULL OR char_length(time_zone) >= 1 AND char_length(time_zone) <= 64);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
GRANT ALL ON public.user_preferences TO anon;
GRANT ALL ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
CREATE INDEX user_preferences_weekly_digest_idx ON public.user_preferences (user_id) WHERE weekly_digest;
CREATE POLICY insert_own_preferences ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY require_mfa_when_enrolled ON public.user_preferences AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY update_own_preferences ON public.user_preferences FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY view_own_preferences ON public.user_preferences FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.user_sessions (session_id uuid NOT NULL, user_id uuid NOT NULL, user_agent text, city text, country text, created_at timestamp with time zone DEFAULT now() NOT NULL, last_seen_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (session_id);
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.user_sessions TO anon;
GRANT ALL ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
CREATE INDEX user_sessions_user_id_idx ON public.user_sessions (user_id);
CREATE POLICY require_mfa_when_enrolled ON public.user_sessions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY view_own_user_sessions ON public.user_sessions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

revoke execute on function public.check_email_exists(text)   from public, anon, authenticated;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.check_email_exists(text)   to service_role;
grant  execute on function public.revoke_user_sessions(uuid) to service_role;
