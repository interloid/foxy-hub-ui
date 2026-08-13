create table public.deliveries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null    references public.projects(id) on delete cascade,
  org_id      uuid not null    references public.organizations(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  title       text not null,
  description text,
  status      public.delivery_status not null    default 'pending',
  approved_at  timestamptz,

  -- When the client is expected to sign off.
  --
  -- The dashboard's Pending approvals card reads "2 due this week", and there was nowhere to
  -- get that from: `milestones.due_date` is the nearest thing, but `milestone_id` is nullable,
  -- so any deliverable not tied to a milestone had no date at all. `date` rather than
  -- `timestamptz` — a deliverable is due on a day, matching `milestones.due_date`.
  due_date    date,

  -- The row had `approved_at` but no birthday, so "how long has this been waiting?" was
  -- unanswerable and the approvals queue could not be ordered oldest-first. It is also the
  -- timestamp the activity feed needs for a "submitted for approval" event.
  created_at  timestamptz not null default now()
);

create index if not exists deliveries_project_id_idx on public.deliveries(project_id);
create index if not exists deliveries_org_id_idx     on public.deliveries(org_id);

-- The dashboard counts deliverables awaiting sign-off and how many fall due this week, per org.
-- Both filters live in this one index.
create index if not exists deliveries_org_status_due_idx
  on public.deliveries(org_id, status, due_date);
