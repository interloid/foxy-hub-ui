create table public.invoices (
  id             uuid        primary key default gen_random_uuid(),
  invoice_number text        not null unique,
  org_id         uuid        not null    references public.organizations(id) on delete cascade,
  project_id     uuid        not null    references public.projects(id) on delete cascade,
  amount         numeric     not null    check (amount >= 0),
  subtotal       numeric     not null default 0 check (subtotal >= 0),
  tax_amount     numeric     not null default 0 check (tax_amount >= 0),
  currency       text        not null default 'INR' check (char_length(currency) = 3),
  description    text,
  invoice_url    text,
  status         public.invoice_status        not null    default 'draft',
  payment_intent text        unique,
  created_at     timestamptz not null    default now(),
  due_date       timestamptz,
  paid_at        timestamptz
);

create index if not exists invoices_org_id_idx     on public.invoices(org_id);
create index if not exists invoices_project_id_idx on public.invoices(project_id);
create index if not exists invoices_number_idx     on public.invoices(invoice_number);