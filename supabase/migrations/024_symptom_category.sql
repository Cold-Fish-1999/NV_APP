-- ============================================================
-- Add category column to symptom_summaries
-- Categories: symptom_feeling, diet, medication_supplement, behavior_treatment
-- Default: symptom_feeling (all existing records auto-classified)
-- ============================================================

ALTER TABLE public.symptom_summaries
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'symptom_feeling'
  CHECK (category IN ('symptom_feeling', 'diet', 'medication_supplement', 'behavior_treatment'));

CREATE INDEX IF NOT EXISTS idx_symptom_summaries_category
  ON public.symptom_summaries(user_id, category, local_date);
