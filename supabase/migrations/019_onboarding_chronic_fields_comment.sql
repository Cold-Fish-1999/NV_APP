-- Document new keys stored in health_profiles.onboarding_survey (jsonb; no schema change).
-- chronic_disease_distress: "Yes" | "No"
-- chronic_conditions: string[] (multi-select labels from onboarding UI)

COMMENT ON COLUMN public.health_profiles.onboarding_survey IS
  'Onboarding 问卷：age_range, gender, smoking, alcohol, cannabis, health_concerns, chronic_disease_distress, chronic_conditions, family_history, family_conditions, medications, activity_level, sleep_quality';
