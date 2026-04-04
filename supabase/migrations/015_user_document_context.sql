-- ============================================================
-- user_document_context: aggregated document summaries (service writes only)
-- ============================================================

create table if not exists public.user_document_context (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  docs_summary        text,
  docs_items          jsonb not null default '[]'::jsonb,
  risk_flags          text[] not null default '{}',
  generated_by_model  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists user_document_context_user_id_idx
  on public.user_document_context (user_id);

alter table public.user_document_context enable row level security;

create policy "users read own document context"
  on public.user_document_context for select
  using (auth.uid() = user_id);
