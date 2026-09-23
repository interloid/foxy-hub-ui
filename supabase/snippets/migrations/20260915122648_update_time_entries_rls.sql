CREATE POLICY org_staff_update_entries ON public.time_entries FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = time_entries.project_id) AND public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = time_entries.project_id) AND public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role])))));
ALTER POLICY own_update_draft_entries ON public.time_entries USING ((user_id = ( SELECT auth.uid() AS uid)));
