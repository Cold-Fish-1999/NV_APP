-- Group multiple uploaded images into one logical profile document record

ALTER TABLE public.profile_document_uploads
  ADD COLUMN IF NOT EXISTS record_id text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS group_ai_summary text,
  ADD COLUMN IF NOT EXISTS group_user_summary text;

CREATE INDEX IF NOT EXISTS profile_document_uploads_user_record_idx
  ON public.profile_document_uploads (user_id, record_id, created_at DESC);
