DROP POLICY org_owner_view_subscription ON public.subscriptions;
CREATE POLICY owners_admins_view_subscription ON public.subscriptions FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]));
