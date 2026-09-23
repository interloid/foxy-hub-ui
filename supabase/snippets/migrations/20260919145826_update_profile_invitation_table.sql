SET check_function_bodies = false;
ALTER TABLE public.invitations DROP CONSTRAINT invitations_client_needs_project;
CREATE OR REPLACE FUNCTION public.current_user_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select org_id from public.memberships
  where user_id = auth.uid() and status;
$function$;
CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id uuid, allowed_roles public.user_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id  = target_org_id
      and role    = any(allowed_roles)
      and status
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id and status
  );
$function$;
ALTER TABLE public.memberships ADD COLUMN status boolean DEFAULT true NOT NULL;
