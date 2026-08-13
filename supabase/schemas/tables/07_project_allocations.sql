-- Who is staffed on a project, for how long, at what rate — the design's "Team allocation"
-- rows. See decisions.md D044.
--
-- **Dated history, not current state.** The design's own helper line is explicit:
--
--   "Part-time is first-class — set any hours/day. Rates snapshot onto each time entry;
--    a change over time is a new dated row."
--
-- So a rate change INSERTS a row with a later `effective_from` rather than updating the old
-- one. That is what lets a time entry from March keep March's rate after an April rise — and
-- it is why there is no `updated_at` here: rows are appended, not edited.
--
-- This table is also what makes the design's over-commit rule computable at all. The
-- prototype's `committedPerDay(user)` sums a person's allocations **across every project**;
-- with no table there is nothing to sum, which is why the New project form shipped without
-- the warning rather than faking it (D042).
create table public.project_allocations (
  id             uuid         primary key default gen_random_uuid(),
  project_id     uuid         not null references public.projects(id) on delete cascade,
  -- `auth.users`, not `profiles` — consistent with `projects.client_id` and
  -- `time_entries.user_id`, and it is the id every RLS policy compares to `auth.uid()`.
  user_id        uuid         not null references auth.users(id) on delete cascade,

  -- Fractional on purpose: "Part-time is first-class", and 2.5 h/day is a real allocation.
  hours_per_day  numeric(4, 2) not null check (hours_per_day > 0 and hours_per_day <= 24),
  days_per_week  smallint      not null default 5 check (days_per_week between 1 and 7),

  -- Nullable: a fixed-price project may staff people with no per-hour rate at all.
  rate           numeric(10, 2) check (rate is null or rate >= 0),

  -- `date`, not `timestamptz`. An allocation starts on a day, not at an instant, and storing
  -- a timezone-bearing moment would make "from 1 July" mean different days for different
  -- readers. Same reasoning as `time_entries.work_date` and `milestones.due_date`.
  effective_from date         not null,

  -- When the booking STOPS. Null means open-ended, which is the common case.
  --
  -- Without this the Team capacity panel is wrong and only ever climbs: an allocation with no
  -- end date keeps consuming a person's day after the project ships, so everyone drifts toward
  -- permanently over-committed and the "N over" badge stops meaning anything. Project status is
  -- not a substitute — a person can roll off a project that is still running.
  --
  -- `date` for the same reason as `effective_from`, and the check is `>=` not `>`: a booking
  -- that starts and ends on one day is a real single-day allocation.
  effective_to   date         check (effective_to is null or effective_to >= effective_from),
  created_at     timestamptz  not null default now(),

  -- One row per person per start date. A second row for the same day is not history, it is a
  -- duplicate — the correction is to update that row or pick another date.
  unique (project_id, user_id, effective_from)
);

create index if not exists project_allocations_project_id_idx on public.project_allocations(project_id);
-- The over-commit query reads BY PERSON across projects, so this index is the one that rule
-- depends on, not a nicety.
create index if not exists project_allocations_user_id_idx    on public.project_allocations(user_id);
