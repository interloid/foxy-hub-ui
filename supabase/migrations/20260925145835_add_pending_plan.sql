ALTER TABLE public.subscriptions ADD COLUMN pending_plan_id uuid;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pending_plan_id_fkey FOREIGN KEY (pending_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD COLUMN pending_change_at timestamp with time zone;
