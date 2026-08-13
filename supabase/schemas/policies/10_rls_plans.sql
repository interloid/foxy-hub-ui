alter table public.plans enable row level security;

-- Any authenticated user can view active plans (needed for pricing page)
create policy "anyone_view_active_plans"
  on public.plans for select to authenticated
  using (is_active = true);