-- =====================================================================
-- Weekly digest — one row per person × workspace × week.
--
-- The `weekly-digest` Edge Function runs every hour and sends to anyone
-- whose local time is Monday morning. This table is what stops a second
-- run (or a retry) sending the same week twice: a `sent` or `skipped`
-- row for (user, org, week_start) means that week is done. A `failed`
-- row is retried on the next run and overwritten.
--
-- `skipped` = nothing to report that week (the digest skips empty weeks),
-- recorded so the function does not rebuild it every hour until noon.
--
-- `week_start` is the Monday of the week the email is SENT in, in the
-- recipient's own time zone. The email itself covers the week before.
--
-- Written only by the Edge Function with the service-role key: RLS is on
-- and there are deliberately no policies, so no API role can read or
-- write it.
-- =====================================================================
create table public.digest_deliveries (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  week_start  date        not null,
  status      text        not null check (status in ('sent', 'skipped', 'failed')),
  -- The Gmail message id of a sent email, for tracing a delivery problem.
  message_id  text,
  error       text,
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id, week_start)
);

create index digest_deliveries_week_idx on public.digest_deliveries (week_start);
