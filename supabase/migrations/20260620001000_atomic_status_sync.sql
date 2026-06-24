-- ============================================================
-- ATOMIC STATUS SYNCHRONIZATION
-- All 3 tracking tables (job_applications, candidate_applications,
-- candidates.stage) are updated in a single atomic transaction.
-- ============================================================

-- Update job_application + candidate_applications + candidates.stage atomically
CREATE OR REPLACE FUNCTION public.sync_application_status(
  p_candidate_id UUID,
  p_form_id UUID,
  p_new_status TEXT,
  p_interview_status TEXT DEFAULT NULL,
  p_interview_score DECIMAL DEFAULT NULL,
  p_ai_verdict TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Update job_applications (authoritative source)
  UPDATE public.job_applications
  SET
    status = COALESCE(p_new_status, status),
    ai_verdict = COALESCE(p_ai_verdict, ai_verdict),
    updated_at = now()
  WHERE candidate_id = p_candidate_id
    AND (form_id = p_form_id OR job_form_id = p_form_id);

  -- 2. Update candidate_applications (tracking mirror)
  UPDATE public.candidate_applications
  SET
    status = COALESCE(p_new_status, status),
    interview_status = COALESCE(p_interview_status, interview_status),
    interview_score = COALESCE(p_interview_score, interview_score),
    updated_at = now()
  WHERE candidate_id = p_candidate_id
    AND job_form_id = p_form_id;

  -- 3. Update candidates.stage (master pipeline stage)
  UPDATE public.candidates
  SET
    stage = COALESCE(p_new_status, stage),
    updated_at = now()
  WHERE id = p_candidate_id;

  -- If no rows were updated anywhere, raise a notice (not an error)
  IF NOT FOUND THEN
    RAISE NOTICE 'sync_application_status: no matching records for candidate_id=%, form_id=%', p_candidate_id, p_form_id;
  END IF;
END;
$$;

-- Same function but keyed by job_application.id for InterviewCenter use
CREATE OR REPLACE FUNCTION public.sync_application_status_by_app_id(
  p_application_id UUID,
  p_new_status TEXT,
  p_interview_status TEXT DEFAULT NULL,
  p_interview_score DECIMAL DEFAULT NULL,
  p_ai_verdict TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
  v_form_id UUID;
BEGIN
  SELECT candidate_id, COALESCE(form_id, job_form_id) INTO v_candidate_id, v_form_id
  FROM public.job_applications
  WHERE id = p_application_id;

  IF v_candidate_id IS NULL THEN
    RAISE NOTICE 'sync_application_status_by_app_id: application_id=% not found', p_application_id;
    RETURN;
  END IF;

  PERFORM public.sync_application_status(v_candidate_id, v_form_id, p_new_status, p_interview_status, p_interview_score, p_ai_verdict);
END;
$$;
