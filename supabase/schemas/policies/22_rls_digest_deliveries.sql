-- Service role only (the weekly-digest Edge Function). RLS on with no
-- policies means every API role resolves to zero rows and cannot write.
alter table public.digest_deliveries enable row level security;
