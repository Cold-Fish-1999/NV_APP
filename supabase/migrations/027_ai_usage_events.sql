-- AI token 用量事件（Next 服务端 service_role 写入；二期 Edge 可用 source 区分）
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  metadata jsonb,
  source text not null default 'next_server',
  created_at timestamptz not null default now(),
  constraint ai_usage_events_provider_check check (provider in ('anthropic', 'openai'))
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_feature_idx
  on public.ai_usage_events (feature);

comment on table public.ai_usage_events is 'Per-call AI usage for metering; written by apps/server (and later Edge with source)';

alter table public.ai_usage_events enable row level security;
-- 无 policy：anon/authenticated 默认不可读写；service_role 绕过 RLS
