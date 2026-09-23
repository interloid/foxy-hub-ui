ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_number_key;
CREATE UNIQUE INDEX invoices_org_number_key ON public.invoices (org_id, invoice_number);
