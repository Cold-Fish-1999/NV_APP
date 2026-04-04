-- ============================================================
-- NVAPP：health_profiles 增加 profile_display（自由文本，由 onboarding 填入初值）
-- ============================================================

ALTER TABLE public.health_profiles
  ADD COLUMN IF NOT EXISTS profile_display jsonb;

COMMENT ON COLUMN public.health_profiles.profile_display IS '档案页自由文本：age_range, gender, occupation, smoking, alcohol, health_concerns, family_history, medications, activity_level, sleep_quality';
