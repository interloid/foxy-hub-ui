SET check_function_bodies = false;
CREATE FUNCTION public.is_demo_org(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select o.is_demo from public.organizations o where o.id = target_org_id),
    false
  );
$function$;
GRANT ALL ON FUNCTION public.is_demo_org(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_demo_org(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_demo_org(uuid) TO service_role;
ALTER TABLE public.organizations ADD COLUMN is_demo boolean DEFAULT false NOT NULL;
