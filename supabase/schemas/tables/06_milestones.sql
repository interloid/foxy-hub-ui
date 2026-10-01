create table public.milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null    references public.projects(id) on delete cascade,
  title      text not null,
  due_date   date,
  status     public.milestone_status not null    default 'pending',
  -- The wizard's "est h" per milestone. Nullable - an estimate is optional, and a made-up
  -- one is worse than none. `(8, 2)` to match `projects.estimated_hours`.
  estimated_hours numeric(8, 2) check (estimated_hours is null or estimated_hours > 0),
  -- "Client sees this". Defaults to true because milestones are the client's timeline; an
  -- internal-only checkpoint is the exception. Enforced for clients in the select policy.
  client_visible  boolean not null default true,
  -- The order the milestones were listed in. Needed because `due_date` is optional and rows
  -- inserted together share a `created_at`, so neither can order them.
  position        smallint not null default 0,
  created_at   timestamptz default now()
);

create index if not exists milestones_project_id_idx on public.milestones(project_id);