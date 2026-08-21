create table public.updates (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null    references public.projects(id) on delete cascade,
  author_id  uuid        not null    references auth.users(id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null    default now()
);

create index if not exists updates_project_id_idx on public.updates(project_id);
create index if not exists updates_author_id_idx  on public.updates(author_id);