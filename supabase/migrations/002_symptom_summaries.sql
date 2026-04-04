-- ============================================================
-- NVAPP：症状摘要中间表 symptom_summaries
-- 存储对话中模型提取的症状/健康事件概括，用于聚合生成 daily_logs
-- 在 Supabase SQL Editor 中直接执行
-- ============================================================

-- 1) 创建表 symptom_summaries
CREATE TABLE IF NOT EXISTS public.symptom_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  summary text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  severity text CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  confidence real CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 2) 索引
CREATE INDEX IF NOT EXISTS symptom_summaries_user_date_created_idx
  ON public.symptom_summaries (user_id, local_date, created_at DESC);

CREATE INDEX IF NOT EXISTS symptom_summaries_user_created_idx
  ON public.symptom_summaries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS symptom_summaries_source_message_id_idx
  ON public.symptom_summaries (source_message_id)
  WHERE source_message_id IS NOT NULL;

-- 3) 启用 RLS
ALTER TABLE public.symptom_summaries ENABLE ROW LEVEL SECURITY;

-- 4) RLS 策略
CREATE POLICY "symptom_summaries_select_own"
  ON public.symptom_summaries
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "symptom_summaries_insert_own"
  ON public.symptom_summaries
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "symptom_summaries_update_own"
  ON public.symptom_summaries
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "symptom_summaries_delete_own"
  ON public.symptom_summaries
  FOR DELETE
  USING (user_id = auth.uid());
