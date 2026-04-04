-- DEV ONLY: allow authenticated users to upsert their own row in user_entitlements
-- This is used by the in-app tier switcher for testing (Profile page).
-- TODO: Drop this policy before production launch.

create policy "dev_users_upsert_own_entitlements"
  on public.user_entitlements
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
