  create policy "require_mfa_when_enrolled"
  on public.activity_events as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.clients as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.deliveries as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.delivery_assets as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.invitations as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.invoice_lines as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.invoices as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.memberships as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.milestones as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.organizations as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.plans as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.project_allocations as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.projects as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.subscriptions as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.time_entries as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.updates as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.user_sessions as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

create policy "require_mfa_when_enrolled"
  on public.user_preferences as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));
