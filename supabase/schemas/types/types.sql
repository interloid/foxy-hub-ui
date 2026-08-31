create type public.project_status as enum (
  'draft', 'in-progress', 'pending-approval', 'pending',
  'on-hold', 'completed', 'cancelled'
);

create type public.roles as enum ('admin', 'user');

create type public.user_role as enum ('owner', 'admin', 'member', 'client');

CREATE TYPE public.delivery_status as enum (
  'pending',
  'submitted',
  'approved',
  'rejected'
);

CREATE TYPE public.invoice_status AS ENUM (
  'draft',
  'due',
  'paid',
  'overdue',
  'cancelled'
);

CREATE TYPE public.milestone_status AS ENUM (
  'pending',
  'in_progress',
  'completed'
);

CREATE TYPE public.time_entry_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'rejected'
);

-- Must be able to hold every status Stripe can send, because `stripe-webhook` writes
-- `subscription.status` into this column. It previously held only the first five, so
-- `incomplete`, `incomplete_expired`, `unpaid` and `paused` all raised an invalid-enum
-- error inside the handler's try block -> HTTP 500 -> Stripe retries the event forever.
--
-- Stripe spells it `canceled` (one L) and this enum uses `cancelled`; that one difference
-- is translated in the webhook rather than renaming the value, which existing rows use.
-- `expired` is a domain value with no Stripe counterpart and is kept.
--
-- Order matters: the new values are appended here in the same order the accompanying
-- migration ALTER TYPE ... ADD VALUEs them, so the declarative schema and the database
-- agree and `db diff` sees no drift.
CREATE TYPE public.subscription_status AS ENUM (
  'active',
  'trialing',
  'past_due',
  'cancelled',
  'expired',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused'
);

-- How a project bills, per `raw-src/WorkspacePage.dc.html`'s New project panel. The four
-- values are the design's own (`engCards`), and they are NOT interchangeable with
-- `project_status` — one says how work is charged, the other how far along it is.
-- See decisions.md D044.
create type public.engagement_model as enum (
  'full_time',
  'part_time',
  'retainer',
  'fixed'
);

-- A retainer's bucket refills weekly or monthly. The prototype renders this as
-- "40 h / month", so the period is a fact about the retainer, not a display choice.
create type public.retainer_period as enum ('weekly', 'monthly');

-- Who did the thing, for the Recent activity feed. This is an ENUM because it is a closed set
-- that drives RENDERING: the prototype tints each avatar by exactly these three kinds
-- (`kind: 'system' | 'client' | 'member'`), so a fourth value would have no colour to draw and
-- the feed would fail silently rather than loudly.
--
-- `member` covers all staff — owner, admin and member alike. The feed says "Marcus posted an
-- update", never "an admin posted an update", so the agency-side roles collapse to one tint.
-- `system` is for events with no human actor (an invoice paid by webhook), which is also why
-- `activity_events.actor_id` is nullable.
create type public.activity_actor_kind as enum ('system', 'client', 'member');
