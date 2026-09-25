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

-- ---------------------------------------------------------------------
-- Exceptions to the blanket grant above — MUST come after it.
--
-- `revoke_user_sessions` deletes ANY user's sessions and is meant for the
-- server alone (member deactivation, via the service-role key). Its revoke
-- used to sit in functions.sql, which loads BEFORE this file, so the
-- `grant all on all routines` above silently re-granted it to anon and
-- authenticated. The function now also checks the role itself.
-- ---------------------------------------------------------------------
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.revoke_user_sessions(uuid) to service_role;

-- `check_email_exists` tells whether ANY address has an account. Open to anon it let
-- anyone with the public key enumerate users (RISK-021); the app calls it only through
-- the admin client. The function also checks the role itself.
revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
grant  execute on function public.check_email_exists(text) to service_role;
