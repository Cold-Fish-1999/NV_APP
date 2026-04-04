-- ============================================================
-- user_entitlements：用户订阅权限（RevenueCat Webhook 写入）
-- 只存「用户当前是否有权限」，不镜像 RevenueCat 全部数据
-- ============================================================

create table if not exists public.user_entitlements (
  user_id uuid references auth.users(id) on delete cascade primary key,
  is_pro boolean default false,
  plan_id text,                    -- e.g. 'monthly', 'annual'
  expires_at timestamptz,
  rc_customer_id text,             -- RevenueCat customer ID
  updated_at timestamptz default now()
);

-- RLS: 用户只能读自己的
alter table public.user_entitlements enable row level security;

create policy "users read own"
  on public.user_entitlements
  for select
  using (auth.uid() = user_id);

-- 写入由 Edge Function（service_role）完成，无需 INSERT/UPDATE policy 给 anon/authenticated
