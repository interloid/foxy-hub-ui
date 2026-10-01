ALTER TABLE public.billing_payments ADD COLUMN total_cents integer DEFAULT 0 NOT NULL;
ALTER TABLE public.billing_payments ADD COLUMN credit_applied_cents integer DEFAULT 0 NOT NULL;
