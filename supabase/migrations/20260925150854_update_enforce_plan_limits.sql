SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.enforce_plan_limits()
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

  select nullif(p.features ->> v_key, '')::integer,
         nullif(pp.features ->> v_key, '')::integer,
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
