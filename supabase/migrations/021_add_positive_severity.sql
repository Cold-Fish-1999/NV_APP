-- Add 'positive' to severity CHECK constraint on symptom_summaries
-- Represents positive health states (good sleep, exercise, feeling well, etc.)

ALTER TABLE public.symptom_summaries
  DROP CONSTRAINT IF EXISTS symptom_summaries_severity_check;

ALTER TABLE public.symptom_summaries
  ADD CONSTRAINT symptom_summaries_severity_check
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'positive'));
