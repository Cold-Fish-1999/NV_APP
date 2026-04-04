-- Remove legacy user_context_snapshots + context_refresh_jobs and related triggers.
-- Chat / product context will be rebuilt around health_summaries + user_document_context.

DROP TRIGGER IF EXISTS enqueue_context_refresh_from_profile_docs ON public.profile_document_uploads;
DROP TRIGGER IF EXISTS enqueue_context_refresh_from_profiles ON public.health_profiles;
DROP TRIGGER IF EXISTS enqueue_context_refresh_from_summaries ON public.symptom_summaries;

DROP FUNCTION IF EXISTS public.enqueue_context_refresh_job();

DROP TABLE IF EXISTS public.context_refresh_jobs;
DROP TABLE IF EXISTS public.user_context_snapshots;
