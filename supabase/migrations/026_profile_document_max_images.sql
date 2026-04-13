-- Raise per-record row limit from 5 to 6 (image-only batches); document files remain client-limited to 1 per batch.
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

  -- Max 6 files per context (record_id) — used for image batches; PDF/Word batches use 1 on the client
  SELECT COUNT(*) INTO same_record_count
  FROM public.profile_document_uploads
  WHERE user_id = NEW.user_id
    AND record_id = NEW.record_id;

  IF same_record_count >= 6 THEN
    RAISE EXCEPTION 'profile_document_limit: max_images_per_context (6)';
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

  -- Max 20 uploads in rolling 7 days (UTC-based instant)
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
