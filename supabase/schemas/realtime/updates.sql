do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'updates'
  ) then
    alter publication supabase_realtime
      add table public.updates;
  end if;
end $$;

alter table public.updates
replica identity full;