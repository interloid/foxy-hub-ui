-- The Recent activity feed on the dashboard.
--
-- **Why a table rather than a view over the existing ones.** The obvious alternative is to UNION
-- what already happened — approvals, paid invoices, posted updates, uploads, invitations — and
-- the reason that does not work is that the source rows do not record it:
--
--   `deliveries`       had no `created_at` and has no `approved_by` — "Erik approved X" has no author
--   `delivery_assets`  has neither a timestamp nor an uploader at all
--   `updates`          works (`author_id` + `created_at`)
--   `invitations`      works (`invited_by` + `created_at`)
--   `invoices.paid_at` works
--
-- So a view needs new columns on two tables, a five-way UNION that must be re-sorted on every
-- read, and it still cannot express the actor KIND that tints each avatar. An append-only log is
-- one insert at the moment the thing happens, one index, and one ordered read.
--
-- **It is a log: append-only, never corrected.** There is no `updated_at` and nothing should ever
-- UPDATE a row here — a feed that can be rewritten is not a record of what happened. If an event
-- was wrong, the fix is a later event, the same discipline `project_allocations` uses for rates.
create table public.activity_events (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id) on delete cascade,

  -- Nullable: a `system` event has no human actor (Stripe marks an invoice paid at 3am).
  -- `on delete set null`, NOT cascade — when somebody leaves the workspace the history of what
  -- they did must survive them, or the feed silently rewrites the past.
  actor_id    uuid        references auth.users(id) on delete set null,
  actor_kind  public.activity_actor_kind not null,

  -- **`text`, deliberately not an enum** — the one place this schema does not use one.
  -- Event types are an OPEN set that grows with every feature ('delivery_approved',
  -- 'invoice_paid', 'update_posted', 'asset_uploaded', 'member_invited', …). `alter type … add
  -- value` cannot run inside a transaction block, so each new event would mean a migration that
  -- fails differently from every other migration in this repo. Nothing renders off this column;
  -- it exists for filtering and for rebuilding `summary` later if the wording changes.
  type        text        not null,

  -- The rendered sentence: "Erik Lund approved Logo_Suite.zip".
  --
  -- Denormalised ON PURPOSE. The feed's line names things that may be gone by the time anyone
  -- reads it — a deleted asset, a renamed project, a client who left. Composing the sentence at
  -- read time would make old rows decay into "someone approved something"; composing it at write
  -- time, when the facts are still true, is what keeps history readable. `payload` keeps the
  -- structured version for anything that needs to re-render.
  summary     text        not null,

  -- Optional links to what the event was ABOUT, so a future project page can filter its own
  -- feed. `entity_type`/`entity_id` are loose by design: they point at rows in tables this one
  -- must not hard-depend on (an asset can be deleted; its event stays).
  project_id  uuid        references public.projects(id) on delete cascade,
  entity_type text,
  entity_id   uuid,
  payload     jsonb       not null default '{}'::jsonb,

  created_at  timestamptz not null default now()
);

-- The only read this table has: newest N for one workspace. `created_at desc` is in the index so
-- the feed never sorts, and org_id leads because it is always an equality filter.
create index if not exists activity_events_org_created_idx
  on public.activity_events(org_id, created_at desc);

create index if not exists activity_events_project_id_idx
  on public.activity_events(project_id);
