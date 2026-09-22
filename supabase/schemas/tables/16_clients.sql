-- The client COMPANY — "Nordwave Coffee", "Harbor Financial".
--
-- **This is not the same thing as `projects.client_id`, and it does not replace it.** A client
-- until now was a *person*: a `memberships` row with role `client`, named from `profiles`
-- (that is what `getOrgClients()` returns). But the dashboard labels every project row and
-- every pending approval with a **company** name, and no table held one.
--
-- `projects.client_id` STAYS a `auth.users` id, untouched. It is what the client portal's own
-- read policy compares to `auth.uid()` —
--
--   `staff_and_own_client_view_projects` … `client_id = (select auth.uid())`
--
-- — so repointing it at this table would not be a rename, it would silently revoke every
-- client's access to their own project. The company is therefore a SECOND, separate link
-- (`projects.client_org_id`), and the two answer different questions: `client_id` is "who may
-- sign in and see this", `client_org_id` is "whose name goes on the row".
--
-- **Why this file is numbered 16 and still alters `projects` (05).** Files in
-- `schemas/tables` load in filename order, so a table referenced by `projects` would have to
-- sort before it, and renumbering 05–15 to insert one table churns every other file. Adding the
-- FK from here instead keeps the ordering valid — the same thing `15_invitations.sql` already
-- does when it reaches back to `projects` for its composite key.
create table public.clients (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,

  name          text        not null,

  -- The named human at the company, as the design's project header shows them
  -- ("Erik Lund · erik@nordwave.com"). Plain text, NOT a reference to `auth.users`: a company
  -- has a contact long before that person is ever invited to the portal, and the two are
  -- independent — the contact can change without touching anybody's login.
  contact_name  text,
  contact_email text,

  -- ── Whether this company is still a live client of THIS workspace ────────────────────
  --
  -- The mirror of `memberships.status`, and for the same reason: the Clients table offers
  -- "deactivate", not "delete". A hard delete would take the company's name with it, and
  -- `projects.client_org_id` is `on delete set null` — so every project that company ever
  -- paid for would silently lose the name on its row, in the invoices and in the dashboard's
  -- pending-approval list. Keeping the row keeps those labels readable forever; the flag is
  -- what stops the company appearing in pickers and seat counts.
  --
  -- NOT NULL with a default: every existing row starts active, and "is this still a client"
  -- has no third unknown state.
  status        boolean     not null default true,

  -- The Stripe Customer this company bills through.
  --
  -- Without it every invoice created a throwaway customer from `customer_email`, so a client
  -- with six invoices was six unrelated customers in Stripe — no payment history, no saved
  -- card, and nothing to reconcile a refund against. Held here rather than on `invoices`
  -- because the customer belongs to the company, not to one bill.
  --
  -- Nullable: it is minted the first time an invoice is issued, and a client who has never
  -- been billed has no reason to exist in Stripe at all.
  stripe_customer_id text unique,

  created_at    timestamptz not null default now(),

  -- Two companies with one name inside one workspace are a data-entry slip, not two clients.
  -- Scoped to `org_id`, so unrelated agencies may both have a "Acme".
  unique (org_id, name)
);

create index if not exists clients_org_id_idx on public.clients(org_id, status);

-- The company a project belongs to. Nullable: every existing project predates this column, and
-- an internal project has no client at all. `on delete set null` rather than cascade — deleting
-- a company must never delete the work done for it, or its invoices and time entries with it.
alter table public.projects
  add column if not exists client_org_id uuid references public.clients(id) on delete set null;

create index if not exists projects_client_org_id_idx on public.projects(client_org_id);
