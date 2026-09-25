SET check_function_bodies = false;
CREATE FUNCTION public.enforce_plan_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
GRANT ALL ON FUNCTION public.enforce_plan_limits() TO anon;
GRANT ALL ON FUNCTION public.enforce_plan_limits() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_plan_limits() TO service_role;
CREATE TRIGGER enforce_client_limit BEFORE INSERT OR UPDATE OF status ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();
CREATE TRIGGER enforce_member_limit BEFORE INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();
