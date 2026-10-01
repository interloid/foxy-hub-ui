-- Marks Foxy Studio as the shared demo workspace and adds its Manager account
-- (Sofia Reyes), for the sign-in page's "Log in as demo" role picker.
--
-- Does nothing on a database without the demo org (e.g. production that was never
-- seeded), and is safe to run twice. `seed_user: true` makes handle_new_user_signup
-- skip the user, so the signup trigger needs no disabling. Password matches seed.sql
-- and DEMO_ACCOUNT_PASSWORD.
do $$
declare
  v_org  uuid := '20000000-0000-4000-8000-000000000001';
  v_user uuid := '10000000-0000-4000-8000-000000000006';
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    raise notice 'Demo org not found - skipped.';
    return;
  end if;

  update public.organizations set is_demo = true where id = v_org;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user,
    'authenticated', 'authenticated',
    'sofia.reyes@example.com',
    extensions.crypt('FoxyDemo!2345', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"user_name":"Sofia Reyes","seed_user":true}'::jsonb,
    now(), now(), '', '', '', ''
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_user, v_user,
    jsonb_build_object('sub', v_user::text, 'email', 'sofia.reyes@example.com',
                       'email_verified', true, 'phone_verified', false),
    'email', v_user::text, now(), now(), now()
  )
  on conflict do nothing;

  insert into public.profiles (id, full_name)
  values (v_user, 'Sofia Reyes')
  on conflict (id) do nothing;

  insert into public.memberships (id, user_id, org_id, role)
  values ('20000000-0000-4000-8000-000000000016', v_user, v_org, 'manager')
  on conflict do nothing;
end
$$;
