-- ============================================================
-- NVAPP：Reports 表 — weekly_reports + monthly_reports
-- 存储预生成的周/月健康报告，移动端只读渲染
-- ============================================================

-- 1) weekly_reports
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,
  week_end    date        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS weekly_reports_user_week_idx
  ON public.weekly_reports (user_id, week_start DESC);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_reports_select_own"
  ON public.weekly_reports FOR SELECT
  USING (user_id = auth.uid());

-- 2) monthly_reports
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_month text        NOT NULL,   -- 'YYYY-MM'
  month_start  date        NOT NULL,
  month_end    date        NOT NULL,
  data         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_month)
);

CREATE INDEX IF NOT EXISTS monthly_reports_user_month_idx
  ON public.monthly_reports (user_id, report_month DESC);

ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_reports_select_own"
  ON public.monthly_reports FOR SELECT
  USING (user_id = auth.uid());
