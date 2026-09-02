SET check_function_bodies = false;
CREATE EXTENSION pg_partman WITH SCHEMA extensions;
CREATE EXTENSION wrappers WITH SCHEMA extensions;
CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION pgmq;
CREATE TYPE public.delivery_status AS ENUM ('pending', 'submitted', 'approved', 'rejected');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'due', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE public.project_status AS ENUM ('draft', 'in-progress', 'pending-approval', 'pending', 'on-hold', 'completed', 'cancelled');
CREATE TYPE public.roles AS ENUM ('admin', 'user');
CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'cancelled', 'expired', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');
CREATE TYPE public.time_entry_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'member', 'client');
CREATE FUNCTION public.approve_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Owners AND admins may approve. The old join was on `organizations.user_id` — the org's
  -- single creator — so a user with the `admin` role could not approve anything, even
  -- though approvals are an Admin-dashboard action in the design.
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
       set status = 'approved'
     where id = entry_id;
  else
    raise exception 'Not authorized to approve this entry';
  end if;
end;
$function$;
CREATE FUNCTION public.current_user_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select org_id from public.memberships where user_id = auth.uid();
$function$;
CREATE FUNCTION public.handle_new_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id      uuid;
  v_user_id     uuid := new.id;
  v_plan_id     uuid;
  v_token       text := nullif(new.raw_user_meta_data->>'invite_token', '');
  v_user_name   text := new.raw_user_meta_data->>'user_name';
  v_invite      public.invitations%rowtype;
  v_org_name    text;
  v_slug        text;
begin
  insert into public.profiles (id, full_name)
  values (v_user_id, v_user_name);

  if v_token is not null then
    -- ---- Invited user path ------------------------------------------------
    -- `digest` comes from pgcrypto, installed into the extensions schema, so it
    -- must be qualified: search_path is '' and nothing but pg_catalog resolves.
    --
    -- FOR UPDATE locks the row for this transaction, so two signups racing on the
    -- same token cannot both redeem it — the second blocks, then fails the
    -- accepted_at check below.
    select * into v_invite
      from public.invitations
     where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
       for update;

    -- Every branch fails CLOSED. This trigger is AFTER INSERT on auth.users, so a
    -- raise rolls the whole signup back and no account is created.
    if not found then
      raise exception 'Invalid invitation token' using errcode = '22023';
    end if;

    if v_invite.accepted_at is not null then
      raise exception 'This invitation has already been used' using errcode = '22023';
    end if;

    if v_invite.expires_at <= now() then
      raise exception 'This invitation has expired' using errcode = '22023';
    end if;

    -- Binds the token to one address, so a forwarded or intercepted link cannot be
    -- redeemed by a different account.
    if lower(v_invite.email) <> lower(coalesce(new.email, '')) then
      raise exception 'This invitation was issued to a different email address'
        using errcode = '22023';
    end if;

    -- org_id and role come from the INVITATION, never from the payload. No text cast
    -- either: v_invite.role is already public.user_role, and the table's check
    -- constraint forbids 'owner'.
    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_invite.org_id, v_invite.role);

    if v_invite.role = 'client' then
      -- The composite FK on invitations already guarantees this project belongs to
      -- v_invite.org_id, so there is no way to point a client at another org's work.
      update public.projects
         set client_id = v_user_id
       where id = v_invite.project_id;
    end if;

    update public.invitations
       set accepted_at = now(),
           accepted_by = v_user_id
     where id = v_invite.id;

  else
    -- ---- New owner path ---------------------------------------------------
    -- org_name and slug are user-supplied, and that is safe: this user is creating
    -- their OWN new organisation and becoming its owner. There is no existing tenant
    -- to escalate into. Contrast the invited path above, where org and role must come
    -- from an invitation precisely because they name someone else's tenant.
    --
    -- They are VALIDATED, though. `organizations.name` and `slug` are NOT NULL, but a
    -- constraint violation here surfaces as an opaque 500 from the auth endpoint; these
    -- checks fail with a message the wizard can show. Signup rolls back either way —
    -- this is an AFTER INSERT trigger on auth.users.
    v_org_name := nullif(trim(new.raw_user_meta_data->>'org_name'), '');
    v_slug     := lower(nullif(trim(new.raw_user_meta_data->>'slug'), ''));

    if v_org_name is null then
      raise exception 'An organisation name is required' using errcode = '22023';
    end if;

    if v_slug is null then
      raise exception 'A workspace URL is required' using errcode = '22023';
    end if;

    -- Checked explicitly so a taken slug reads as a taken slug rather than as
    -- "organizations_slug_key violated". `is_slug_available` is the same function the
    -- wizard calls on step 1; this is the authoritative re-check at write time, since
    -- anything can change between the two.
    if not public.is_slug_available(v_slug) then
      raise exception 'That workspace URL is already taken' using errcode = '22023';
    end if;

    -- The subscription every new workspace starts on, before any plan is chosen.
    -- 'Free' must therefore always exist as an active row — see
    -- migrations/20260807150000_reseed_design_plans.sql, which keeps it for this reason.
    select id into v_plan_id
      from public.plans
     where name = 'Free'
     limit 1;

    insert into public.organizations (name, slug, user_id)
    values (v_org_name, v_slug, v_user_id)
    returning id into v_org_id;

    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_org_id, 'owner');

    insert into public.subscriptions (plan_id, org_id)
    values (v_plan_id, v_org_id);
  end if;

  return new;
end;
$function$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();
CREATE FUNCTION public.has_org_role(target_org_id uuid, allowed_roles public.user_role[])
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
  );
$function$;
CREATE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org_id
  );
$function$;
CREATE FUNCTION public.is_slug_available(candidate text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (
    select 1 from public.organizations
    where lower(slug) = lower(trim(candidate))
  );
$function$;
GRANT ALL ON FUNCTION public.is_slug_available(text) TO anon;
GRANT ALL ON FUNCTION public.is_slug_available(text) TO authenticated;
CREATE FUNCTION public.submit_time_entry(entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.time_entries
    where id = entry_id
      and user_id = auth.uid()
      and status = 'draft'
  ) then
    update public.time_entries
       set status = 'submitted'
     where id = entry_id;
  else
    raise exception 'Not authorized or entry is not in draft state';
  end if;
end;
$function$;
CREATE FUNCTION public.update_delivery_status(p_status public.delivery_status, p_delivery_id uuid, p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- The caller must be the client OF THIS PROJECT, not merely a client somewhere in the
  -- org. The previous test was `memberships.role = 'client'` for the delivery's org, which
  -- let any one of an agency's clients change the status of every other client's
  -- deliverables — the write-side twin of the read leak fixed in `06_rls_deliveries`.
  -- Scoping the SELECT alone would have left this open, since a caller only needs the id.
  --
  -- `p_project_id` is now actually used: it was accepted and ignored, so a caller could
  -- pass anything. Requiring it to match the delivery's own project makes a mismatched
  -- pair fail instead of silently succeeding.
  update public.deliveries
     set status = p_status
   where id = p_delivery_id
     and deliveries.project_id = p_project_id
     and exists (
       select 1 from public.projects p
       where p.id        = deliveries.project_id
         and p.client_id = auth.uid()
     );

  if not found then
    raise exception 'Not authorized to update this delivery';
  end if;
end;
$function$;
CREATE TABLE public.deliveries (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, org_id uuid NOT NULL, milestone_id uuid, title text NOT NULL, description text, status public.delivery_status DEFAULT 'pending'::public.delivery_status NOT NULL, approved_at timestamp with time zone);
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.deliveries TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.deliveries TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.deliveries TO service_role;
CREATE INDEX deliveries_project_id_idx ON public.deliveries (project_id);
CREATE INDEX deliveries_org_id_idx ON public.deliveries (org_id);
CREATE TABLE public.delivery_assets (id uuid DEFAULT gen_random_uuid() NOT NULL, delivery_id uuid NOT NULL, file_path text NOT NULL);
ALTER TABLE public.delivery_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assets ADD CONSTRAINT delivery_assets_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_assets ADD CONSTRAINT delivery_assets_pkey PRIMARY KEY (id);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.delivery_assets TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.delivery_assets TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.delivery_assets TO service_role;
CREATE INDEX delivery_assets_delivery_id_idx ON public.delivery_assets (delivery_id);
CREATE TABLE public.invitations (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, project_id uuid, email text NOT NULL, role public.user_role NOT NULL, token_hash text NOT NULL, invited_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL, accepted_at timestamp with time zone, accepted_by uuid);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_client_needs_project CHECK (role <> 'client'::public.user_role OR project_id IS NOT NULL);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (role = ANY (ARRAY['admin'::public.user_role, 'member'::public.user_role, 'client'::public.user_role]));
ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invitations TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invitations TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invitations TO service_role;
CREATE INDEX invitations_email_idx ON public.invitations (lower(email));
CREATE UNIQUE INDEX invitations_pending_email_org_key ON public.invitations (org_id, lower(email)) WHERE accepted_at IS NULL;
CREATE INDEX invitations_org_id_idx ON public.invitations (org_id);
CREATE POLICY owners_admins_create_invitations ON public.invitations FOR INSERT TO authenticated WITH CHECK ((public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]) AND (invited_by = ( SELECT auth.uid() AS uid)) AND (accepted_at IS NULL) AND (accepted_by IS NULL)));
CREATE POLICY owners_admins_delete_invitations ON public.invitations FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]));
CREATE POLICY owners_admins_view_invitations ON public.invitations FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]));
CREATE TABLE public.invoices (id uuid DEFAULT gen_random_uuid() NOT NULL, invoice_number text NOT NULL, org_id uuid NOT NULL, project_id uuid NOT NULL, amount numeric NOT NULL, subtotal numeric DEFAULT 0 NOT NULL, tax_amount numeric DEFAULT 0 NOT NULL, currency text DEFAULT 'INR'::text NOT NULL, description text, invoice_url text, status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL, payment_intent text, created_at timestamp with time zone DEFAULT now() NOT NULL, due_date timestamp with time zone, paid_at timestamp with time zone);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_amount_check CHECK (amount >= 0::numeric);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_currency_check CHECK (char_length(currency) = 3);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_intent_key UNIQUE (payment_intent);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_subtotal_check CHECK (subtotal >= 0::numeric);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_tax_amount_check CHECK (tax_amount >= 0::numeric);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invoices TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invoices TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invoices TO service_role;
CREATE INDEX invoices_org_id_idx ON public.invoices (org_id);
CREATE INDEX invoices_project_id_idx ON public.invoices (project_id);
CREATE INDEX invoices_number_idx ON public.invoices (invoice_number);
CREATE TABLE public.memberships (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, role public.user_role NOT NULL, org_id uuid NOT NULL, user_id uuid NOT NULL);
CREATE POLICY owners_admins_insert_deliveries ON public.deliveries FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = deliveries.org_id) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))));
CREATE POLICY staff_update_deliveries ON public.deliveries FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = deliveries.org_id) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY staff_insert_delivery_assets ON public.delivery_assets FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.deliveries d
     JOIN public.memberships m ON ((d.org_id = m.org_id)))
  WHERE ((d.id = delivery_assets.delivery_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY staff_update_delivery_assets ON public.delivery_assets FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.deliveries d
     JOIN public.memberships m ON ((d.org_id = m.org_id)))
  WHERE ((d.id = delivery_assets.delivery_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY owners_admins_insert_invoices ON public.invoices FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = invoices.org_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))));
CREATE POLICY owners_admins_update_invoices ON public.invoices FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = invoices.org_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))));
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memberships TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memberships TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memberships TO service_role;
CREATE INDEX memberships_user_id_idx ON public.memberships (user_id);
CREATE INDEX memberships_org_id_idx ON public.memberships (org_id);
CREATE UNIQUE INDEX memberships_user_org_key ON public.memberships (user_id, org_id);
CREATE POLICY owners_admins_can_insert_members ON public.memberships FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]));
CREATE POLICY owners_admins_update_member_role ON public.memberships FOR UPDATE TO authenticated USING ((public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]) AND (role <> 'owner'::public.user_role))) WITH CHECK ((public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]) AND (role <> 'owner'::public.user_role)));
CREATE POLICY owners_can_delete_members ON public.memberships FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['owner'::public.user_role]));
CREATE POLICY view_org_members ON public.memberships FOR SELECT TO authenticated USING ((org_id IN ( SELECT public.current_user_orgs() AS current_user_orgs)));
CREATE POLICY view_own_membership ON public.memberships FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.milestones (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, title text NOT NULL, due_date date, status public.milestone_status DEFAULT 'pending'::public.milestone_status NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE CASCADE;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.milestones TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.milestones TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.milestones TO service_role;
CREATE INDEX milestones_project_id_idx ON public.milestones (project_id);
CREATE TABLE public.organizations (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, name text NOT NULL, slug text NOT NULL, logo_url text, website_url text, user_id uuid, daily_capacity_hours smallint DEFAULT 8 NOT NULL);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO service_role;
CREATE INDEX organizations_user_id_idx ON public.organizations (user_id);
CREATE UNIQUE INDEX organizations_slug_key ON public.organizations (slug);
CREATE POLICY org_members_can_view ON public.organizations FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.org_id = organizations.id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY org_owner_can_update ON public.organizations FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.plans (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, name text NOT NULL, duration_months smallint NOT NULL, price_cents integer NOT NULL, features jsonb DEFAULT '{}'::jsonb NOT NULL, is_active boolean DEFAULT true NOT NULL, price_id character varying);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ADD CONSTRAINT plans_name_duration_months_key UNIQUE (name, duration_months);
ALTER TABLE public.plans ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.plans TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.plans TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.plans TO service_role;
CREATE UNIQUE INDEX plans_price_id_key ON public.plans (price_id) WHERE price_id IS NOT NULL;
CREATE POLICY anyone_view_active_plans ON public.plans FOR SELECT TO authenticated USING ((is_active = true));
CREATE TABLE public.profiles (id uuid NOT NULL, full_name text, avatar_url text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO service_role;
CREATE POLICY own_insert_profile ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_update_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY view_own_and_co_member_profiles ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = profiles.id) AND (m.org_id IN ( SELECT public.current_user_orgs() AS current_user_orgs)))))));
CREATE TABLE public.projects (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, name text NOT NULL, client_id uuid, description text, status public.project_status DEFAULT 'pending'::public.project_status NOT NULL, start_date timestamp with time zone, due_date timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone);
CREATE POLICY staff_and_project_client_view_deliveries ON public.deliveries FOR SELECT TO authenticated USING ((public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = deliveries.project_id) AND (p.client_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY staff_and_project_client_view_delivery_assets ON public.delivery_assets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.deliveries d
  WHERE ((d.id = delivery_assets.delivery_id) AND (public.has_org_role(d.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]) OR (EXISTS ( SELECT 1
           FROM public.projects p
          WHERE ((p.id = d.project_id) AND (p.client_id = ( SELECT auth.uid() AS uid))))))))));
CREATE POLICY members_and_client_view_invoices ON public.invoices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM public.memberships m
          WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = p.org_id)))))))));
CREATE POLICY org_and_client_view_milestones ON public.milestones FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     LEFT JOIN public.memberships m ON (((p.org_id = m.org_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))
  WHERE ((p.id = milestones.project_id) AND ((m.user_id IS NOT NULL) OR (p.client_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY staff_delete_milestones ON public.milestones FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = milestones.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY staff_insert_milestones ON public.milestones FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = milestones.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY staff_update_milestones ON public.milestones FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = milestones.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.projects TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.projects TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.projects TO service_role;
CREATE INDEX projects_client_id_idx ON public.projects (client_id);
CREATE INDEX projects_org_id_idx ON public.projects (org_id);
CREATE UNIQUE INDEX projects_id_org_id_key ON public.projects (id, org_id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_project_in_org FOREIGN KEY (project_id, org_id) REFERENCES public.projects(id, org_id) ON DELETE CASCADE;
CREATE POLICY members_and_client_view_projects ON public.projects FOR SELECT TO authenticated USING (((client_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id))))));
CREATE POLICY owners_admins_delete_projects ON public.projects FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))));
CREATE POLICY owners_admins_insert_projects ON public.projects FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))));
CREATE POLICY staff_update_projects ON public.projects FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.org_id = projects.org_id) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE TABLE public.stripe_events (id uuid DEFAULT gen_random_uuid() NOT NULL, event_id text NOT NULL, type text NOT NULL, processed_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_event_id_key UNIQUE (event_id);
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events TO service_role;
CREATE INDEX stripe_events_type_idx ON public.stripe_events (type);
CREATE TABLE public.subscriptions (id uuid DEFAULT gen_random_uuid() NOT NULL, org_id uuid NOT NULL, plan_id uuid, stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent text, status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL, current_period_end timestamp with time zone, payment_method_type text, payment_method_details jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.subscriptions TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.subscriptions TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.subscriptions TO service_role;
CREATE UNIQUE INDEX subscriptions_org_id_active_key ON public.subscriptions (org_id) WHERE status = 'active'::public.subscription_status;
CREATE INDEX subscriptions_plan_id_idx ON public.subscriptions (plan_id);
CREATE INDEX subscriptions_org_id_idx ON public.subscriptions (org_id);
CREATE POLICY org_owner_view_subscription ON public.subscriptions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organizations o
  WHERE ((o.id = subscriptions.org_id) AND (o.user_id = ( SELECT auth.uid() AS uid))))));
CREATE TABLE public.time_entries (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid NOT NULL, milestone_id uuid, work_date date NOT NULL, duration_minutes integer NOT NULL, description text NOT NULL, status public.time_entry_status DEFAULT 'draft'::public.time_entry_status NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_duration_minutes_check CHECK (duration_minutes > 0);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.time_entries TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.time_entries TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.time_entries TO service_role;
CREATE INDEX time_entries_project_id_idx ON public.time_entries (project_id);
CREATE INDEX time_entries_user_id_idx ON public.time_entries (user_id);
CREATE INDEX time_entries_milestone_id_idx ON public.time_entries (milestone_id);
CREATE INDEX time_entries_work_date_idx ON public.time_entries (work_date);
CREATE POLICY members_insert_entries ON public.time_entries FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = time_entries.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY own_delete_draft_entries ON public.time_entries FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::public.time_entry_status)));
CREATE POLICY own_or_org_staff_view_entries ON public.time_entries FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = time_entries.project_id) AND public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))));
CREATE POLICY own_update_draft_entries ON public.time_entries FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::public.time_entry_status))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE TABLE public.updates (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, author_id uuid NOT NULL, body text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.updates ADD CONSTRAINT updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.updates ADD CONSTRAINT updates_pkey PRIMARY KEY (id);
ALTER TABLE public.updates ADD CONSTRAINT updates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.updates TO anon;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.updates TO authenticated;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.updates TO service_role;
CREATE INDEX updates_author_id_idx ON public.updates (author_id);
CREATE INDEX updates_project_id_idx ON public.updates (project_id);
CREATE POLICY org_and_client_view_updates ON public.updates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.projects p
     LEFT JOIN public.memberships m ON (((p.org_id = m.org_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))
  WHERE ((p.id = updates.project_id) AND ((m.user_id IS NOT NULL) OR (p.client_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY own_delete_own_update ON public.updates FOR DELETE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_update_own_update ON public.updates FOR UPDATE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY staff_insert_updates ON public.updates FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.projects p
     JOIN public.memberships m ON ((p.org_id = m.org_id)))
  WHERE ((p.id = updates.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role])))))));
