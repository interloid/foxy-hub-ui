DROP INDEX public.clients_org_id_idx;
ALTER TABLE public.clients ADD COLUMN status boolean DEFAULT true NOT NULL;
CREATE INDEX clients_org_id_idx ON public.clients (org_id, status);
