-- ============================================================
-- summary_generation_queue: scheduled_at for debounced document_context jobs
-- ============================================================

alter table public.summary_generation_queue
  add column if not exists scheduled_at timestamptz default now();

update public.summary_generation_queue
set scheduled_at = coalesce(scheduled_at, created_at);

create index if not exists summary_generation_queue_document_context_due_idx
  on public.summary_generation_queue (status, level, scheduled_at)
  where status = 'pending' and level = 'document_context';

-- On Pro upgrade: enqueue backfill + document context refresh
create or replace function public.enqueue_backfill_on_upgrade()
returns trigger as $$
begin
  if (tg_op = 'INSERT' and new.is_pro = true)
     or (tg_op = 'UPDATE' and new.is_pro = true and (old.is_pro is null or old.is_pro = false))
  then
    insert into public.summary_generation_queue (user_id, level, status, triggered_by, scheduled_at)
    values (new.user_id, 'backfill', 'pending', 'user_upgrade', now());
    insert into public.summary_generation_queue (user_id, level, status, triggered_by, scheduled_at)
    values (new.user_id, 'document_context', 'pending', 'user_upgrade', now());
  end if;
  return new;
end;
$$ language plpgsql security definer;
