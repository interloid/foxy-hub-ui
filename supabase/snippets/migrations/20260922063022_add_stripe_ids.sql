ALTER TABLE public.clients ADD COLUMN stripe_customer_id text;
ALTER TABLE public.clients ADD CONSTRAINT clients_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.invoices ADD COLUMN stripe_invoice_id text;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
