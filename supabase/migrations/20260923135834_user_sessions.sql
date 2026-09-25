SET check_function_bodies = false;
CREATE FUNCTION public.list_my_sessions()
 RETURNS TABLE(session_id uuid, user_agent text, city text, country text, created_at timestamp with time zone, last_seen_at timestamp with time zone, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.id,
    u.user_agent,
    u.city,
    u.country,
    s.created_at,
    greatest(
      u.last_seen_at,
      s.refreshed_at at time zone 'utc',
      s.updated_at,
      s.created_at
    ) as last_seen_at,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  left join public.user_sessions u on u.session_id = s.id
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by is_current desc, last_seen_at desc;
$function$;
GRANT ALL ON FUNCTION public.list_my_sessions() TO anon;
GRANT ALL ON FUNCTION public.list_my_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.list_my_sessions() TO service_role;
CREATE FUNCTION public.revoke_my_session(target_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if target_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid then
    raise exception 'Use sign out for this device' using errcode = '22023';
  end if;

  delete from auth.sessions
   where id = target_session_id
     and user_id = v_user_id;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
end;
$function$;
GRANT ALL ON FUNCTION public.revoke_my_session(uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_my_session(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_my_session(uuid) TO service_role;
CREATE FUNCTION public.touch_my_session(p_user_agent text, p_city text, p_country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_user_id is null or v_session_id is null then
    return;
  end if;

  -- The session must really be the caller's; the FK alone would accept any id.
  if not exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.user_sessions (session_id, user_id, user_agent, city, country)
  values (
    v_session_id,
    v_user_id,
    left(nullif(trim(p_user_agent), ''), 512),
    left(nullif(trim(p_city), ''), 120),
    left(nullif(trim(p_country), ''), 2)
  )
  on conflict (session_id) do update
     set user_agent   = coalesce(excluded.user_agent, public.user_sessions.user_agent),
         city         = coalesce(excluded.city, public.user_sessions.city),
         country      = coalesce(excluded.country, public.user_sessions.country),
         last_seen_at = now()
   where public.user_sessions.last_seen_at < now() - interval '2 minutes';
end;
$function$;
GRANT ALL ON FUNCTION public.touch_my_session(text, text, text) TO anon;
GRANT ALL ON FUNCTION public.touch_my_session(text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.touch_my_session(text, text, text) TO service_role;
CREATE TABLE public.user_sessions (session_id uuid NOT NULL, user_id uuid NOT NULL, user_agent text, city text, country text, created_at timestamp with time zone DEFAULT now() NOT NULL, last_seen_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (session_id);
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.user_sessions TO anon;
GRANT ALL ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
CREATE INDEX user_sessions_user_id_idx ON public.user_sessions (user_id);
CREATE POLICY view_own_user_sessions ON public.user_sessions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
