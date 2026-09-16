ALTER PUBLICATION supabase_realtime ADD TABLE public.updates;
ALTER TABLE public.updates REPLICA IDENTITY FULL;
