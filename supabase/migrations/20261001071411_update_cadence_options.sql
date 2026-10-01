-- Swap update_cadence values in place, keeping every row.
alter table public.projects alter column update_cadence drop default;

alter type public.update_cadence rename to update_cadence_old;

create type public.update_cadence as enum (
  'weekly_monday',
  'weekly_friday',
  'fortnightly',
  'at_milestone',
  'on_request'
);

alter table public.projects
  alter column update_cadence type public.update_cadence
  using (
    case update_cadence::text
      when 'biweekly' then 'fortnightly'
      when 'monthly'  then 'fortnightly'
      else update_cadence::text
    end
  )::public.update_cadence;

alter table public.projects
  alter column update_cadence set default 'weekly_monday'::public.update_cadence;

drop type public.update_cadence_old;