SET check_function_bodies = false;
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
$function$;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) TO anon;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.update_delivery_status(p_status public.delivery_status, p_delivery_id uuid, p_project_id uuid)
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
$function$;
