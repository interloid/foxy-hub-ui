ALTER TABLE public.deliveries ADD COLUMN author_id uuid;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.deliveries ADD COLUMN file_size text;
ALTER TABLE public.deliveries ADD COLUMN file_type text;
CREATE INDEX deliveries_author_id_idx ON public.deliveries (author_id);
