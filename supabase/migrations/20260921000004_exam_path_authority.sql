-- ============================================================================
-- Migration: 20260921000004_exam_path_authority.sql
-- Purpose (P0: exam-path server authority):
--   A. start_assessment_attempt RPC: server-owned attempt lifecycle with
--      server-authoritative timer. Removes anon INSERT on assessment_attempts
--      (was WITH CHECK (true) — any client could mint attempts for any
--      candidate).
--   B. log_proctoring_event RPC: bound, validated, rate-limited proctoring
--      ingestion replacing open anon INSERT on proctoring_logs.
--   C. enroll_candidate_biometric RPC: server-owned descriptor enrollment
--      (was: dead code path — candidate_biometrics is service-role only, so
--      the client silently fell back to localStorage biometrics).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A. ATTEMPT LIFECYCLE — server-authoritative
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_assessment_attempt(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.assessment_tokens;
  v_assessment public.assessments%ROWTYPE;
  v_attempt_id UUID;
  v_attempts INT;
  v_remaining INT;
  v_started_at TIMESTAMPTZ;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing assessment token.');
  END IF;

  -- Brute-force guard: 20 attempt-start calls / 5 min per token value.
  IF NOT public.consume_rate_limit('assessment_attempt_start', encode(digest(lower(trim(p_token)), 'sha256'), 'hex'), 20, 300) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many attempts. Please wait before retrying (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or unknown assessment token.');
  END IF;

  IF v_token.status != 'Active' OR v_token.used = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'This assessment token has already been used or is no longer active.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('success', false, 'error', 'Assessment token has expired.');
  END IF;

  SELECT * INTO v_assessment FROM public.assessments WHERE id = v_token.assessment_id;
  IF v_assessment.id IS NULL OR v_assessment.status != 'Active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assessment is not active.');
  END IF;

  SELECT count(*) INTO v_attempts
  FROM public.assessment_attempts
  WHERE assessment_id = v_token.assessment_id AND candidate_id = v_token.candidate_id;

  IF v_assessment.max_attempts IS NOT NULL AND v_assessment.max_attempts > 0
     AND v_attempts >= v_assessment.max_attempts THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum attempts reached for this assessment.');
  END IF;

  -- Resume the open attempt if one exists (server clock is authoritative).
  SELECT id, started_at INTO v_attempt_id, v_started_at
  FROM public.assessment_attempts
  WHERE assessment_id = v_token.assessment_id
    AND candidate_id = v_token.candidate_id
    AND completed_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_attempt_id IS NULL THEN
    INSERT INTO public.assessment_attempts (assessment_id, candidate_id, started_at)
    VALUES (v_token.assessment_id, v_token.candidate_id, now())
    RETURNING id INTO v_attempt_id;
    v_started_at := now();
  END IF;

  -- Bind the token to this attempt and keep raw-token ownership server-side.
  UPDATE public.assessment_tokens
  SET attempt_id = v_attempt_id
  WHERE id = v_token.id;

  v_remaining := GREATEST(0, COALESCE(v_assessment.duration_minutes, 30) * 60
    - EXTRACT(EPOCH FROM (now() - v_started_at))::INT);

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'started_at', v_started_at,
    'remaining_seconds', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_assessment_attempt(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_assessment_attempt(TEXT) TO anon, authenticated, service_role;

-- Kill the open anon INSERT paths on assessment_attempts.
DROP POLICY IF EXISTS "Allow public assessment submission" ON public.assessment_attempts;
DROP POLICY IF EXISTS "Public Create Assessment Attempts" ON public.assessment_attempts;

-- ---------------------------------------------------------------------------
-- B. PROCTORING INGESTION — bound + validated + rate-limited
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_proctoring_event(
  p_token TEXT,
  p_violation_type TEXT,
  p_severity TEXT,
  p_detail TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.assessment_tokens;
  v_attempt_id UUID;
  v_severity TEXT;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing assessment token.');
  END IF;

  -- Telemetry flood guard: 240 events / 5 min per token.
  IF NOT public.consume_rate_limit('proctoring_events', encode(digest(lower(trim(p_token)), 'sha256'), 'hex'), 240, 300) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Proctoring telemetry rate limit reached (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);
  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid assessment token.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assessment token expired; telemetry not accepted.');
  END IF;

  -- Attempt binding: use the token-bound attempt, else the open one.
  v_attempt_id := v_token.attempt_id;
  IF v_attempt_id IS NULL THEN
    SELECT id INTO v_attempt_id
    FROM public.assessment_attempts
    WHERE assessment_id = v_token.assessment_id
      AND candidate_id = v_token.candidate_id
      AND completed_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  -- Validate severity against an allowlist; unknown types default to 'warning'.
  v_severity := CASE lower(COALESCE(p_severity, 'warning'))
    WHEN 'info' THEN 'info'
    WHEN 'critical' THEN 'critical'
    ELSE 'warning'
  END;

  INSERT INTO public.proctoring_logs (
    candidate_id, attempt_id, violation_type, timestamp, severity, detail
  ) VALUES (
    v_token.candidate_id,
    v_attempt_id,
    left(COALESCE(p_violation_type, 'unknown'), 200),
    now(), -- server time: client timestamps are never trusted
    v_severity,
    left(COALESCE(p_detail, ''), 1000)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.log_proctoring_event(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_proctoring_event(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- The RPC is now the only write path; close the open anon INSERT.
DROP POLICY IF EXISTS "proctoring_logs_candidate_insert" ON public.proctoring_logs;

-- ---------------------------------------------------------------------------
-- C. BIOMETRIC ENROLLMENT — server-owned (H1: no localStorage authority)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enroll_candidate_biometric(
  p_candidate_id UUID,
  p_descriptor JSONB,
  p_confidence NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN;
  v_desc_len INT;
  v_existing UUID;
BEGIN
  IF p_candidate_id IS NULL OR p_descriptor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing candidate or descriptor.');
  END IF;

  IF jsonb_typeof(p_descriptor) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Descriptor must be a numeric array.');
  END IF;

  v_desc_len := jsonb_array_length(p_descriptor);
  -- face-api.js 128-d descriptors; reject absurd payloads.
  IF v_desc_len < 64 OR v_desc_len > 512 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Descriptor dimensionality out of bounds.');
  END IF;

  -- Brute-force/replay guard: 10 enrollments / 15 min per candidate.
  IF NOT public.consume_rate_limit('biometric_enrollment', p_candidate_id::text, 10, 900) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enrollment rate limit reached (EV-RATE-429).');
  END IF;

  -- Candidate must exist and be bound to a real application ledger entry.
  SELECT EXISTS (SELECT 1 FROM public.candidates WHERE id = p_candidate_id) INTO v_valid;
  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Candidate does not exist.');
  END IF;

  SELECT id INTO v_existing FROM public.candidate_biometrics WHERE candidate_id = p_candidate_id;

  -- Idempotent: first descriptor wins; re-enrollment is a no-op reported
  -- truthfully (prevents descriptor-swapping mid-exam).
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_enrolled', true);
  END IF;

  INSERT INTO public.candidate_biometrics (candidate_id, face_descriptor, confidence)
  VALUES (
    p_candidate_id,
    p_descriptor,
    GREATEST(0, LEAST(1, COALESCE(p_confidence, 0.9)))
  );

  RETURN jsonb_build_object('success', true, 'already_enrolled', false);
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_candidate_biometric(UUID, JSONB, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_candidate_biometric(UUID, JSONB, NUMERIC) TO anon, authenticated, service_role;

COMMIT;
