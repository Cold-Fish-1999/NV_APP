-- ============================================================
-- summary_generation_queue: backfill jobs when user upgrades
-- ============================================================

create table if not exists public.summary_generation_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  level        text,
  status       text not null default 'pending',  -- 'pending' | 'processing' | 'done' | 'failed'
  triggered_by text,
  error        text,
  attempts     int not null default 0,
  created_at   timestamptz default now(),
  processed_at timestamptz
);

create index if not exists summary_generation_queue_pending_idx
  on public.summary_generation_queue (status, created_at)
  where status = 'pending';

-- Trigger: enqueue backfill when user upgrades to Pro
create or replace function public.enqueue_backfill_on_upgrade()
returns trigger as $$
begin
  if (tg_op = 'INSERT' and new.is_pro = true)
     or (tg_op = 'UPDATE' and new.is_pro = true and (old.is_pro is null or old.is_pro = false))
  then
    insert into public.summary_generation_queue (user_id, level, status, triggered_by)
    values (new.user_id, 'backfill', 'pending', 'user_upgrade');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_enqueue_backfill_on_upgrade on public.user_entitlements;
create trigger trigger_enqueue_backfill_on_upgrade
  after insert or update on public.user_entitlements
  for each row execute function public.enqueue_backfill_on_upgrade();
