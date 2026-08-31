-- ============================================================
-- Restore the API grants on public
--
-- WITHOUT THIS EVERY API CALL FAILS. The generated
-- 20260727100929_initial_schema.sql emits, for every table:
--
--   GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.x TO anon;
--
-- — which omits SELECT, INSERT, UPDATE and DELETE, for anon,
-- authenticated AND service_role alike. Postgres checks table
-- privileges BEFORE row security, so the RLS policies in
-- schemas/policies/ never even get evaluated. Verified against the
-- local stack: `GET /rest/v1/plans` returned
--
--   HTTP 401  {"code":"42501","message":"permission denied for table plans"}
--
-- and the edge functions would have failed the same way, since
-- service_role was equally ungranted.
--
-- Supabase's own model is: grants are permissive, RLS is the gate.
-- Granting anon full DML is therefore safe HERE because every table
-- in public has RLS enabled and no policy targets `anon` — so anon
-- resolves to zero rows on every table. `stripe_events` has no
-- policies at all, so it stays reachable only by service_role, which
-- carries BYPASSRLS.
--
-- Written as its own migration rather than by editing the generated
-- file: regenerating initial_schema.sql from the declarative schema
-- would silently drop the fix, and this failure mode is invisible
-- until a real API call is made.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- And for anything created later, so a new table is not born unreachable.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
