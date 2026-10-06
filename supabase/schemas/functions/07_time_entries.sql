-- =====================================================================
-- Time entries: logging with the capacity check, and the submit / approve / reject transitions.
-- SECURITY DEFINER functions: all must set search_path = '' and fully
-- qualify every reference.
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

create or replace function public.create_time_entry_with_capacity_check(
  p_user_id uuid,
  p_project_id uuid,
  p_milestone_id uuid,
  p_work_date date,
  p_duration_minutes integer,
  p_description text,
  p_org_id uuid,
  -- Last and defaulted, so callers that predate the Billable toggle keep working.
  p_billable boolean default true
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
$$;

-- Grant execution permission to authenticated users
grant execute on function public.create_time_entry_with_capacity_check(uuid, uuid, uuid, date, integer, text, uuid, boolean) to authenticated;
