-- =====================================================================
-- Workspace settings and plan limits.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
-- =====================================================================

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
--                               plans.seats (null = unlimited)
--   clients (new, or reactivated) → active clients vs max_clients
--
-- No active subscription, or a limit of -1 / missing, means unlimited —
-- the same as the app's toLimit().
--
-- Seats also respect a booked downgrade (`subscriptions.pending_plan_id`):
-- the limit is the SMALLER of the current and upcoming plan, so the team
-- cannot grow past what the plan it is moving to allows. Stripe applies
-- the change on its own at renewal and would not stop for a full team.
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
$$;
