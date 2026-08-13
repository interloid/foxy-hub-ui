DROP POLICY members_and_client_view_invoices ON public.invoices;
DROP POLICY org_and_client_view_milestones ON public.milestones;
DROP POLICY members_and_client_view_projects ON public.projects;
DROP POLICY org_and_client_view_updates ON public.updates;
CREATE POLICY staff_and_own_client_view_invoices ON public.invoices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY staff_and_own_client_view_milestones ON public.milestones FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = milestones.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
CREATE POLICY staff_and_own_client_view_projects ON public.projects FOR SELECT TO authenticated USING (((client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role])));
CREATE POLICY staff_and_own_client_view_updates ON public.updates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = updates.project_id) AND ((p.client_id = ( SELECT auth.uid() AS uid)) OR public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role]))))));
