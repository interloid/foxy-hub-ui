SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.update_delivery_status(p_status public.delivery_status, p_delivery_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.deliveries
     set status = p_status
   where id = p_delivery_id
     and exists (
       select 1 from public.memberships
       where memberships.user_id = auth.uid()
         and memberships.org_id  = deliveries.org_id
         and memberships.role    = 'client'
     );

  if not found then
    raise exception 'Not authorized to update this delivery';
  end if;
end;
$function$;
