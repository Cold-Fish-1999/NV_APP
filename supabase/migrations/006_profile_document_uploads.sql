-- Profile document uploads + context snapshot extension

CREATE TABLE IF NOT EXISTS public.profile_document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('medical_record', 'treatment_record', 'other_app')),
  storage_bucket text NOT NULL DEFAULT 'profile-documents',
  storage_path text NOT NULL,
  mime_type text,
  ai_summary text,
  user_summary text,
  extracted_text text,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_document_uploads_user_created_idx
  ON public.profile_document_uploads (user_id, created_at DESC);

ALTER TABLE public.profile_document_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_document_uploads_select_own" ON public.profile_document_uploads;
CREATE POLICY "profile_document_uploads_select_own"
  ON public.profile_document_uploads
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "profile_document_uploads_insert_own" ON public.profile_document_uploads;
CREATE POLICY "profile_document_uploads_insert_own"
  ON public.profile_document_uploads
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profile_document_uploads_update_own" ON public.profile_document_uploads;
CREATE POLICY "profile_document_uploads_update_own"
  ON public.profile_document_uploads
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profile_document_uploads_delete_own" ON public.profile_document_uploads;
CREATE POLICY "profile_document_uploads_delete_own"
  ON public.profile_document_uploads
  FOR DELETE
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS profile_document_uploads_updated_at ON public.profile_document_uploads;
CREATE TRIGGER profile_document_uploads_updated_at
  BEFORE UPDATE ON public.profile_document_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_context_snapshots
  ADD COLUMN IF NOT EXISTS docs_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS docs_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Trigger context refresh jobs when profile documents change
DROP TRIGGER IF EXISTS enqueue_context_refresh_from_profile_docs ON public.profile_document_uploads;
CREATE TRIGGER enqueue_context_refresh_from_profile_docs
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_document_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_context_refresh_job('profile_docs_changed');

-- Storage bucket + object policies for per-user folders: {user_id}/...
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-documents', 'profile-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile_documents_storage_select_own" ON storage.objects;
CREATE POLICY "profile_documents_storage_select_own"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'profile-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_documents_storage_insert_own" ON storage.objects;
CREATE POLICY "profile_documents_storage_insert_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_documents_storage_update_own" ON storage.objects;
CREATE POLICY "profile_documents_storage_update_own"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_documents_storage_delete_own" ON storage.objects;
CREATE POLICY "profile_documents_storage_delete_own"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'profile-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
