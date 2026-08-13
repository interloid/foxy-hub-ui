-- =====================================================================
-- API grants for the PostgREST roles
--
-- DECLARED HERE ON PURPOSE. These are not optional plumbing — without
-- SELECT/INSERT/UPDATE/DELETE the API returns
-- `42501 permission denied`, because Postgres checks table privileges
-- BEFORE row security and the policies never run at all.
--
-- They live in the declarative schema rather than only in a migration
-- so `supabase db diff` treats them as the intended state. Left
-- undeclared, every future diff sees the live grants as drift and
-- emits REVOKEs to strip them — which is exactly what happened while
-- generating the client-scoping migration.
--
-- Granting anon full DML is safe here and is Supabase's own model:
-- grants are permissive, RLS is the gate. Every table in `public` has
-- RLS enabled and NO policy targets `anon`, so anon resolves to zero
-- rows everywhere. `stripe_events` has no policies at all, leaving it
-- reachable only by service_role, which carries BYPASSRLS.
--
-- Loaded last in `schema_paths` — grants must follow the objects.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
