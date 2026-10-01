-- The shared demo workspace's table-level guards - see public.guard_demo_writes() in
-- functions/functions.sql. BEFORE, so a refused write never happens.
create trigger guard_demo_organizations
before update or delete on public.organizations
for each row
execute function public.guard_demo_writes();

create trigger guard_demo_memberships
before insert or update or delete on public.memberships
for each row
execute function public.guard_demo_writes();

create trigger guard_demo_invitations
before insert on public.invitations
for each row
execute function public.guard_demo_writes();

create trigger guard_demo_clients
before update of status on public.clients
for each row
execute function public.guard_demo_writes();

create trigger guard_demo_invoices
before insert or update of invoice_url, stripe_invoice_id on public.invoices
for each row
execute function public.guard_demo_writes();

create trigger guard_demo_profiles
before update of avatar_url on public.profiles
for each row
execute function public.guard_demo_writes();
