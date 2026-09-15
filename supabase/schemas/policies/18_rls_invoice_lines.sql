alter table public.invoice_lines enable row level security;

-- REQUIRED, not optional. `grants.sql` gives anon and authenticated full DML on every table
-- in `public` — that is Supabase's model, where grants are permissive and RLS is the gate.
-- A new table without RLS is therefore readable by anyone, and invoice lines name people and
-- their rates.

-- A line is visible to exactly whoever can see the invoice it belongs to, so this mirrors
-- `08_rls_invoices` through the join rather than inventing its own rule. Staff see their
-- org's; a client sees only the invoices of projects they are the client OF.
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
            array['owner', 'admin', 'member']::public.user_role[]
          )
        )
    )
  );

-- Lines are written by `create_invoice_with_entries`, which is SECURITY DEFINER and does its
-- own role check, so this policy is not on the hot path. It exists so the table is not
-- writable through the API by anyone who happens to know an invoice id.
create policy "owners_admins_insert_invoice_lines"
  on public.invoice_lines for insert to authenticated
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and public.has_org_role(
          i.org_id,
          array['owner', 'admin']::public.user_role[]
        )
    )
  );

-- No update or delete policy. An issued invoice is not edited — a correction is a cancel plus
-- a re-issue — and `on delete cascade` already removes lines with their invoice.
