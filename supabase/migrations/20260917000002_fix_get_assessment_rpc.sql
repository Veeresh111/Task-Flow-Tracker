-- Migration: 20260917000002_fix_get_assessment_rpc.sql
-- Fix get_assessment_by_token RPC field reference

CREATE OR REPLACE FUNCTION public.get_assessment_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_assessment RECORD;
  v_sanitized_questions JSONB := '[]'::jsonb;
  q JSONB;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Missing or empty token.');
  END IF;

  -- 1. Find token row
  SELECT * INTO v_token
  FROM public.assessment_tokens
  WHERE token = p_token
    AND status = 'Active'
    AND used = false;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid, consumed, or non-existent assessment token.');
  END IF;

  -- Check expiration
  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('valid', false, 'error', 'Assessment token has expired.');
  END IF;

  -- 2. Fetch assessment blueprint
  SELECT * INTO v_assessment
  FROM public.assessments
  WHERE id = v_token.assessment_id;

  IF v_assessment.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Associated assessment blueprint does not exist.');
  END IF;

  -- 3. Sanitize questions: strip correctAnswer, explanation, and grading keys
  IF v_assessment.questions IS NOT NULL AND jsonb_typeof(v_assessment.questions) = 'array' THEN
    FOR q IN SELECT * FROM jsonb_array_elements(v_assessment.questions) LOOP
      v_sanitized_questions := v_sanitized_questions || jsonb_build_object(
        'id', COALESCE(q->>'id', gen_random_uuid()::text),
        'question', COALESCE(q->>'question', ''),
        'options', COALESCE(q->'options', '[]'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'token_id', v_token.id,
    'candidate_id', v_token.candidate_id,
    'application_id', v_token.application_id,
    'assessment_id', v_assessment.id,
    'title', v_assessment.title,
    'duration_minutes', COALESCE(v_assessment.duration_minutes, 30),
    'passing_score', COALESCE(v_assessment.passing_score, 70),
    'max_violations', 5,
    'expires_at', v_token.expires_at,
    'questions', v_sanitized_questions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assessment_by_token(text) TO anon, authenticated, service_role;
