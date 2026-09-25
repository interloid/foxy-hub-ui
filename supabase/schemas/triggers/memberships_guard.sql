-- Membership change rules a policy cannot express — see
-- public.guard_membership_update() in functions/functions.sql (RISK-002).
create trigger guard_membership_update
before update on public.memberships
for each row
execute function public.guard_membership_update();
