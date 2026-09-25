-- Plan limits enforced at insert time, so simultaneous requests cannot both take the last
-- seat or client slot — see public.enforce_plan_limits() in functions/functions.sql
-- (RISK-017).
create trigger enforce_member_limit
before insert on public.invitations
for each row
execute function public.enforce_plan_limits();

create trigger enforce_client_limit
before insert or update of status on public.clients
for each row
execute function public.enforce_plan_limits();

-- Reactivating a teammate takes a seat back (RISK-022).
create trigger enforce_member_reactivation_limit
before update of status on public.memberships
for each row
execute function public.enforce_plan_limits();
