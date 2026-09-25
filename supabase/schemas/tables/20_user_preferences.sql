-- =====================================================================
-- Per-person preferences — Settings → General.
--
-- Replaces the `locale` and `time_zone` keys that used to live in
-- auth.users.raw_user_meta_data. That JSON was writable by any signed-in
-- user straight through `supabase.auth.updateUser` (no validation), rode
-- in every JWT, sat beside auth-critical keys like `password_set`, and
-- could not be queried by the weekly digest without reaching into the
-- auth schema. Here the columns are typed, CHECKed and defaulted.
--
-- `inactivity_timeout` deliberately STAYS in user_metadata: proxy.ts
-- reads it on every request from the `getUser()` it already makes, and
-- moving it would add a query to each one.
--
-- No row = every default. Rows are created on first save (upsert), so
-- existing accounts need no backfill beyond the one-time copy of values
-- they had already set in user_metadata (see the migration).
-- =====================================================================
create table public.user_preferences (
  user_id               uuid primary key references public.profiles(id) on delete cascade,

  -- "Language" — regional formats only (lib/locale.ts).
  locale                text not null default 'en-GB'
                        check (locale in ('en-GB', 'en-US')),

  -- Manual zone; NULL means "Automatic time zone" (each device reports its own).
  time_zone             text check (time_zone is null or char_length(time_zone) between 1 and 64),

  -- The zone of the device this person used most recently — what the weekly digest
  -- uses for automatic-mode users, whose zone otherwise only exists in a browser cookie.
  last_device_time_zone text check (last_device_time_zone is null or char_length(last_device_time_zone) between 1 and 64),

  -- Appearance. The browser keeps a copy in localStorage so the page paints the right
  -- theme instantly; this row is what makes the choice follow the person across devices.
  -- NULL = never chosen on the account: the first device to sync UPLOADS its local choice
  -- instead of being overwritten by a default (people already had a theme in
  -- localStorage before this column existed).
  theme                 text check (theme is null or theme in ('light', 'dark', 'system')),

  -- Monday summary email. Off unless the person turns it on.
  weekly_digest         boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- The digest's lookup: "who wants it".
create index user_preferences_weekly_digest_idx
  on public.user_preferences (user_id) where weekly_digest;
