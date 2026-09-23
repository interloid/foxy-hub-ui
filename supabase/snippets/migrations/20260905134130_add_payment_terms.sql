ALTER TABLE public.organizations ADD COLUMN payment_terms_days smallint DEFAULT 30 NOT NULL;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_payment_terms_days_check CHECK (payment_terms_days >= 0 AND payment_terms_days <= 365);
