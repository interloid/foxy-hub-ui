SET check_function_bodies = false;
DROP FUNCTION public.create_project_with_allocations(project_data jsonb, allocations_data jsonb);
ALTER TYPE public.engagement_model ADD VALUE 'budget' AFTER 'fixed';
ALTER TYPE public.engagement_model ADD VALUE 'hourly' AFTER 'budget';
CREATE TYPE public.update_cadence AS ENUM ('weekly_monday', 'weekly_friday', 'biweekly', 'monthly');
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
ALTER TABLE public.milestones ADD COLUMN estimated_hours numeric(8,2);
ALTER TABLE public.milestones ADD CONSTRAINT milestones_estimated_hours_check CHECK (estimated_hours IS NULL OR estimated_hours > 0::numeric);
ALTER TABLE public.milestones ADD COLUMN client_visible boolean DEFAULT true NOT NULL;
ALTER TABLE public.milestones ADD COLUMN "position" smallint DEFAULT 0 NOT NULL;
ALTER TABLE public.projects ADD COLUMN owner_id uuid;
ALTER TABLE public.projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN scope_in text;
ALTER TABLE public.projects ADD COLUMN scope_out text;
ALTER TABLE public.projects ADD COLUMN done_when text;
ALTER TABLE public.projects ADD COLUMN sign_off_by text;
ALTER TABLE public.projects ADD COLUMN update_cadence public.update_cadence DEFAULT 'weekly_monday'::public.update_cadence NOT NULL;
CREATE INDEX projects_owner_id_idx ON public.projects (owner_id);
ALTER POLICY staff_and_own_client_view_milestones ON public.milestones USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = milestones.project_id) AND (((p.client_id = ( SELECT auth.uid() AS uid)) AND milestones.client_visible) OR public.has_org_role(p.org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role, 'manager'::public.user_role, 'contributor'::public.user_role]))))));
