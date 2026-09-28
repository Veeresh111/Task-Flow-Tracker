-- ============================================================================
-- Migration: 20260921000003_public_screening_storage_privacy.sql
--   A. record_public_screening: the ONLY path an anonymous applicant's ATS
--      result can take into the database (server-side provenance + threshold
--      transition). Anonymous clients cannot UPDATE job_applications.
--   B. Storage privacy: resumes / bgc_docs / payslips become private buckets.
--      (avatars intentionally stays public — profile pictures.)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.record_public_screening(
  p_application_id UUID,
  p_score NUMERIC,
  p_verdict TEXT,
  p_evaluation_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application RECORD;
  v_shortlisted BOOLEAN;
BEGIN
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'Missing application reference (EV-ATS-100)';
  END IF;

  SELECT * INTO v_application FROM public.job_applications WHERE id = p_application_id;
  IF v_application.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
  END IF;

  -- Only record screening once per application (idempotent re-run overwrites
  -- nothing: first authoritative evaluation wins; HR can re-scan manually).
  IF v_application.match_score IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_scored', true, 'score', v_application.match_score);
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Screening score out of bounds (EV-ATS-101)';
  END IF;

  v_shortlisted := p_score >= 75;

  PERFORM set_config('app.authoritative_transition', 'true', true);

  UPDATE public.job_applications
  SET match_score = round(p_score, 0),
      ai_verdict = CASE
        WHEN p_evaluation_type = 'RULE_BASED' THEN '[Rule-Based Screening] ' || COALESCE(left(p_verdict, 990), '')
        ELSE left(COALESCE(p_verdict, ''), 1000)
      END,
      status = CASE
        WHEN v_shortlisted AND v_application.status IN ('Applied', 'Screening', 'Under Review') THEN 'Shortlisted'
        ELSE v_application.status
      END
  WHERE id = p_application_id;

  RETURN jsonb_build_object('success', true, 'shortlisted', v_shortlisted);
END;
$$;

REVOKE ALL ON FUNCTION public.record_public_screening(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_public_screening(UUID, NUMERIC, TEXT, TEXT)
  TO anon, authenticated;

-- B. Storage privacy (P0: resumes, background-check docs and payslips were PUBLIC)
UPDATE storage.buckets SET public = false WHERE id IN ('resumes', 'bgc_docs', 'payslips');

COMMIT;
