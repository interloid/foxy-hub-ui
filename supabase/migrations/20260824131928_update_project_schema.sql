ALTER TABLE public.projects ALTER COLUMN start_date TYPE date USING start_date::date;
ALTER TABLE public.projects ADD COLUMN start_from text;
