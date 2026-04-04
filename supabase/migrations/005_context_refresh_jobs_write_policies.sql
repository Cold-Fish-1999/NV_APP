-- Fix RLS write failure for trigger enqueue_context_refresh_job
-- Symptom/profile updates from client were blocked because
-- context_refresh_jobs only had SELECT policy.

ALTER TABLE public.context_refresh_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "context_refresh_jobs_insert_own" ON public.context_refresh_jobs;
CREATE POLICY "context_refresh_jobs_insert_own"
  ON public.context_refresh_jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "context_refresh_jobs_update_own" ON public.context_refresh_jobs;
CREATE POLICY "context_refresh_jobs_update_own"
  ON public.context_refresh_jobs
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
