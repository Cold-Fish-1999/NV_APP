-- ============================================================
-- user_keyword_presets：用户常用关键词备选列表
-- 每个用户维护自己的预设关键词，可添加、删除
-- ============================================================

create table if not exists public.user_keyword_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, keyword)
);

create index if not exists user_keyword_presets_user_id_idx
  on public.user_keyword_presets (user_id, sort_order);

alter table public.user_keyword_presets enable row level security;

create policy "user_keyword_presets_select_own"
  on public.user_keyword_presets for select
  using (user_id = auth.uid());

create policy "user_keyword_presets_insert_own"
  on public.user_keyword_presets for insert
  with check (user_id = auth.uid());

create policy "user_keyword_presets_delete_own"
  on public.user_keyword_presets for delete
  using (user_id = auth.uid());
