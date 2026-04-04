-- ============================================================
-- health_summaries: multi-layer health summary memory
-- levels: weekly_snapshot, rolling_weekly, monthly, quarterly, biannual
-- ============================================================

create table if not exists public.health_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  level        text not null,
  is_latest    boolean not null default false,
  window_start date not null,
  window_end   date not null,
  summary      text,
  stats        jsonb,
  created_at   timestamptz default now()
);

create index health_summaries_user_level_latest_idx
  on public.health_summaries (user_id, level, is_latest);

create index health_summaries_user_level_window_idx
  on public.health_summaries (user_id, level, window_start);

alter table public.health_summaries enable row level security;

create policy "users read own summaries"
  on public.health_summaries for select
  using (auth.uid() = user_id);
