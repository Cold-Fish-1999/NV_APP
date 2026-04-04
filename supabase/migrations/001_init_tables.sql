-- ============================================================
-- NVAPP Supabase 初始化：daily_logs、chat_messages + RLS
-- 在 Supabase SQL Editor 中直接执行
-- ============================================================

-- ============================================================
-- 1) 创建表 daily_logs
-- 用户每日结构化健康记录
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) 唯一约束：每个用户每天仅一条记录
ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_user_id_date_key UNIQUE (user_id, date);

-- 3) 启用 RLS
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

-- 4) RLS 策略
CREATE POLICY "daily_logs_select_own"
  ON public.daily_logs
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "daily_logs_insert_own"
  ON public.daily_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "daily_logs_update_own"
  ON public.daily_logs
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "daily_logs_delete_own"
  ON public.daily_logs
  FOR DELETE
  USING (user_id = auth.uid());

-- updated_at 触发器
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 1) 创建表 chat_messages
-- 用户与 AI 的对话记录
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content text NOT NULL,
  local_date date,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 2) 索引
CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx
  ON public.chat_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_user_local_date_idx
  ON public.chat_messages (user_id, local_date);

-- 3) 启用 RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 4) RLS 策略
CREATE POLICY "chat_messages_select_own"
  ON public.chat_messages
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "chat_messages_insert_own"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_messages_update_own"
  ON public.chat_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_messages_delete_own"
  ON public.chat_messages
  FOR DELETE
  USING (user_id = auth.uid());
