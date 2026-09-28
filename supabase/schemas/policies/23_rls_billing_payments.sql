alter table public.billing_payments enable row level security;

-- Same readers as `subscriptions` (`owners_admins_view_subscription`): what the agency
-- pays for its own tooling is billing, so primary admins and admins only - not managers,
-- not contributors. No insert/update/delete policies: only stripe-webhook writes, with
-- the service role.
create policy "owners_admins_view_billing_payments"
  on public.billing_payments for select to authenticated
  using (
    public.has_org_role(
      billing_payments.org_id,
      array['primary_admin', 'admin']::public.user_role[]
    )
  );
