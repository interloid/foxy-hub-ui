ALTER TABLE public.subscriptions ADD COLUMN stripe_subscription_id text;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
ALTER TABLE public.subscriptions ADD COLUMN stripe_payment_intent text;
ALTER TABLE public.subscriptions ADD COLUMN payment_method_type text;
ALTER TABLE public.subscriptions ADD COLUMN payment_method_details jsonb DEFAULT '{}'::jsonb NOT NULL;
