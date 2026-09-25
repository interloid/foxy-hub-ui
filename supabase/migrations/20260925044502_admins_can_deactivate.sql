SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.guard_membership_update()
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

  return new;
end;
$function$;
