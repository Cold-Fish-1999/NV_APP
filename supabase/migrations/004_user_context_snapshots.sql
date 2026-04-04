-- ============================================================
-- NVAPP：用户隐式上下文快照 + 刷新任务队列
-- 触发条件：
-- 1) health_profiles 变更
-- 2) symptom_summaries 变更
-- 3) 每日定时批处理（服务端调用）
-- ============================================================

-- 1) symptom_summaries 增加 updated_at
ALTER TABLE public.symptom_summaries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS symptom_summaries_updated_at ON public.symptom_summaries;
CREATE TRIGGER symptom_summaries_updated_at
  BEFORE UPDATE ON public.symptom_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 2) 用户上下文快照表（每用户一条）
CREATE TABLE IF NOT EXISTS public.user_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_compact jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_14d text NOT NULL DEFAULT '',
  risk_flags text[] NOT NULL DEFAULT '{}',
  source_window jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS user_context_snapshots_user_id_idx
  ON public.user_context_snapshots (user_id);

ALTER TABLE public.user_context_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_context_snapshots_select_own" ON public.user_context_snapshots;
CREATE POLICY "user_context_snapshots_select_own"
  ON public.user_context_snapshots
  FOR SELECT
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS user_context_snapshots_updated_at ON public.user_context_snapshots;
CREATE TRIGGER user_context_snapshots_updated_at
  BEFORE UPDATE ON public.user_context_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3) context 刷新任务队列表（按 user 去重）
CREATE TABLE IF NOT EXISTS public.context_refresh_jobs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'data_changed',
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_refresh_jobs_requested_at_idx
  ON public.context_refresh_jobs (requested_at DESC);

ALTER TABLE public.context_refresh_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "context_refresh_jobs_select_own" ON public.context_refresh_jobs;
CREATE POLICY "context_refresh_jobs_select_own"
  ON public.context_refresh_jobs
  FOR SELECT
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS context_refresh_jobs_updated_at ON public.context_refresh_jobs;
CREATE TRIGGER context_refresh_jobs_updated_at
  BEFORE UPDATE ON public.context_refresh_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4) 入队函数：profile/symptom 变化时触发
CREATE OR REPLACE FUNCTION public.enqueue_context_refresh_job()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  trigger_reason text;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);
  trigger_reason := TG_ARGV[0];

  IF target_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.context_refresh_jobs (user_id, reason, requested_at)
  VALUES (target_user_id, COALESCE(trigger_reason, 'data_changed'), now())
  ON CONFLICT (user_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        requested_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enqueue_context_refresh_from_profiles ON public.health_profiles;
CREATE TRIGGER enqueue_context_refresh_from_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.health_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_context_refresh_job('profile_changed');

DROP TRIGGER IF EXISTS enqueue_context_refresh_from_summaries ON public.symptom_summaries;
CREATE TRIGGER enqueue_context_refresh_from_summaries
  AFTER INSERT OR UPDATE OR DELETE ON public.symptom_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_context_refresh_job('symptom_changed');
