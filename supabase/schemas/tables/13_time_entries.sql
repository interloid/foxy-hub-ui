create table public.time_entries (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null    references auth.users(id) on delete cascade,
  project_id       uuid        not null    references public.projects(id) on delete cascade,
  milestone_id     uuid                    references public.milestones(id) on delete set null,
  work_date        date        not null,
  duration_minutes integer     not null    check (duration_minutes > 0),
  description      text        not null,
  status           public.time_entry_status        not null    default 'draft',
  created_at       timestamptz not null    default now()
);

create index if not exists time_entries_user_id_idx      on public.time_entries(user_id);
create index if not exists time_entries_project_id_idx   on public.time_entries(project_id);
create index if not exists time_entries_milestone_id_idx on public.time_entries(milestone_id);
create index if not exists time_entries_work_date_idx    on public.time_entries(work_date);