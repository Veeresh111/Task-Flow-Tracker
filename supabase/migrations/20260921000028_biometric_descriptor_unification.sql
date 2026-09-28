-- ============================================================================
-- Migration: 20260921000028_biometric_descriptor_unification.sql
-- Purpose (Session 5, live-defect fixes):
--   F1. SPLIT-BRAIN COLUMN: candidate_biometrics has BOTH `descriptor`
--       (NOT NULL, canonical) and `face_descriptor` (nullable). ALL THREE
--       enrollment RPCs wrote ONLY face_descriptor -> every enrollment from
--       every path has always failed live with a not-null violation on
--       `descriptor` (0 enrollments ever existed). The verify fn read
--       COALESCE(face_descriptor, descriptor). Unify everything on the
--       canonical NOT NULL `descriptor`, backfill (no-op here: 0 rows),
--       then DROP the redundant face_descriptor column.
--   F2. record_proctoring_event terminal-state list omitted 'SUBMITTED':
--       events were accepted after submission. Add SUBMITTED to the
--       terminal set (correction to migration 27).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- F1a. Backfill: canonical descriptor from any face_descriptor-only rows.
--      (Live DB currently has 0 rows; kept for environment portability.)
-- ---------------------------------------------------------------------------
UPDATE public.candidate_biometrics
SET descriptor = face_descriptor
WHERE descriptor IS NULL AND face_descriptor IS NOT NULL;

-- Any rows that remain without a canonical descriptor are corrupt artifacts
-- of the old broken path; they can never verify. Remove them truthfully.
DELETE FROM public.candidate_biometrics WHERE descriptor IS NULL;

-- ---------------------------------------------------------------------------
-- F1b. Rewrite ALL enrollment paths onto the canonical column.
-- ---------------------------------------------------------------------------

-- 1. Token-bound anonymous exam path (identity from raw token).
CREATE OR REPLACE FUNCTION public.enroll_candidate_biometric_token(p_raw_token TEXT, p_descriptor JSONB, p_confidence NUMERIC)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_candidate_id UUID;
  v_existing UUID;
BEGIN
  -- Identity authority: the raw token. Never any client-supplied id.
  IF p_raw_token IS NULL OR length(p_raw_token) < 16 OR length(p_raw_token) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token missing or malformed (EV-TOKEN-400).');
  END IF;

  SELECT * INTO v_token
  FROM public.assessment_tokens
  WHERE token_hash = encode(extensions.digest(p_raw_token, 'sha256'), 'hex')
  LIMIT 1;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token (EV-TOKEN-404).');
  END IF;
  IF v_token.status NOT IN ('Active', 'InProgress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not active (EV-TOKEN-409).');
  END IF;
  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token expired (EV-TOKEN-410).');
  END IF;

  v_candidate_id := v_token.candidate_id;
  IF v_candidate_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not candidate-bound (EV-BIO-NOBIND).');
  END IF;

  IF p_descriptor IS NULL OR jsonb_typeof(p_descriptor) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Descriptor must be a numeric array.');
  END IF;
  IF jsonb_array_length(p_descriptor) < 64 OR jsonb_array_length(p_descriptor) > 512 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Descriptor dimensionality out of bounds.');
  END IF;

  -- Rate limit per candidate (same policy as authenticated path).
  IF NOT public.consume_rate_limit('biometric_enrollment', v_candidate_id::text, 10, 900) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enrollment rate limit reached (EV-RATE-429).');
  END IF;

  SELECT id INTO v_existing FROM public.candidate_biometrics WHERE candidate_id = v_candidate_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_enrolled', true, 'candidate_id', v_candidate_id);
  END IF;

  INSERT INTO public.candidate_biometrics (candidate_id, descriptor, confidence)
  VALUES (
    v_candidate_id,
    p_descriptor,
    GREATEST(0, LEAST(1, COALESCE(p_confidence, 0.9)))
  );

  RETURN jsonb_build_object('success', true, 'already_enrolled', false, 'candidate_id', v_candidate_id);
END;
$function$;

-- 2. Authenticated Identity-page path (identity from JWT).
CREATE OR REPLACE FUNCTION public.enroll_authenticated_biometric(p_descriptor JSONB, p_confidence NUMERIC)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID;
  v_candidate_id UUID;
  v_existing UUID;
  v_role TEXT;
BEGIN
  -- Identity derived from the authenticated JWT, never the client body.
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT LOWER(COALESCE(role, 'employee')) INTO v_role
  FROM public.profiles WHERE id = v_actor;
  IF v_role = 'archived' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offboarded identity cannot enroll (EV-AUTH-403).');
  END IF;

  -- Resolve candidate binding server-side. No email/username fallbacks.
  SELECT candidate_id INTO v_candidate_id
  FROM public.profiles
  WHERE id = v_actor AND candidate_id IS NOT NULL;

  IF v_candidate_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No candidate identity is bound to this account; biometric enrollment requires an active candidate record (EV-BIO-NOBIND).'
    );
  END IF;

  IF p_descriptor IS NULL OR jsonb_typeof(p_descriptor) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Descriptor must be a numeric array.');
  END IF;

  IF jsonb_array_length(p_descriptor) < 64 OR jsonb_array_length(p_descriptor) > 512 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Descriptor dimensionality out of bounds.');
  END IF;

  -- Brute-force/replay guard: same policy as the anonymous path.
  IF NOT public.consume_rate_limit('biometric_enrollment', v_candidate_id::text, 10, 900) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enrollment rate limit reached (EV-RATE-429).');
  END IF;

  SELECT id INTO v_existing FROM public.candidate_biometrics WHERE candidate_id = v_candidate_id;

  -- Idempotent: first descriptor wins; re-enrollment reported truthfully.
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_enrolled', true);
  END IF;

  INSERT INTO public.candidate_biometrics (candidate_id, descriptor, confidence)
  VALUES (
    v_candidate_id,
    p_descriptor,
    GREATEST(0, LEAST(1, COALESCE(p_confidence, 0.9)))
  );

  RETURN jsonb_build_object('success', true, 'already_enrolled', false);
END;
$function$;

-- 3. Legacy candidate-id variant: rewritten for column correctness.
--    (EXECUTE was already revoked from anon in migration 22; body fixed so
--    any remaining authorized grantee writes the canonical column too.)
CREATE OR REPLACE FUNCTION public.enroll_candidate_biometric(p_candidate_id UUID, p_descriptor JSONB, p_confidence NUMERIC)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Candidate must exist.
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

  INSERT INTO public.candidate_biometrics (candidate_id, descriptor, confidence)
  VALUES (
    p_candidate_id,
    p_descriptor,
    GREATEST(0, LEAST(1, COALESCE(p_confidence, 0.9)))
  );

  RETURN jsonb_build_object('success', true, 'already_enrolled', false);
END;
$function$;

-- 4. Verification path: read the canonical column only.
CREATE OR REPLACE FUNCTION public.verify_candidate_biometric_face(p_candidate_id UUID, p_input_descriptor JSONB, p_threshold NUMERIC DEFAULT 0.65)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enrolled_desc JSONB;
  v_enrolled_len INT;
  v_input_len INT;
  v_sum NUMERIC := 0;
  v_diff NUMERIC;
  v_dist NUMERIC;
  i INT;
BEGIN
  -- 1. Fetch enrolled biometric descriptor from secure server table
  SELECT descriptor INTO v_enrolled_desc
  FROM public.candidate_biometrics
  WHERE candidate_id = p_candidate_id;

  -- If not enrolled yet, return un-enrolled status
  IF v_enrolled_desc IS NULL THEN
    RETURN jsonb_build_object(
      'enrolled', false,
      'verified', false,
      'reason', 'Candidate has no enrolled biometric identity descriptor on file.'
    );
  END IF;

  v_enrolled_len := jsonb_array_length(v_enrolled_desc);
  v_input_len := jsonb_array_length(p_input_descriptor);

  IF v_enrolled_len = 0 OR v_input_len = 0 OR v_enrolled_len != v_input_len THEN
    RETURN jsonb_build_object(
      'enrolled', true,
      'verified', false,
      'reason', 'Biometric vector dimensionality mismatch or corrupt descriptor.'
    );
  END IF;

  -- 2. Calculate Euclidean Distance in database
  FOR i IN 0..(v_enrolled_len - 1) LOOP
    v_diff := (v_input_descriptor->>i)::NUMERIC - (v_enrolled_desc->>i)::NUMERIC;
    v_sum := v_sum + (v_diff * v_diff);
  END LOOP;

  v_dist := |/ v_sum; -- Square root

  RETURN jsonb_build_object(
    'enrolled', true,
    'verified', (v_dist <= p_threshold),
    'distance', ROUND(v_dist, 4),
    'threshold', p_threshold
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- F1c. Drop the redundant nullable column. Canonical NOT NULL `descriptor`
--      is now the single biometric representation on the server.
-- ---------------------------------------------------------------------------
ALTER TABLE public.candidate_biometrics DROP COLUMN IF EXISTS face_descriptor;

-- ---------------------------------------------------------------------------
-- F2. record_proctoring_event: SUBMITTED is terminal — close the gap left
--     by migration 27's terminal-state list.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_proctoring_event(
  p_raw_token TEXT, p_session_id UUID, p_sequence INT, p_event_type TEXT,
  p_severity TEXT DEFAULT 'INFO', p_duration_ms INT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT NULL, p_metadata JSONB DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_session public.proctoring_sessions;
  v_allowed TEXT[] := ARRAY[
    'PROCTOR_SESSION_STARTED','CAMERA_GRANTED','MIC_GRANTED',
    'FULLSCREEN_ENTERED','FULLSCREEN_EXITED','TAB_HIDDEN','TAB_VISIBLE',
    'WINDOW_BLUR','WINDOW_FOCUS','COPY_ATTEMPT','CUT_ATTEMPT','PASTE_ATTEMPT',
    'CONTEXT_MENU_ATTEMPT','SCREEN_SHARE_STARTED','SCREEN_SHARE_STOPPED',
    'CAMERA_INTERRUPTED','MIC_INTERRUPTED','NETWORK_OFFLINE','NETWORK_RESTORED',
    'FACE_DETECTED','FACE_MISSING','MULTIPLE_FACES','FACE_OUT_OF_FRAME',
    'FACE_OCCLUDED','FACE_LOW_QUALITY','IDENTITY_VERIFIED','IDENTITY_MISMATCH',
    'IDENTITY_RECHECK_REQUIRED','LIVENESS_STARTED','LIVENESS_PASSED',
    'LIVENESS_FAILED','LIVENESS_CHALLENGE_ISSUED','LIVENESS_CHALLENGE_PASSED',
    'LIVENESS_CHALLENGE_FAILED','SUSPICIOUS_BEHAVIOR','PROCTORING_WARNING',
    'PROCTORING_ESCALATION'
  ];
  v_sev TEXT;
BEGIN
  SELECT * INTO v_token FROM public.assessment_tokens
  WHERE token_hash = encode(extensions.digest(p_raw_token, 'sha256'), 'hex') LIMIT 1;
  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token (EV-TOKEN-404).');
  END IF;

  SELECT * INTO v_session FROM public.proctoring_sessions
  WHERE id = p_session_id AND token_id = v_token.id;
  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not bound to this token (EV-SESSION-403).');
  END IF;
  IF v_session.status IN ('TERMINATED','COMPLETED','FAILED','SUBMITTED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is terminal (EV-STATE-409).');
  END IF;

  IF NOT (p_event_type = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown event type (EV-EVENT-400).');
  END IF;

  -- Reject unbounded negative sequences (replay/DoS surface).
  IF p_sequence IS NULL OR p_sequence < 0 OR p_sequence > 10000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sequence number out of range (EV-EVENT-SEQ).');
  END IF;

  v_sev := CASE WHEN p_severity IN ('INFO','LOW','MEDIUM') THEN p_severity ELSE 'INFO' END;

  BEGIN
    INSERT INTO public.proctoring_events
      (session_id, sequence_number, event_type, severity, occurred_at_client,
       duration_ms, confidence, metadata)
    VALUES
      (v_session.id, p_sequence, p_event_type, v_sev, now(),
       p_duration_ms, p_confidence, COALESCE(p_metadata, '{}'::jsonb));
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Duplicate event sequence for this session (EV-EVENT-DUP).');
  END;

  RETURN jsonb_build_object('success', true, 'sequence', p_sequence);
END;
$function$;

-- Re-grant the corrected RPCs (CREATE OR REPLACE preserves grants, but the
-- explicit grant documents intent and survives grant-priming migrations).
GRANT EXECUTE ON FUNCTION public.enroll_candidate_biometric_token(text, jsonb, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_authenticated_biometric(jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_proctoring_event(text, uuid, int, text, text, int, numeric, jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_candidate_biometric(uuid, jsonb, numeric) FROM anon, authenticated;

COMMIT;
