SET check_function_bodies = false;
CREATE FUNCTION public.revoke_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_user_id is null then
    raise exception 'A user id is required' using errcode = '22023';
  end if;

  delete from auth.sessions where user_id = p_user_id;
end;
$function$;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
