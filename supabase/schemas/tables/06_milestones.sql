create table public.milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null    references public.projects(id) on delete cascade,
  title      text not null,
  due_date   date,
  status     public.milestone_status not null    default 'pending',
  created_at   timestamptz default now()
);

create index if not exists milestones_project_id_idx on public.milestones(project_id);