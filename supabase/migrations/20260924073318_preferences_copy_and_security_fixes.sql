create policy "storage_require_mfa_when_enrolled"
  on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.revoke_user_sessions(uuid) to service_role;