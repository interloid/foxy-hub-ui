CREATE TYPE public.engagement_model AS ENUM ('full_time', 'part_time', 'retainer', 'fixed');
CREATE TYPE public.retainer_period AS ENUM ('weekly', 'monthly');
ALTER TABLE public.organizations ADD CONSTRAINT organizations_daily_capacity_hours_check CHECK (daily_capacity_hours >= 1 AND daily_capacity_hours <= 24);
ALTER TABLE public.organizations ADD COLUMN days_per_week smallint DEFAULT 5 NOT NULL;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_days_per_week_check CHECK (days_per_week >= 1 AND days_per_week <= 7);
ALTER TABLE public.organizations ADD COLUMN currency text DEFAULT 'USD'::text NOT NULL;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_currency_check CHECK (char_length(currency) = 3);
ALTER TABLE public.organizations ADD COLUMN rounding_minutes smallint DEFAULT 15 NOT NULL;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_rounding_minutes_check CHECK (rounding_minutes >= 1 AND rounding_minutes <= 60);
CREATE TABLE public.project_allocations (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, hours_per_day numeric(4,2) NOT NULL, days_per_week smallint DEFAULT 5 NOT NULL, rate numeric(10,2), effective_from date NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_days_per_week_check CHECK (days_per_week >= 1 AND days_per_week <= 7);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_hours_per_day_check CHECK (hours_per_day > 0::numeric AND hours_per_day <= 24::numeric);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_project_id_user_id_effective_from_key UNIQUE (project_id, user_id, effective_from);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_rate_check CHECK (rate IS NULL OR rate >= 0::numeric);
ALTER TABLE public.project_allocations ADD CONSTRAINT project_allocations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
GRANT ALL ON public.project_allocations TO anon;
GRANT ALL ON public.project_allocations TO authenticated;
GRANT ALL ON public.project_allocations TO service_role;
CREATE INDEX project_allocations_project_id_idx ON public.project_allocations (project_id);
CREATE INDEX project_allocations_user_id_idx ON public.project_allocations (user_id);
CREATE POLICY owners_admins_write_project_allocations ON public.project_allocations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_allocations.project_id) AND public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_allocations.project_id) AND public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role])))));
CREATE POLICY staff_view_project_allocations ON public.project_allocations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_allocations.project_id) AND public.has_org_role(p.org_id, ARRAY['owner'::public.user_role, 'admin'::public.user_role, 'member'::public.user_role])))));
ALTER TABLE public.projects ADD COLUMN engagement public.engagement_model DEFAULT 'full_time'::public.engagement_model NOT NULL;
ALTER TABLE public.projects ADD COLUMN contract_value numeric(12,2);
ALTER TABLE public.projects ADD CONSTRAINT projects_contract_value_check CHECK (contract_value IS NULL OR contract_value >= 0::numeric);
ALTER TABLE public.projects ADD COLUMN retainer_hours numeric(6,2);
ALTER TABLE public.projects ADD CONSTRAINT projects_retainer_hours_check CHECK (retainer_hours IS NULL OR retainer_hours > 0::numeric);
ALTER TABLE public.projects ADD COLUMN retainer_period public.retainer_period;
ALTER TABLE public.projects ADD COLUMN retainer_amount numeric(12,2);
ALTER TABLE public.projects ADD CONSTRAINT projects_retainer_amount_check CHECK (retainer_amount IS NULL OR retainer_amount >= 0::numeric);
ALTER TABLE public.projects ADD COLUMN retainer_overage numeric(4,2);
ALTER TABLE public.projects ADD CONSTRAINT projects_retainer_overage_check CHECK (retainer_overage IS NULL OR retainer_overage >= 0::numeric);
ALTER TABLE public.projects ADD COLUMN override_reason text;
