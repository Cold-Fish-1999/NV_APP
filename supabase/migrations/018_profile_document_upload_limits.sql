-- Limits on profile_document_uploads (per user):
-- - At most 10 distinct contexts (record_id)
-- - At most 5 rows (images) per record_id
-- - At most 10 uploads per UTC calendar day
-- - At most 20 uploads per rolling 7-day window (UTC)

CREATE OR REPLACE FUNCTION public.enforce_profile_document_upload_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  same_record_count int;
  distinct_ctx int;
  today_count int;
  week_count int;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Max 5 images per context (record_id)
  SELECT COUNT(*) INTO same_record_count
  FROM public.profile_document_uploads
  WHERE user_id = NEW.user_id
    AND record_id = NEW.record_id;

  IF same_record_count >= 5 THEN
    RAISE EXCEPTION 'profile_document_limit: max_images_per_context (5)';
  END IF;

  -- Max 10 distinct contexts: only when this INSERT opens a new record_id
  IF same_record_count = 0 THEN
    SELECT COUNT(DISTINCT record_id) INTO distinct_ctx
    FROM public.profile_document_uploads
    WHERE user_id = NEW.user_id;

    IF distinct_ctx >= 10 THEN
      RAISE EXCEPTION 'profile_document_limit: max_contexts (10)';
    END IF;
  END IF;

  -- Max 10 uploads per UTC day
  SELECT COUNT(*) INTO today_count
  FROM public.profile_document_uploads
  WHERE user_id = NEW.user_id
    AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date;

  IF today_count >= 10 THEN
    RAISE EXCEPTION 'profile_document_limit: max_uploads_per_utc_day (10)';
  END IF;

  -- Max 20 uploads per rolling 7 days (UTC-based instant)
  SELECT COUNT(*) INTO week_count
  FROM public.profile_document_uploads
  WHERE user_id = NEW.user_id
    AND created_at >= (now() AT TIME ZONE 'UTC') - interval '7 days';

  IF week_count >= 20 THEN
    RAISE EXCEPTION 'profile_document_limit: max_uploads_per_7d (20)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_document_upload_limits ON public.profile_document_uploads;
CREATE TRIGGER trg_profile_document_upload_limits
  BEFORE INSERT ON public.profile_document_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_document_upload_limits();
