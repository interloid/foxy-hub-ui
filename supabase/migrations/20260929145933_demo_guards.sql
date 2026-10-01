SET check_function_bodies = false;
CREATE FUNCTION public.demo_reset_running()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(current_setting('app.demo_reset', true), '') = 'on';
$function$;
GRANT ALL ON FUNCTION public.demo_reset_running() TO anon;
GRANT ALL ON FUNCTION public.demo_reset_running() TO authenticated;
GRANT ALL ON FUNCTION public.demo_reset_running() TO service_role;
CREATE FUNCTION public.guard_demo_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_blocked boolean := false;
begin
  if public.demo_reset_running() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'organizations' then
    -- Any workspace: the flag is what switches every other guard on, so no API caller
    -- may flip it. SQL run without a user (editor, migrations) still can.
    if tg_op = 'UPDATE'
       and new.is_demo is distinct from old.is_demo
       and (select auth.uid()) is not null then
      v_blocked := true;
    -- The name, URL and owner are what every visitor sees and signs in through; the logo
    -- and website are links shown to all of them.
    elsif old.is_demo and (
      tg_op = 'DELETE'
      or new.name        is distinct from old.name
      or new.slug        is distinct from old.slug
      or new.user_id     is distinct from old.user_id
      or new.logo_url    is distinct from old.logo_url
      or new.website_url is distinct from old.website_url
    ) then
      v_blocked := true;
    end if;

  elsif tg_table_name = 'memberships' then
    -- Each demo login must stay in its role: no one joins, leaves, moves or changes role.
    -- Job titles stay editable.
    if public.is_demo_org(coalesce(new.org_id, old.org_id)) and (
      tg_op in ('INSERT', 'DELETE')
      or new.role    is distinct from old.role
      or new.status  is distinct from old.status
      or new.user_id is distinct from old.user_id
      or new.org_id  is distinct from old.org_id
    ) then
      v_blocked := true;
    end if;

  elsif tg_table_name = 'invitations' then
    -- An invitation is an email to a real address.
    v_blocked := public.is_demo_org(new.org_id);

  elsif tg_table_name = 'clients' then
    -- Deactivating a client cuts the demo client login off from the portal.
    v_blocked := public.is_demo_org(new.org_id)
      and new.status is distinct from old.status;

  elsif tg_table_name = 'invoices' then
    -- The portal sends the client to `invoice_url` to pay; a planted link would reach
    -- the next visitor. The Stripe ids only ever come from Stripe.
    v_blocked := public.is_demo_org(new.org_id) and (
      tg_op = 'INSERT' and (new.invoice_url is not null or new.stripe_invoice_id is not null)
      or tg_op = 'UPDATE' and (
        new.invoice_url       is distinct from old.invoice_url
        or new.stripe_invoice_id is distinct from old.stripe_invoice_id
      )
    );

  elsif tg_table_name = 'profiles' then
    -- Uploads are off in the demo; an avatar_url pointing anywhere else would be shown
    -- to every visitor.
    v_blocked := new.avatar_url is distinct from old.avatar_url
      and public.is_demo_member(new.id);
  end if;

  if v_blocked then
    raise exception 'Disabled in the demo.' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$function$;
GRANT ALL ON FUNCTION public.guard_demo_writes() TO anon;
GRANT ALL ON FUNCTION public.guard_demo_writes() TO authenticated;
GRANT ALL ON FUNCTION public.guard_demo_writes() TO service_role;
CREATE FUNCTION public.is_demo_member(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = target_user_id
       and m.status
       and o.is_demo
  );
$function$;
GRANT ALL ON FUNCTION public.is_demo_member(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_demo_member(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_demo_member(uuid) TO service_role;
CREATE TRIGGER guard_demo_clients BEFORE UPDATE OF status ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE TRIGGER guard_demo_invitations BEFORE INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE TRIGGER guard_demo_invoices BEFORE INSERT OR UPDATE OF invoice_url, stripe_invoice_id ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE TRIGGER guard_demo_memberships BEFORE INSERT OR DELETE OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE TRIGGER guard_demo_organizations BEFORE DELETE OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
CREATE TRIGGER guard_demo_profiles BEFORE UPDATE OF avatar_url ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_demo_writes();
