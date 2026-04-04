-- ============================================================
-- NVAPP：health_profiles 增加 onboarding 问卷数据（与 onboarding 问答一致）
-- ============================================================

ALTER TABLE public.health_profiles
  ADD COLUMN IF NOT EXISTS onboarding_survey jsonb;

COMMENT ON COLUMN public.health_profiles.onboarding_survey IS 'Onboarding 问卷原始数据：age_range, gender, smoking, alcohol, cannabis, health_concerns, family_history, family_conditions, medications, activity_level, sleep_quality';
