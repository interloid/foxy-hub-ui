create table public.user_sessions (
  session_id   uuid primary key references auth.sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  user_agent   text,
  city         text,
  country      text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index user_sessions_user_id_idx on public.user_sessions (user_id);
