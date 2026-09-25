SET check_function_bodies = false;
CREATE FUNCTION public.update_workspace_settings(target_org_id uuid, new_name text DEFAULT NULL::text, new_currency text DEFAULT NULL::text, new_daily_capacity_hours smallint DEFAULT NULL::smallint, new_days_per_week smallint DEFAULT NULL::smallint, new_rounding_minutes smallint DEFAULT NULL::smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name     text := nullif(trim(new_name), '');
  v_currency text := upper(nullif(trim(new_currency), ''));
begin
  -- has_org_role also carries the two-factor gate (mfa_satisfied).
  if not public.has_org_role(
       target_org_id, array['primary_admin', 'admin']::public.user_role[]
     ) then
    raise exception 'Only a primary admin or admin can change workspace settings'
      using errcode = '42501';
  end if;

  if new_name is not null and (v_name is null or char_length(v_name) > 80) then
    raise exception 'Workspace name must be 1 to 80 characters' using errcode = '22023';
  end if;

  if v_currency is not null and v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter code' using errcode = '22023';
  end if;

  update public.organizations
     set name                 = coalesce(v_name, name),
         currency             = coalesce(v_currency, currency),
         daily_capacity_hours = coalesce(new_daily_capacity_hours, daily_capacity_hours),
         days_per_week        = coalesce(new_days_per_week, days_per_week),
         rounding_minutes     = coalesce(new_rounding_minutes, rounding_minutes)
   where id = target_org_id;

  if not found then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
end;
$function$;
GRANT ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, smallint, smallint, smallint) TO anon;
GRANT ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, smallint, smallint, smallint) TO authenticated;
GRANT ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, smallint, smallint, smallint) TO service_role;
CREATE TABLE public.digest_deliveries (user_id uuid NOT NULL, org_id uuid NOT NULL, week_start date NOT NULL, status text NOT NULL, message_id text, error text, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.digest_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_pkey PRIMARY KEY (user_id, org_id, week_start);
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_status_check CHECK (status = ANY (ARRAY['sent'::text, 'skipped'::text, 'failed'::text]));
ALTER TABLE public.digest_deliveries ADD CONSTRAINT digest_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
GRANT ALL ON public.digest_deliveries TO anon;
GRANT ALL ON public.digest_deliveries TO authenticated;
GRANT ALL ON public.digest_deliveries TO service_role;
CREATE INDEX digest_deliveries_week_idx ON public.digest_deliveries (week_start);
