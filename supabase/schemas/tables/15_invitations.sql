-- =====================================================================
-- Invitations
--
-- The server-side record of "this org invited this address, at this
-- role, to this project". It exists because signup previously read
-- org_id / role / project_id out of `raw_user_meta_data`, which is
-- supplied by whoever calls signUp() — so anyone could register
-- straight into another tenant as an admin. Authorisation now comes
-- from a row an owner or admin created, and the only thing signup
-- trusts is a bearer token.
--
-- FLOW
--   1. Owner/admin generates a high-entropy token in the app.
--   2. The app inserts this row with token_hash =
--        encode(extensions.digest(<token>, 'sha256'), 'hex')
--      and emails the RAW token as a link. The raw token is never
--      stored, so a leak of this table cannot be used to accept an
--      invitation.
--   3. The invitee signs up passing { invite_token: <raw token> } and
--      `public.handle_new_user_signup` redeems it.
-- =====================================================================

-- Lets invitations reference (project, org) as a pair. `id` is already the primary key so
-- this index is trivially satisfied; it exists purely to back the composite foreign key
-- below, which is what makes "the project belongs to the inviting org" a database
-- invariant rather than something the trigger has to remember to check.
create unique index if not exists projects_id_org_id_key
  on public.projects(id, org_id);

create table public.invitations (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null    references public.organizations(id) on delete cascade,
  project_id  uuid,
  email       text        not null,
  role        public.user_role not null,
  -- SHA-256 of the token, hex encoded. Never the token itself.
  token_hash  text        not null unique,
  invited_by  uuid                    references auth.users(id) on delete set null,
  created_at  timestamptz not null    default now(),
  expires_at  timestamptz not null    default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid                    references auth.users(id) on delete set null,

  -- 'owner' is not invitable. It is set exactly once, on the user who creates the org.
  constraint invitations_role_check
    check (role in ('admin', 'member', 'client')),

  -- A client is the client OF something.
  constraint invitations_client_needs_project
    check (role <> 'client' or project_id is not null),

  -- The project must belong to the inviting org. With MATCH SIMPLE a NULL project_id
  -- skips the check, which is what non-client invitations want.
  constraint invitations_project_in_org
    foreign key (project_id, org_id)
    references public.projects(id, org_id) on delete cascade
);

create index if not exists invitations_org_id_idx on public.invitations(org_id);
create index if not exists invitations_email_idx  on public.invitations(lower(email));

-- Only one invitation may be outstanding per address per org; re-inviting means deleting
-- the old row (or letting it expire) rather than accumulating redeemable tokens.
create unique index if not exists invitations_pending_email_org_key
  on public.invitations(org_id, lower(email))
  where accepted_at is null;
