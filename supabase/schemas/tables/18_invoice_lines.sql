-- What an invoice actually said, frozen at the moment it was issued.
--
-- Lines were computed on the fly and never stored: `invoices` kept only `amount`, `subtotal`
-- and `tax_amount`. Reopening INV-001 six months later recomputed it from CURRENT rates and
-- CURRENT entries, so it could disagree with the document the client received — and every
-- invoice raised before this table existed is one that can never be reproduced.
--
-- That contradicts the rest of the billing design, which treats an issued invoice as
-- immutable: an unpaid invoice ages into `overdue` as its own document, a correction is a
-- cancel plus a re-issue, and `time_entries.invoice_id` stays put through all of it. A
-- document you cannot reprint is not really immutable.
--
-- The columns mirror what the New invoice panel renders, so persisting is a copy rather than
-- a translation. They are deliberately DENORMALISED — a name and a rate, not a `user_id` and
-- a join. The whole point is that the line keeps saying what it said even after the person is
-- renamed, their allocation ends, or their rate changes.
create table public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,

  -- "Marcus Lee — approved hours", "Monthly retainer", "Overage — beyond the 80h bucket".
  description text not null,

  -- HOURS | RETAINER | OVERAGE | FIXED.
  --
  -- `text`, not an enum, and for the same reason `activity_events.kind` is: these are display
  -- labels for a document that has already been sent. A new engagement model must not make an
  -- old invoice unreadable, and an enum would need a migration to add one.
  type_label  text not null,

  -- Null for the flat engagements, which bill a fee rather than a quantity. The retainer line
  -- carries its bucket in `description` instead, because "80h" there is the size of what was
  -- bought, not an amount that multiplies by a rate.
  quantity    numeric(10, 2) check (quantity  is null or quantity  >= 0),
  unit_rate   numeric(10, 2) check (unit_rate is null or unit_rate >= 0),

  amount      numeric(12, 2) not null check (amount >= 0),

  -- Invoice line order is meaningful — hours before overage — and row order is not a
  -- guarantee Postgres makes.
  sort_order  smallint not null default 0
);

create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);
