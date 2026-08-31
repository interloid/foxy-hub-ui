create table public.memberships (
  id         uuid             primary key default gen_random_uuid(),
  created_at timestamptz      not null    default now(),
  role       public.user_role not null,
  org_id     uuid             not null references public.organizations(id)
                              on update cascade on delete cascade,
  user_id    uuid             not null references auth.users(id)
                              on update cascade on delete cascade
);

create index if not exists memberships_user_id_idx on public.memberships(user_id);
create index if not exists memberships_org_id_idx  on public.memberships(org_id);
create unique index if not exists memberships_user_org_key
  on public.memberships(user_id, org_id);