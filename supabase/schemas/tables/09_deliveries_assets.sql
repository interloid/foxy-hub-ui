create table public.delivery_assets (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid not null    references public.deliveries(id) on delete cascade,
  file_path   text not null
);

create index if not exists delivery_assets_delivery_id_idx on public.delivery_assets(delivery_id);