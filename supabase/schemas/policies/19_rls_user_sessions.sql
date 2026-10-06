alter table public.user_sessions enable row level security;

-- Read your own devices only. There are deliberately NO insert, update or
-- delete policies: rows are written only by `touch_my_session()`, which
-- takes the session id from the caller's own JWT so nobody can write a
-- row for someone else's session, and removed by the cascade from
-- auth.sessions.
create policy "view_own_user_sessions"
  on public.user_sessions for select to authenticated
  using (user_id = (select auth.uid()));
