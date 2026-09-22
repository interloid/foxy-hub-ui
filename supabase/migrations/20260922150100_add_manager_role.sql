-- =====================================================================
-- The `manager` role: everything an admin does EXCEPT billing
--
-- Companion to 20260922150000_rename_user_role_values.sql, which added the
-- enum value. It has to be a separate file: Postgres refuses to USE a new enum
-- value in the transaction that added it (55P04).
--
-- WHAT IS NOT IN HERE, AND WHY
-- The owner->primary_admin and member->contributor renames need no DDL at all.
-- RLS policies, CHECK constraints and index predicates are stored PARSED, and
-- an enum literal inside them is a Const holding the pg_enum row's OID, which
-- `rename value` preserves. Those expressions therefore already mean
-- 'primary_admin' / 'contributor'. Only two kinds of thing hold the value as
-- TEXT and reparse it later:
--
--   * plpgsql function bodies  -> recreated at the bottom of this file, ALL of
--     them that carry a role literal, not only the ones gaining manager. A body
--     still saying 'owner' would be created without complaint (this schema uses
--     check_function_bodies = false) and then fail at call time with 22P02.
--     handle_new_user_signup is the urgent one: it inserts the role for every
--     new workspace, so a stale body breaks all signup.
--   * the application's own literals -> deployed alongside this migration.
--
-- WHERE MANAGER IS DELIBERATELY ABSENT (the billing line):
--   * owners_admins_insert_invoices / owners_admins_update_invoices (08)
--   * owners_admins_insert_invoice_lines (18)
--   * owners_admins_view_subscription (11)
--   * create_invoice_with_entries
-- A manager still READS invoices, via the staff read policy that contributors
-- also sit in.
--
-- Also left alone: owners_can_delete_members stays primary-admin-only, which is
-- narrower than admin and so narrower than manager by construction.
--
-- Policy NAMES are left as they are. `owners_admins_*` now means
-- primary_admin + admin + manager; renaming 31 policies would be pure churn and
-- would show up as drift against schemas/policies/*.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Make `manager` invitable
--
-- Without this the role could only ever be granted by a direct UPDATE on
-- memberships: handle_new_user_signup copies invitations.role straight into the
-- membership, so the constraint is what gates the whole invite flow.
-- ---------------------------------------------------------------------
alter table public.invitations
  drop constraint if exists invitations_role_check;

alter table public.invitations
  add constraint invitations_role_check
  check (role in ('admin', 'manager', 'contributor', 'client'));


-- ---------------------------------------------------------------------
-- 2. Policies: add `manager` (31 policies across 13 tables)
--
-- Dropped and recreated rather than ALTER POLICY'd so each statement is a
-- verbatim copy of schemas/policies/*.sql — the declarative files stay the
-- single source of truth and `db diff` sees no drift. Atomic: the whole
-- migration is one transaction, so no request ever sees a table unguarded.
-- ---------------------------------------------------------------------

-- ---- 02_rls_memberships.sql ------------------------------------

drop policy if exists "owners_admins_can_insert_members" on public.memberships;
create policy "owners_admins_can_insert_members"
  on public.memberships for insert to authenticated
  with check (public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]));

drop policy if exists "owners_admins_update_member_role" on public.memberships;
create policy "owners_admins_update_member_role"
  on public.memberships for update to authenticated
  using (
    public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    and role <> 'primary_admin'
  )
  with check (
    public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    and role <> 'primary_admin'
  );

-- ---- 03_rls_projects.sql ---------------------------------------

drop policy if exists "staff_and_own_client_view_projects" on public.projects;
create policy "staff_and_own_client_view_projects"
  on public.projects for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.has_org_role(projects.org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[])
  );

drop policy if exists "owners_admins_insert_projects" on public.projects;
create policy "owners_admins_insert_projects"
  on public.projects for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = projects.org_id
        and m.role    in ('primary_admin', 'admin', 'manager')
    )
  );

drop policy if exists "staff_update_projects" on public.projects;
create policy "staff_update_projects"
  on public.projects for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = projects.org_id
        and m.role    in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

drop policy if exists "owners_admins_delete_projects" on public.projects;
create policy "owners_admins_delete_projects"
  on public.projects for delete to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = projects.org_id
        and m.role    in ('primary_admin', 'admin', 'manager')
    )
  );

-- ---- 04_rls_milestones.sql -------------------------------------

drop policy if exists "staff_and_own_client_view_milestones" on public.milestones;
create policy "staff_and_own_client_view_milestones"
  on public.milestones for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = milestones.project_id
        and (
          p.client_id = (select auth.uid())
          or public.has_org_role(p.org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[])
        )
    )
  );

drop policy if exists "staff_insert_milestones" on public.milestones;
create policy "staff_insert_milestones"
  on public.milestones for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      join public.memberships m on p.org_id = m.org_id
      where p.id     = milestones.project_id
        and m.user_id = (select auth.uid())
        and m.role   in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

drop policy if exists "staff_update_milestones" on public.milestones;
create policy "staff_update_milestones"
  on public.milestones for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      join public.memberships m on p.org_id = m.org_id
      where p.id     = milestones.project_id
        and m.user_id = (select auth.uid())
        and m.role   in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

drop policy if exists "staff_delete_milestones" on public.milestones;
create policy "staff_delete_milestones"
  on public.milestones for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      join public.memberships m on p.org_id = m.org_id
      where p.id     = milestones.project_id
        and m.user_id = (select auth.uid())
        and m.role   in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

-- ---- 05_rls_project_allocations.sql ----------------------------

drop policy if exists "staff_view_project_allocations" on public.project_allocations;
create policy "staff_view_project_allocations"
  on public.project_allocations for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_allocations.project_id
        and public.has_org_role(p.org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[])
    )
  );

drop policy if exists "owners_admins_write_project_allocations" on public.project_allocations;
create policy "owners_admins_write_project_allocations"
  on public.project_allocations for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_allocations.project_id
        and public.has_org_role(p.org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_allocations.project_id
        and public.has_org_role(p.org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    )
  );

-- ---- 06_rls_deliveries.sql -------------------------------------

drop policy if exists "staff_and_project_client_view_deliveries" on public.deliveries;
create policy "staff_and_project_client_view_deliveries"
  on public.deliveries for select to authenticated
  using (
    public.has_org_role(
      deliveries.org_id,
      array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]
    )
    or exists (
      select 1 from public.projects p
      where p.id        = deliveries.project_id
        and p.client_id = (select auth.uid())
    )
  );

drop policy if exists "owners_admins_insert_deliveries" on public.deliveries;
create policy "owners_admins_insert_deliveries"
  on public.deliveries for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = deliveries.org_id
        and m.role    in ('primary_admin', 'admin', 'manager')
    )
  );

drop policy if exists "staff_update_deliveries" on public.deliveries;
create policy "staff_update_deliveries"
  on public.deliveries for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id  = deliveries.org_id
        and m.role    in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

-- ---- 07_rls_delivery_assets.sql --------------------------------

drop policy if exists "staff_and_project_client_view_delivery_assets" on public.delivery_assets;
create policy "staff_and_project_client_view_delivery_assets"
  on public.delivery_assets for select to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_assets.delivery_id
        and (
          public.has_org_role(
            d.org_id,
            array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]
          )
          or exists (
            select 1 from public.projects p
            where p.id        = d.project_id
              and p.client_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "staff_insert_delivery_assets" on public.delivery_assets;
create policy "staff_insert_delivery_assets"
  on public.delivery_assets for insert to authenticated
  with check (
    exists (
      select 1 from public.deliveries d
      join public.memberships m on d.org_id = m.org_id
      where d.id     = delivery_assets.delivery_id
        and m.user_id = (select auth.uid())
        and m.role   in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

drop policy if exists "staff_update_delivery_assets" on public.delivery_assets;
create policy "staff_update_delivery_assets"
  on public.delivery_assets for update to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      join public.memberships m on d.org_id = m.org_id
      where d.id     = delivery_assets.delivery_id
        and m.user_id = (select auth.uid())
        and m.role   in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

-- ---- 08_rls_invoices.sql ---------------------------------------

drop policy if exists "staff_and_own_client_view_invoices" on public.invoices;
create policy "staff_and_own_client_view_invoices"
  on public.invoices for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = invoices.project_id
        and (
          p.client_id = (select auth.uid())
          or public.has_org_role(p.org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[])
        )
    )
  );

-- ---- 09_rls_time_entries.sql -----------------------------------

drop policy if exists "own_or_org_staff_view_entries" on public.time_entries;
create policy "own_or_org_staff_view_entries"
  on public.time_entries for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['primary_admin', 'admin', 'manager']::public.user_role[]
        )
    )
  );

drop policy if exists "org_staff_update_entries" on public.time_entries;
create policy "org_staff_update_entries"
  on public.time_entries for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['primary_admin', 'admin', 'manager']::public.user_role[]
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = time_entries.project_id
        and public.has_org_role(
          p.org_id,
          array['primary_admin', 'admin', 'manager']::public.user_role[]
        )
    )
  );

-- ---- 14_rls_updates.sql ----------------------------------------

drop policy if exists "staff_and_own_client_view_updates" on public.updates;
create policy "staff_and_own_client_view_updates"
  on public.updates for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = updates.project_id
        and (
          p.client_id = (select auth.uid())
          or public.has_org_role(p.org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[])
        )
    )
  );

drop policy if exists "staff_insert_updates" on public.updates;
create policy "staff_insert_updates"
  on public.updates for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      join public.memberships m on p.org_id = m.org_id
      where p.id     = updates.project_id
        and m.user_id = (select auth.uid())
        and m.role   in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

-- ---- 15_rls_invitations.sql ------------------------------------

drop policy if exists "owners_admins_view_invitations" on public.invitations;
create policy "owners_admins_view_invitations"
  on public.invitations for select to authenticated
  using (public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]));

drop policy if exists "owners_admins_create_invitations" on public.invitations;
create policy "owners_admins_create_invitations"
  on public.invitations for insert to authenticated
  with check (
    public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
    and invited_by  = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );

drop policy if exists "owners_admins_delete_invitations" on public.invitations;
create policy "owners_admins_delete_invitations"
  on public.invitations for delete to authenticated
  using (public.has_org_role(org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]));

-- ---- 16_rls_clients.sql ----------------------------------------

drop policy if exists "staff_view_clients" on public.clients;
create policy "staff_view_clients"
  on public.clients for select to authenticated
  using (
    public.has_org_role(clients.org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[])
  );

drop policy if exists "owners_admins_write_clients" on public.clients;
create policy "owners_admins_write_clients"
  on public.clients for all to authenticated
  using (
    public.has_org_role(clients.org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
  )
  with check (
    public.has_org_role(clients.org_id, array['primary_admin', 'admin', 'manager']::public.user_role[])
  );

-- ---- 17_rls_activity_events.sql --------------------------------

drop policy if exists "staff_view_activity_events" on public.activity_events;
create policy "staff_view_activity_events"
  on public.activity_events for select to authenticated
  using (
    public.has_org_role(
      activity_events.org_id,
      array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]
    )
  );

drop policy if exists "members_insert_activity_events" on public.activity_events;
create policy "members_insert_activity_events"
  on public.activity_events for insert to authenticated
  with check (
    public.has_org_role(
      activity_events.org_id,
      array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]
    )
    and activity_events.actor_id = (select auth.uid())
  );

-- ---- 18_rls_invoice_lines.sql ----------------------------------

drop policy if exists "view_invoice_lines_with_invoice" on public.invoice_lines;
create policy "view_invoice_lines_with_invoice"
  on public.invoice_lines for select to authenticated
  using (
    exists (
      select 1
      from public.invoices i
      join public.projects p on p.id = i.project_id
      where i.id = invoice_lines.invoice_id
        and (
          p.client_id = (select auth.uid())
          or public.has_org_role(
            p.org_id,
            array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]
          )
        )
    )
  );


-- ---------------------------------------------------------------------
-- 3. Storage policies
--
-- These live only in 20260727121649_storage_setup.sql — there is no storage
-- file under schemas/, so `db diff` will never surface them. Missed, a manager
-- gets a 403 on every deliverable upload.
--
-- SELECT is untouched: `deliverables_select_org_members` tests org membership
-- with no role filter at all.
-- ---------------------------------------------------------------------

drop policy if exists "deliverables_insert_staff" on storage.objects;
create policy "deliverables_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

drop policy if exists "deliverables_update_staff" on storage.objects;
create policy "deliverables_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );

drop policy if exists "deliverables_delete_staff" on storage.objects;
create policy "deliverables_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.org_id::text = (storage.foldername(name))[1]
        and m.role in ('primary_admin', 'admin', 'manager', 'contributor')
    )
  );


-- ---------------------------------------------------------------------
-- 4. Functions
--
-- Every plpgsql body that carries a role literal, whether or not it gains
-- manager — see the header. Bodies are copied verbatim from
-- schemas/functions/functions.sql. CREATE OR REPLACE keeps existing privileges,
-- so the grants further down that file do not need repeating.
-- ---------------------------------------------------------------------
set check_function_bodies = false;

-- ---- public.approve_time_entry ----------------------------------
create or replace function public.approve_time_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Primary admins, admins AND managers may approve. The old join was on
  -- `organizations.user_id` — the org's
  -- single creator — so a user with the `admin` role could not approve anything, even
  -- though approvals are an Admin-dashboard action in the design.
  if exists (
    select 1
    from public.time_entries te
    join public.projects p on te.project_id = p.id
    where te.id     = entry_id
      and te.status = 'submitted'
      and public.has_org_role(
        p.org_id,
        array['primary_admin', 'admin', 'manager']::public.user_role[]
      )
  ) then
    update public.time_entries
       set status = 'approved'
     where id = entry_id;
  else
    raise exception 'Not authorized to approve this entry';
  end if;
end;
$$;

-- ---- public.reject_time_entry -----------------------------------
create or replace function public.reject_time_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.time_entries te
    join public.projects p on te.project_id = p.id
    where te.id     = entry_id
      and te.status = 'submitted'
      and public.has_org_role(
        p.org_id,
        array['primary_admin', 'admin', 'manager']::public.user_role[]
      )
  ) then
    update public.time_entries
       set status = 'rejected'
     where id = entry_id;
  else
    raise exception 'Not authorized to reject this entry';
  end if;
end;
$$;

-- ---- public.handle_new_user_signup ------------------------------
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_user_id     uuid := new.id;
  v_plan_id     uuid;
  v_token       text := nullif(new.raw_user_meta_data->>'invite_token', '');
  v_user_name   text := new.raw_user_meta_data->>'user_name';
  v_invite      public.invitations%rowtype;
  v_org_name    text;
  v_slug        text;
begin
  IF COALESCE(NEW.raw_user_meta_data->>'seed_user', 'false') = 'true' THEN
    RETURN NEW;
  END IF;
  insert into public.profiles (id, full_name)
  values (v_user_id, v_user_name);

  if v_token is not null then
    -- ---- Invited user path ------------------------------------------------
    -- `digest` comes from pgcrypto, installed into the extensions schema, so it
    -- must be qualified: search_path is '' and nothing but pg_catalog resolves.
    --
    -- FOR UPDATE locks the row for this transaction, so two signups racing on the
    -- same token cannot both redeem it — the second blocks, then fails the
    -- accepted_at check below.
    select * into v_invite
      from public.invitations
     where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
       for update;

    -- Every branch fails CLOSED. This trigger is AFTER INSERT on auth.users, so a
    -- raise rolls the whole signup back and no account is created.
    if not found then
      raise exception 'Invalid invitation token' using errcode = '22023';
    end if;

    if v_invite.accepted_at is not null then
      raise exception 'This invitation has already been used' using errcode = '22023';
    end if;

    if v_invite.expires_at <= now() then
      raise exception 'This invitation has expired' using errcode = '22023';
    end if;

    -- Binds the token to one address, so a forwarded or intercepted link cannot be
    -- redeemed by a different account.
    if lower(v_invite.email) <> lower(coalesce(new.email, '')) then
      raise exception 'This invitation was issued to a different email address'
        using errcode = '22023';
    end if;

    -- org_id and role come from the INVITATION, never from the payload. No text cast
    -- either: v_invite.role is already public.user_role, and the table's check
    -- constraint forbids 'primary_admin'. 'manager' IS invitable.
    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_invite.org_id, v_invite.role);

    if v_invite.role = 'client' then
      -- The composite FK on invitations already guarantees this project belongs to
      -- v_invite.org_id, so there is no way to point a client at another org's work.
      update public.projects
         set client_id = v_user_id
       where id = v_invite.project_id;
    end if;

    update public.invitations
       set accepted_at = now(),
           accepted_by = v_user_id
     where id = v_invite.id;

  else
    -- ---- New primary-admin path ------------------------------------------
    -- org_name and slug are user-supplied, and that is safe: this user is creating
    -- their OWN new organisation and becoming its primary admin. There is no existing tenant
    -- to escalate into. Contrast the invited path above, where org and role must come
    -- from an invitation precisely because they name someone else's tenant.
    --
    -- They are VALIDATED, though. `organizations.name` and `slug` are NOT NULL, but a
    -- constraint violation here surfaces as an opaque 500 from the auth endpoint; these
    -- checks fail with a message the wizard can show. Signup rolls back either way —
    -- this is an AFTER INSERT trigger on auth.users.
    v_org_name := nullif(trim(new.raw_user_meta_data->>'org_name'), '');
    v_slug     := lower(nullif(trim(new.raw_user_meta_data->>'slug'), ''));

    if v_org_name is null then
      raise exception 'An organisation name is required' using errcode = '22023';
    end if;

    if v_slug is null then
      raise exception 'A workspace URL is required' using errcode = '22023';
    end if;

    -- Checked explicitly so a taken slug reads as a taken slug rather than as
    -- "organizations_slug_key violated". `is_slug_available` is the same function the
    -- wizard calls on step 1; this is the authoritative re-check at write time, since
    -- anything can change between the two.
    if not public.is_slug_available(v_slug) then
      raise exception 'That workspace URL is already taken' using errcode = '22023';
    end if;

    -- The subscription every new workspace starts on, before any plan is chosen.
    -- 'Free' must therefore always exist as an active row — see
    -- migrations/20260807150000_reseed_design_plans.sql, which keeps it for this reason.
    select id into v_plan_id
      from public.plans
     where name = 'Free'
     limit 1;

    insert into public.organizations (name, slug, user_id)
    values (v_org_name, v_slug, v_user_id)
    returning id into v_org_id;

    insert into public.memberships (user_id, org_id, role)
    values (v_user_id, v_org_id, 'primary_admin');

    insert into public.subscriptions (plan_id, org_id)
    values (v_plan_id, v_org_id);
  end if;

  return new;
end;
$$;

-- ---- public.create_project_with_allocations ---------------------
create or replace function public.create_project_with_allocations(
  project_data jsonb,
  allocations_data jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_alloc      jsonb;
  v_org_id     uuid;
begin
  v_org_id := (project_data->>'org_id')::uuid;

  -- 1. Authorization check: caller must be a primary admin, admin or manager of the org
  if not public.has_org_role(v_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]) then
    raise exception 'Not authorized to create projects for this organization' using errcode = '42501';
  end if;

  -- 2. Insert Project
  insert into public.projects (
    org_id,
    name,
    due_date,
    engagement,
    client_id,
    client_org_id,
    contract_value,
    estimated_hours,
    retainer_hours,
    retainer_period,
    retainer_amount,
    retainer_overage,
    description,
    override_reason,
    start_from,
    status
  )
  values (
    v_org_id,
    project_data->>'name',
    nullif(project_data->>'due_date', '')::timestamptz,
    nullif(project_data->>'engagement', '')::public.engagement_model,
    nullif(project_data->>'client_id', '')::uuid,
    -- The COMPANY the work is for. The New project panel's dropdown lists `clients` rows, and
    -- the action wrote that id into `client_id` — a column pointing at `auth.users` — so the
    -- insert failed its foreign key whenever a client was selected. `client_id` stays what it
    -- always was: the client's LOGIN, set by `handle_new_user_signup` when they accept an
    -- invitation, and null until then.
    nullif(project_data->>'client_org_id', '')::uuid,
    nullif(project_data->>'contract_value', '')::numeric,
    nullif(project_data->>'estimated_hours', '')::numeric,
    nullif(project_data->>'retainer_hours', '')::numeric,
    nullif(project_data->>'retainer_period', '')::public.retainer_period,
    nullif(project_data->>'retainer_amount', '')::numeric,
    nullif(project_data->>'retainer_overage', '')::numeric,
    project_data->>'description',
    project_data->>'override_reason',
    coalesce(project_data->>'start_from', 'blank'),
    coalesce(nullif(project_data->>'status', '')::public.project_status, 'pending'::public.project_status)
  )
  returning id into v_project_id;

  -- 3. Insert Allocations (if any provided)
  if jsonb_array_length(allocations_data) > 0 then
    for v_alloc in select * from jsonb_array_elements(allocations_data)
    loop
      insert into public.project_allocations (
        project_id,
        user_id,
        hours_per_day,
        days_per_week,
        rate,
        cost_rate,
        effective_from
      )
      values (
        v_project_id,
        (v_alloc->>'user_id')::uuid,
        (v_alloc->>'hours_per_day')::numeric,
        (v_alloc->>'days_per_week')::numeric,
        nullif(v_alloc->>'rate', '')::numeric,
        -- Cost is snapshotted HERE rather than sent by the caller. It is an internal figure,
        -- so it has no reason to travel to a browser and back, and reading it at insert time
        -- is what freezes it: a later raise changes `memberships.cost_rate` and leaves every
        -- allocation already booked at the cost it was actually booked at.
        (
          select m.cost_rate
          from public.memberships m
          where m.user_id = (v_alloc->>'user_id')::uuid
            and m.org_id  = v_org_id
        ),
        nullif(v_alloc->>'effective_from', '')::date
      );
    end loop;
  end if;

  return v_project_id;
end;
$$;

-- ---- public.create_invoice_with_entries -------------------------
create or replace function public.create_invoice_with_entries(
  invoice_data jsonb,
  entry_ids    uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_line       jsonb;
  v_sort       smallint := 0;
  v_org_id     uuid;
  v_project_id uuid;
  v_engagement public.engagement_model;
  v_period     date;
  v_year       text;
  v_seq        int;
  v_number     text;
  v_claimed    int;
  v_fixed_count int;
  v_status      public.project_status;
begin
  v_org_id     := (invoice_data->>'org_id')::uuid;
  v_project_id := (invoice_data->>'project_id')::uuid;
  v_period     := nullif(invoice_data->>'period_start', '')::date;

  -- 1. Authorization: only primary admins and admins bill. `manager` is deliberately absent —
  --    billing is the one thing that role does not do. See schemas/types/types.sql.
  if not public.has_org_role(v_org_id, array['primary_admin', 'admin']::public.user_role[]) then
    raise exception 'Not authorized to create invoices for this organization' using errcode = '42501';
  end if;

  -- 2. The project must belong to the org the caller is billing under, and its engagement model
  --    decides which double-billing guard applies below. Read from the table rather than trusted
  --    from the payload, since without the org check a caller who administers org A could raise
  --    an invoice against org B's project by passing its id.
  select p.engagement into v_engagement
    from public.projects p
   where p.id = v_project_id and p.org_id = v_org_id;

  if v_engagement is null then
    raise exception 'Project does not belong to this organization' using errcode = '42501';
  end if;

  -- 3. Period guard for retainers. `invoices_project_period_key` enforces this too, but reaching
  --    it surfaces a unique-violation; this raises something a user can read.
  if v_period is not null and exists (
    select 1 from public.invoices i
    where i.project_id = v_project_id and i.period_start = v_period
  ) then
    raise exception 'This project is already invoiced for the period starting %', v_period
      using errcode = '23505';
  end if;

  -- 4. Fixed-price guard. A fixed engagement bills in exactly two stages rather than one flat
  --    fee: half once the project reaches `in-progress`, the remaining half once it reaches
  --    `pending-approval`. Capped at two invoices total, and each stage can only be raised while
  --    the project is actually at that stage — read from the table rather than trusted from the
  --    payload, so a stale client can't submit the wrong half out of order.
  if v_engagement = 'fixed' then
    select count(*) into v_fixed_count
      from public.invoices i where i.project_id = v_project_id;

    if v_fixed_count >= 2 then
      raise exception 'This fixed-price project has already been fully invoiced' using errcode = '23505';
    end if;

    select p.status into v_status from public.projects p where p.id = v_project_id;

    if v_fixed_count = 0 and v_status <> 'in-progress' then
      raise exception 'The first fixed-price invoice can only be raised while the project is in progress'
        using errcode = '22023';
    end if;

    if v_fixed_count = 1 and v_status <> 'pending-approval' then
      raise exception 'The final fixed-price invoice can only be raised once the project is pending approval'
        using errcode = '22023';
    end if;
  end if;

  -- 5. Invoice number: INV-<year>-<seq>, sequential per org per year. Derived inside the
  --    transaction so two concurrent generations cannot read the same max; if they interleave
  --    anyway, `invoice_number`'s unique constraint rejects the loser rather than duplicating.
  v_year := to_char(now(), 'YYYY');

  select coalesce(max((regexp_replace(i.invoice_number, '^.*-', ''))::int), 0) + 1
    into v_seq
    from public.invoices i
   where i.org_id = v_org_id
     and i.invoice_number like 'INV-' || v_year || '-%';

  v_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  -- 6. Insert the invoice.
  insert into public.invoices (
    invoice_number,
    org_id,
    project_id,
    amount,
    subtotal,
    currency,
    description,
    status,
    due_date,
    period_start,
    period_end
  )
  values (
    v_number,
    v_org_id,
    v_project_id,
    (invoice_data->>'amount')::numeric,
    (invoice_data->>'amount')::numeric,
    coalesce(nullif(invoice_data->>'currency', ''), 'USD'),
    nullif(invoice_data->>'description', ''),
    coalesce(nullif(invoice_data->>'status', '')::public.invoice_status, 'draft'::public.invoice_status),
    nullif(invoice_data->>'due_date', '')::timestamptz,
    v_period,
    nullif(invoice_data->>'period_end', '')::date
  )
  returning id into v_invoice_id;

  -- 7. Freeze the lines.
  --
  -- Written in the same transaction as the invoice for the same reason the hours are: an
  -- invoice whose lines failed to save is a total with nothing behind it, and no later run
  -- can reconstruct them once rates or entries have moved on.
  if jsonb_array_length(coalesce(invoice_data->'lines', '[]'::jsonb)) > 0 then
    for v_line in select * from jsonb_array_elements(invoice_data->'lines')
    loop
      insert into public.invoice_lines (
        invoice_id,
        description,
        type_label,
        quantity,
        unit_rate,
        amount,
        sort_order
      )
      values (
        v_invoice_id,
        v_line->>'description',
        v_line->>'type_label',
        nullif(v_line->>'quantity', '')::numeric,
        nullif(v_line->>'unit_rate', '')::numeric,
        (v_line->>'amount')::numeric,
        v_sort
      );

      v_sort := v_sort + 1;
    end loop;
  end if;

  -- 8. Claim the hours. The where clause re-states every precondition rather than trusting the
  --    caller's list: right project, approved, and STILL unbilled. `invoice_id is null` is the
  --    one that matters — it makes the claim idempotent under a concurrent generation, because
  --    the second transaction finds nothing left to take.
  if array_length(entry_ids, 1) > 0 then
    update public.time_entries te
       set invoice_id = v_invoice_id
     where te.id         = any(entry_ids)
       and te.project_id = v_project_id
       and te.status     = 'approved'
       and te.invoice_id is null;

    get diagnostics v_claimed = row_count;

    -- Under-claiming means someone billed these hours between the draft being built and this
    -- call. Rolling back is right: the amount was computed FROM those hours, so an invoice
    -- that keeps the total but loses the lines would overbill.
    if v_claimed <> array_length(entry_ids, 1) then
      raise exception 'Some hours were already invoiced; refresh and try again'
        using errcode = '40001';
    end if;
  end if;

  return v_invoice_id;
end;
$$;

-- ---- public.set_member_rates ------------------------------------
create or replace function public.set_member_rates(
  target_user_id   uuid,
  target_org_id    uuid,
  new_default_rate numeric default null,
  new_cost_rate    numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_org_role(target_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]) then
    raise exception 'Not authorized to set rates for this organization' using errcode = '42501';
  end if;

  update public.memberships
     set default_rate = new_default_rate,
         cost_rate    = new_cost_rate
   where user_id = target_user_id
     and org_id  = target_org_id;

  if not found then
    raise exception 'No membership found for that user in this organization';
  end if;
end;
$$;

-- ---- public.create_time_entry_with_capacity_check ---------------
create or replace function public.create_time_entry_with_capacity_check(
  p_user_id uuid,
  p_project_id uuid,
  p_milestone_id uuid,
  p_work_date date,
  p_duration_minutes integer,
  p_description text,
  p_org_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_capacity_hours numeric;
  v_daily_capacity_minutes integer;
  v_already_logged_minutes integer;
  v_remaining_minutes integer;
  v_remaining_hours numeric;
  v_new_entry_id uuid;
  v_is_admin boolean;
begin
  -- 1. Authorization check: caller must be an active member of the organization
  if not public.has_org_role(p_org_id, array['primary_admin', 'admin', 'manager', 'contributor']::public.user_role[]) then
    raise exception 'Not authorized to log time for this organization' using errcode = '42501';
  end if;

  -- 2. Determine if the caller holds elevated privileges (primary admin, admin or manager)
  v_is_admin := public.has_org_role(p_org_id, array['primary_admin', 'admin', 'manager']::public.user_role[]);

  -- 3. Enforce user boundary: contributors can only log time for themselves
  if not v_is_admin and p_user_id <> auth.uid() then
    raise exception 'Contributors can only log time for themselves' using errcode = '42501';
  end if;

  -- 4. Verify that the target project belongs to the specified organization
  if not exists (
    select 1 
    from public.projects 
    where id = p_project_id 
      and org_id = p_org_id
  ) then
    raise exception 'Project does not belong to this organization' using errcode = '22023';
  end if;

  -- 5. Acquire a transaction-level advisory lock to serialize concurrent requests for the same user, date, and org
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text || p_work_date::text || p_org_id::text)
  );

  -- 6. Get organization's daily capacity
  select coalesce(daily_capacity_hours, 8)
  into v_daily_capacity_hours
  from public.organizations
  where id = p_org_id;

  v_daily_capacity_minutes := floor(v_daily_capacity_hours * 60);

  -- 7. Calculate existing logged minutes for the given day & organization
  select coalesce(sum(te.duration_minutes), 0)
  into v_already_logged_minutes
  from public.time_entries te
  inner join public.projects p on p.id = te.project_id
  where te.user_id = p_user_id
    and te.work_date = p_work_date
    and p.org_id = p_org_id;

  -- 8. Check if total exceeds daily capacity
  if (v_already_logged_minutes + p_duration_minutes) > v_daily_capacity_minutes then
    v_remaining_minutes := greatest(0, v_daily_capacity_minutes - v_already_logged_minutes);
    v_remaining_hours := round((v_remaining_minutes::numeric / 60.0), 1);
    
    return jsonb_build_object(
      'ok', false,
      'error', format('Exceeds daily capacity. You only have %s hours remaining for %s.', v_remaining_hours::text, p_work_date::text)
    );
  end if;

  -- 9. Atomic insert
  insert into public.time_entries (
    user_id,
    project_id,
    milestone_id,
    work_date,
    duration_minutes,
    description,
    status
  ) values (
    p_user_id,
    p_project_id,
    p_milestone_id,
    p_work_date,
    p_duration_minutes,
    p_description,
    'draft'
  )
  returning id into v_new_entry_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_entry_id
  );
end;
$$;
