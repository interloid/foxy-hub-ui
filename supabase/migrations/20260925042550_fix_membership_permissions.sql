SET check_function_bodies = false;
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

  if new.status is distinct from old.status
     and not public.has_org_role(old.org_id, array['primary_admin']::public.user_role[]) then
    raise exception 'Only the primary admin can deactivate or reactivate people'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
GRANT ALL ON FUNCTION public.guard_membership_update() TO anon;
GRANT ALL ON FUNCTION public.guard_membership_update() TO authenticated;
GRANT ALL ON FUNCTION public.guard_membership_update() TO service_role;
CREATE OR REPLACE FUNCTION public.update_membership_details(target_membership_id uuid, new_full_name text, new_job_title text, new_role public.user_role)
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
CREATE TRIGGER guard_membership_update BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.guard_membership_update();
ALTER POLICY owners_admins_create_invitations ON public.invitations WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]) AND (invited_by = ( SELECT auth.uid() AS uid)) AND (accepted_at IS NULL) AND (accepted_by IS NULL)));
ALTER POLICY owners_admins_delete_invitations ON public.invitations USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
ALTER POLICY owners_admins_can_insert_members ON public.memberships WITH CHECK (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
ALTER POLICY owners_admins_update_member_role ON public.memberships USING ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]) AND (role <> 'primary_admin'::public.user_role)));
ALTER POLICY owners_admins_update_member_role ON public.memberships WITH CHECK ((public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]) AND (role <> 'primary_admin'::public.user_role)));
