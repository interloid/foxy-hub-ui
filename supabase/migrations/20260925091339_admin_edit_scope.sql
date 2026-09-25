SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.update_membership_details(target_membership_id uuid, new_full_name text DEFAULT NULL::text, new_job_title text DEFAULT NULL::text, new_role public.user_role DEFAULT NULL::public.user_role)
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
