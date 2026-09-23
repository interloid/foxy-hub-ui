SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.create_project_with_allocations(project_data jsonb, allocations_data jsonb DEFAULT '[]'::jsonb)
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
$function$;
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
CREATE FUNCTION public.update_membership_details(target_membership_id uuid, new_full_name text, new_job_title text, new_role public.user_role)
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

  if not public.has_org_role(
       v_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]
     ) then
    raise exception 'Not authorized to edit this teammate' using errcode = '42501';
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
CREATE UNIQUE INDEX memberships_one_primary_admin_per_org ON public.memberships (org_id) WHERE role = 'primary_admin'::public.user_role;
ALTER TABLE public.projects ADD COLUMN created_by uuid;
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
