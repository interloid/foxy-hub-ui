SET check_function_bodies = false;
CREATE FUNCTION public.create_invoice_with_entries(invoice_data jsonb, entry_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invoice_id uuid;
  v_org_id     uuid;
  v_project_id uuid;
  v_period     date;
  v_year       text;
  v_seq        int;
  v_number     text;
  v_claimed    int;
begin
  v_org_id     := (invoice_data->>'org_id')::uuid;
  v_project_id := (invoice_data->>'project_id')::uuid;
  v_period     := nullif(invoice_data->>'period_start', '')::date;

  -- 1. Authorization: only owners and admins bill.
  if not public.has_org_role(v_org_id, array['owner', 'admin']::public.user_role[]) then
    raise exception 'Not authorized to create invoices for this organization' using errcode = '42501';
  end if;

  -- 2. The project must belong to the org the caller is billing under. Without this a caller
  --    who administers org A could raise an invoice against org B's project by passing its id.
  if not exists (
    select 1 from public.projects p
    where p.id = v_project_id and p.org_id = v_org_id
  ) then
    raise exception 'Project does not belong to this organization' using errcode = '42501';
  end if;

  -- 3. Period guard for the flat engagements. `invoices_project_period_key` enforces this too,
  --    but reaching it surfaces a unique-violation; this raises something a user can read.
  if v_period is not null and exists (
    select 1 from public.invoices i
    where i.project_id = v_project_id and i.period_start = v_period
  ) then
    raise exception 'This project is already invoiced for the period starting %', v_period
      using errcode = '23505';
  end if;

  -- 4. Invoice number: INV-<year>-<seq>, sequential per org per year. Derived inside the
  --    transaction so two concurrent generations cannot read the same max; if they interleave
  --    anyway, `invoice_number`'s unique constraint rejects the loser rather than duplicating.
  v_year := to_char(now(), 'YYYY');

  select coalesce(max((regexp_replace(i.invoice_number, '^.*-', ''))::int), 0) + 1
    into v_seq
    from public.invoices i
   where i.org_id = v_org_id
     and i.invoice_number like 'INV-' || v_year || '-%';

  v_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  -- 5. Insert the invoice.
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

  -- 6. Claim the hours. The where clause re-states every precondition rather than trusting the
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
$function$;
GRANT ALL ON FUNCTION public.create_invoice_with_entries(jsonb, uuid[]) TO anon;
GRANT ALL ON FUNCTION public.create_invoice_with_entries(jsonb, uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_with_entries(jsonb, uuid[]) TO service_role;
ALTER TABLE public.invoices ALTER COLUMN currency SET DEFAULT 'USD'::text;
