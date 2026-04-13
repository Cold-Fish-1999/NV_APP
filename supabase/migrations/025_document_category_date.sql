-- ============================================================
-- Document category update + report_date column
-- New categories: medical_record, checkup_report, tracker_app, other
-- Keep old values for backward compatibility
-- ============================================================

ALTER TABLE public.profile_document_uploads
  DROP CONSTRAINT IF EXISTS profile_document_uploads_category_check;

ALTER TABLE public.profile_document_uploads
  ADD CONSTRAINT profile_document_uploads_category_check
  CHECK (category IN (
    'medical_record', 'checkup_report', 'tracker_app', 'other',
    'treatment_record', 'other_app'
  ));

ALTER TABLE public.profile_document_uploads
  ADD COLUMN IF NOT EXISTS report_date date;

CREATE INDEX IF NOT EXISTS idx_profile_doc_uploads_category_date
  ON public.profile_document_uploads(user_id, category, report_date);
