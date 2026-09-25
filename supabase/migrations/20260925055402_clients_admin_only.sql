ALTER POLICY owners_admins_write_clients ON public.clients USING (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
ALTER POLICY owners_admins_write_clients ON public.clients WITH CHECK (public.has_org_role(org_id, ARRAY['primary_admin'::public.user_role, 'admin'::public.user_role]));
