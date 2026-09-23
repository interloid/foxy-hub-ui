SET check_function_bodies = false;
CREATE FUNCTION public.reject_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
    from public.time_entries te
    join public.projects p on te.project_id = p.id
    where te.id     = entry_id
      and te.status = 'submitted'
      and public.has_org_role(
        p.org_id,
        array['owner', 'admin']::public.user_role[]
      )
  ) then
    update public.time_entries
       set status = 'rejected'
     where id = entry_id;
  else
    raise exception 'Not authorized to reject this entry';
  end if;
end;
$function$;
GRANT ALL ON FUNCTION public.reject_time_entry(uuid) TO anon;
GRANT ALL ON FUNCTION public.reject_time_entry(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reject_time_entry(uuid) TO service_role;
