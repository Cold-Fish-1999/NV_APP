-- Add a short AI-generated title per document record group
ALTER TABLE public.profile_document_uploads
  ADD COLUMN IF NOT EXISTS group_title text;
