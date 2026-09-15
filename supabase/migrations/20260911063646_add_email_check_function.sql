SET check_function_bodies = false;
CREATE FUNCTION public.check_email_exists(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Reject malformed inputs immediately
  if p_email is null or length(p_email) < 3 or position('@' in p_email) = 0 then
    raise exception 'Invalid email format' using errcode = '22023';
  end if;

  return exists (
    select 1 
    from auth.users 
    where lower(email) = lower(trim(p_email))
  );
end;
$function$;
GRANT ALL ON FUNCTION public.check_email_exists(text) TO anon;
GRANT ALL ON FUNCTION public.check_email_exists(text) TO authenticated;
GRANT ALL ON FUNCTION public.check_email_exists(text) TO service_role;
