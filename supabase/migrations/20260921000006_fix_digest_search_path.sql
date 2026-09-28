-- ============================================================================
-- Migration: 20260921000006_fix_digest_search_path.sql
-- Purpose (P0 fix found by live probing):
--   The hashing RPCs call digest(...) unqualified but their search_path
--   excludes the extensions schema where pgcrypto lives, so every token
--   lookup failed at runtime with "function digest(text, unknown) does not
--   exist" — the entire assessment token path was broken in production.
--   Fix: qualify pgcrypto functions explicitly (digest, gen_random_bytes)
--   across all token/limit RPCs.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.find_assessment_token_by_value(p_token TEXT)
RETURNS public.assessment_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_row public.assessment_tokens;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_row FROM public.assessment_tokens
  WHERE token_hash = v_hash
  LIMIT 1;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.assessment_tokens
    WHERE token = trim(p_token)
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assessment_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.assessment_tokens;
  v_assessment public.assessments%ROWTYPE;
  v_sanitized JSONB := '[]'::jsonb;
  q JSONB;
  v_attempts INT := 0;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Missing or empty token.');
  END IF;

  IF NOT public.consume_rate_limit('assessment_token_lookup', encode(extensions.digest(lower(trim(p_token)), 'sha256'), 'hex'), 40, 300) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Too many attempts. Please wait before retrying (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid, consumed, or non-existent assessment token.');
  END IF;

  IF v_token.status != 'Active' OR v_token.used = true THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This assessment token has already been used or is no longer active.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('valid', false, 'error', 'Assessment token has expired.');
  END IF;

  SELECT * INTO v_assessment FROM public.assessments WHERE id = v_token.assessment_id;
  IF v_assessment.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Associated assessment blueprint does not exist.');
  END IF;

  SELECT count(*) INTO v_attempts FROM public.assessment_attempts
  WHERE assessment_id = v_token.assessment_id AND candidate_id = v_token.candidate_id;

  IF v_assessment.questions IS NOT NULL AND jsonb_typeof(v_assessment.questions) = 'array' THEN
    FOR q IN SELECT * FROM jsonb_array_elements(v_assessment.questions) LOOP
      v_sanitized := v_sanitized || jsonb_build_object(
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
    'max_attempts', COALESCE(v_assessment.max_attempts, 1),
    'attempts_used', v_attempts,
    'max_violations', 5,
    'expires_at', v_token.expires_at,
    'questions', v_sanitized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_assessment_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_by_token(TEXT) TO anon, authenticated, service_role;

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

  IF NOT public.consume_rate_limit('assessment_attempt_start', encode(extensions.digest(lower(trim(p_token)), 'sha256'), 'hex'), 20, 300) THEN
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

CREATE OR REPLACE FUNCTION public.autosave_assessment_answers(
  p_token TEXT,
  p_answers JSONB,
  p_revision INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.assessment_tokens;
  v_attempt_id UUID;
  v_max_revision INT;
  v_incoming_revision INT;
  v_saved_count INT := 0;
  q JSONB;
  v_qid TEXT;
  v_answer TEXT;
  v_existing_rev INT;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing assessment token.');
  END IF;

  IF NOT public.consume_rate_limit('assessment_autosave', encode(extensions.digest(lower(trim(p_token)), 'sha256'), 'hex'), 120, 300) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Autosave rate limit reached; continue working — submissions remain authoritative (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or consumed token.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('success', false, 'error', 'Cannot autosave: assessment deadline has expired (EV-EXAM-001).');
  END IF;

  SELECT id INTO v_attempt_id
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
  END IF;

  SELECT COALESCE(MAX(revision), 0) INTO v_max_revision
  FROM public.assessment_attempt_answers
  WHERE attempt_id = v_attempt_id;

  v_incoming_revision := COALESCE(p_revision, v_max_revision + 1);
  IF v_incoming_revision <= v_max_revision THEN
    RETURN jsonb_build_object(
      'success', false, 'stale_revision', true,
      'current_revision', v_max_revision,
      'error', 'Stale autosave revision rejected (EV-EXAM-002).'
    );
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_answers) = 'array' THEN p_answers ELSE '[]'::jsonb END
  ) LOOP
    v_qid := q->>'questionId';
    v_answer := q->>'answer';
    IF v_qid IS NULL OR v_answer IS NULL THEN CONTINUE; END IF;

    SELECT revision INTO v_existing_rev
    FROM public.assessment_attempt_answers
    WHERE attempt_id = v_attempt_id AND question_id = v_qid;

    IF v_existing_rev IS NULL THEN
      INSERT INTO public.assessment_attempt_answers (attempt_id, question_id, answer, revision)
      VALUES (v_attempt_id, v_qid, left(v_answer, 10000), v_incoming_revision);
      v_saved_count := v_saved_count + 1;
    ELSIF v_incoming_revision > v_existing_rev THEN
      UPDATE public.assessment_attempt_answers
      SET answer = left(v_answer, 10000), revision = v_incoming_revision, saved_at = now()
      WHERE attempt_id = v_attempt_id AND question_id = v_qid;
      v_saved_count := v_saved_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'saved_at', now(),
    'revision', v_incoming_revision,
    'saved_count', v_saved_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.autosave_assessment_answers(TEXT, JSONB, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autosave_assessment_answers(TEXT, JSONB, INT)
  TO anon, authenticated, service_role;

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

  IF NOT public.consume_rate_limit('proctoring_events', encode(extensions.digest(lower(trim(p_token)), 'sha256'), 'hex'), 240, 300) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Proctoring telemetry rate limit reached (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);
  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid assessment token.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assessment token expired; telemetry not accepted.');
  END IF;

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
    now(),
    v_severity,
    left(COALESCE(p_detail, ''), 1000)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.log_proctoring_event(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_proctoring_event(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- issue_public_assessment_token: gen_random_bytes qualification
CREATE OR REPLACE FUNCTION public.issue_public_assessment_token(
  p_form_id UUID,
  p_candidate_id UUID,
  p_application_id UUID,
  p_score NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assessment_id UUID;
  v_existing TEXT;
  v_raw TEXT;
  v_hash TEXT;
  v_valid BOOLEAN;
BEGIN
  IF p_form_id IS NULL OR p_candidate_id IS NULL OR p_application_id IS NULL THEN
    RAISE EXCEPTION 'Missing form/candidate/application reference (EV-EXAM-100)';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Invalid screening score (EV-EXAM-101)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.job_applications
    WHERE id = p_application_id AND candidate_id = p_candidate_id AND form_id = p_form_id
  ) INTO v_valid;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Application does not match candidate/form (EV-EXAM-102)';
  END IF;

  SELECT id INTO v_assessment_id
  FROM public.assessments
  WHERE job_form_id = p_form_id AND status = 'Active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_assessment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT token INTO v_existing
  FROM public.assessment_tokens
  WHERE candidate_id = p_candidate_id
    AND assessment_id = v_assessment_id
    AND status = 'Active' AND used = false
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_raw := encode(extensions.gen_random_bytes(16), 'hex');
  v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');

  INSERT INTO public.assessment_tokens (
    assessment_id, candidate_id, application_id, token, token_hash,
    status, used, expires_at
  ) VALUES (
    v_assessment_id, p_candidate_id, p_application_id,
    'H:' || v_hash, v_hash,
    'Active', false, now() + interval '48 hours'
  );

  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Assessment Assigned'
  WHERE id = p_application_id
    AND status IN ('Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted', 'Recruiter Screening');

  RETURN v_raw;
END;
$$;

-- issue_hr_assessment_token: same qualification
CREATE OR REPLACE FUNCTION public.issue_hr_assessment_token(
  p_application_id UUID,
  p_assessment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_actor_role TEXT;
  v_existing_id UUID;
  v_raw TEXT;
  v_hash TEXT;
  v_token_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();
  IF v_actor_role NOT IN ('admin', 'hr') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may issue assessment tokens (EV-AUTH-403).');
  END IF;

  IF p_application_id IS NULL OR p_assessment_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing application or assessment reference.');
  END IF;

  SELECT id, candidate_id, form_id, status INTO v_app
  FROM public.job_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE id = p_assessment_id AND job_form_id = v_app.form_id AND status = 'Active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assessment is not active for this requisition.');
  END IF;

  SELECT id INTO v_existing_id
  FROM public.assessment_tokens
  WHERE candidate_id = v_app.candidate_id
    AND assessment_id = p_assessment_id
    AND status = 'Active' AND used = false
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_assigned', true, 'token_id', v_existing_id);
  END IF;

  v_raw := encode(extensions.gen_random_bytes(16), 'hex');
  v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');

  INSERT INTO public.assessment_tokens (
    assessment_id, candidate_id, application_id, token, token_hash,
    status, used, expires_at
  ) VALUES (
    p_assessment_id, v_app.candidate_id, v_app.id, 'H:' || v_hash, v_hash,
    'Active', false, now() + interval '48 hours'
  ) RETURNING id INTO v_token_id;

  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Assessment Assigned'
  WHERE id = p_application_id
    AND status IN ('Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted', 'Recruiter Screening');

  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (
    v_app.candidate_id,
    'Assessment Assigned',
    'An assessment has been assigned to your application. Your unique access token has been generated — check your candidate notifications for the invitation.',
    false
  );

  RETURN jsonb_build_object('success', true, 'token_id', v_token_id, 'raw_token', v_raw);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_hr_assessment_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_hr_assessment_token(UUID, UUID) TO authenticated;

COMMIT;
