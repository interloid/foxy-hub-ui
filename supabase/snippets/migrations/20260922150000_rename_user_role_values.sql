-- =====================================================================
-- public.user_role: rename two values, add one
--
--   owner  -> primary_admin
--   member -> contributor
--   +manager (new, between admin and contributor)
--
-- WHY THIS IS SAFE FOR EXISTING DATA
-- `rename value` is a catalog edit: it rewrites one string in pg_enum and
-- KEEPS the pg_enum row's OID. Nothing in `memberships` or `invitations` is
-- rewritten, and every stored PARSED expression — RLS policies, the
-- `invitations_role_check` constraint, the storage.objects policies — holds
-- the value by OID, so all of them keep working and simply start meaning
-- 'primary_admin' / 'contributor'.
--
-- What does NOT follow automatically is anything stored as TEXT and reparsed
-- at call time: plpgsql function bodies, and the app's own literals. Those are
-- in the companion migration / deploy and must land with this one.
--
-- WHY THIS FILE DOES NOTHING ELSE
-- Postgres refuses to USE a newly added enum value in the transaction that
-- added it (55P04, "unsafe use of new value of enum type"). The CLI runs each
-- migration in a transaction, so every reference to 'manager' — the check
-- constraint, the policies, the functions — has to wait for the next file.
--
-- Hand-written on purpose: `supabase db diff` cannot infer a rename. It would
-- see two values gone and three arrived, and a drop/recreate of `user_role`
-- would cascade into memberships.role, invitations.role, has_org_role()'s
-- signature and ~40 policy expressions.
-- =====================================================================

alter type public.user_role rename value 'owner'  to 'primary_admin';
alter type public.user_role rename value 'member' to 'contributor';

-- `after 'admin'` places manager between admin and contributor, so the enum's
-- own order reads as the privilege ladder. Nothing sorts by it in SQL today
-- (the app sorts in JS), but a wrong order here is not fixable later.
alter type public.user_role add value 'manager' after 'admin';
