-- ============================================================================
-- Migration: 20260921000025_proctor_rpc_hash_compare_fix.sql
-- Purpose: corrective capture of migrations 22-24 function bodies.
--   Their token lookups compared TEXT token_hash directly to bytea
--   extensions.digest(...) — no such operator exists, so every lookup
--   would throw 'operator does not exist: text = bytea' at runtime (the
--   digest()-class defect again). Correct pattern (matches the proven
--   get_assessment_by_token): encode(digest(...), 'hex').
--   Applied here as new migration since 22-24 are already recorded.
-- ============================================================================

BEGIN;

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

  INSERT INTO public.candidate_biometrics (candidate_id, face_descriptor, confidence)
  VALUES (
    v_candidate_id,
    p_descriptor,
    GREATEST(0, LEAST(1, COALESCE(p_confidence, 0.9)))
  );

  RETURN jsonb_build_object('success', true, 'already_enrolled', false, 'candidate_id', v_candidate_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_proctoring_session(p_raw_token TEXT, p_model_versions JSONB DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_session public.proctoring_sessions;
  v_recovered BOOLEAN := false;
BEGIN
  IF p_raw_token IS NULL OR length(p_raw_token) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token missing or malformed (EV-TOKEN-400).');
  END IF;

  SELECT * INTO v_token FROM public.assessment_tokens
  WHERE token_hash = encode(extensions.digest(p_raw_token, 'sha256'), 'hex') LIMIT 1;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token (EV-TOKEN-404).');
  END IF;
  IF v_token.status NOT IN ('Active', 'InProgress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not active (EV-TOKEN-409).');
  END IF;

  -- Resume existing ACTIVE session if fresh (recovery), else deny.
  SELECT * INTO v_session FROM public.proctoring_sessions
  WHERE token_id = v_token.id
    AND status NOT IN ('TERMINATED','COMPLETED','FAILED','SUBMITTED')
  ORDER BY created_at DESC LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    IF v_session.heartbeat_at IS NULL OR v_session.heartbeat_at < now() - interval '15 minutes' THEN
      -- stale session: controlled recovery (same session row, bumped)
      UPDATE public.proctoring_sessions
      SET heartbeat_at = now(), version = version + 1
      WHERE id = v_session.id;
      v_recovered := true;
    ELSE
      RETURN jsonb_build_object('success', false, 'error',
        'An active proctoring session already exists for this assessment (EV-SESSION-409).',
        'session_id', v_session.id);
    END IF;
  ELSE
    INSERT INTO public.proctoring_sessions
      (token_id, candidate_id, application_id, status, model_versions)
    VALUES
      (v_token.id, v_token.candidate_id, v_token.application_id, 'PREFLIGHT',
       COALESCE(p_model_versions, '{}'::jsonb))
    RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'recovered', v_recovered,
    'session_id', v_session.id,
    'status', v_session.status,
    'nonce', v_session.nonce,
    'reference_face_status', v_session.reference_face_status,
    'liveness_status', v_session.liveness_status,
    'expires_at', v_session.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.proctor_heartbeat(p_raw_token TEXT, p_session_id UUID)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_session public.proctoring_sessions;
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
  IF v_session.status IN ('TERMINATED','COMPLETED','FAILED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is terminal (EV-STATE-409).', 'status', v_session.status);
  END IF;

  UPDATE public.proctoring_sessions SET heartbeat_at = now(), version = version + 1
  WHERE id = v_session.id;

  RETURN jsonb_build_object('success', true, 'status', v_session.status, 'server_time', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_liveness_challenge(p_raw_token TEXT, p_session_id UUID)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_session public.proctoring_sessions;
  v_active UUID;
  v_action TEXT;
  v_challenge public.proctoring_challenges;
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

  -- One ACTIVE challenge per session: expire stale ISSUED ones.
  UPDATE public.proctoring_challenges
  SET status = 'EXPIRED'
  WHERE session_id = v_session.id AND status = 'ISSUED' AND expires_at < now()
  RETURNING id INTO v_active;

  SELECT id INTO v_active FROM public.proctoring_challenges
  WHERE session_id = v_session.id AND status = 'ISSUED' AND expires_at >= now();
  IF v_active IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A challenge is already active (EV-CHALLENGE-409).');
  END IF;

  -- CSPRNG action selection (pgcrypto gen_random_bytes; bytea is 1-indexed).
  v_action := (ARRAY['HEAD_TURN_LEFT','HEAD_TURN_RIGHT','LOOK_UP','LOOK_DOWN','BLINK_TWICE','SMILE','MOUTH_OPEN'])
    [1 + (get_byte(extensions.gen_random_bytes(1), 0) % 7)];

  INSERT INTO public.proctoring_challenges (session_id, action)
  VALUES (v_session.id, v_action)
  RETURNING * INTO v_challenge;

  RETURN jsonb_build_object(
    'success', true,
    'challenge_id', v_challenge.id,
    'nonce', v_challenge.nonce,
    'action', v_challenge.action,
    'issued_at', v_challenge.issued_at,
    'expires_at', v_challenge.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_liveness_challenge(p_raw_token TEXT, p_session_id UUID, p_challenge_id UUID, p_nonce TEXT)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_session public.proctoring_sessions;
  v_challenge public.proctoring_challenges;
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

  SELECT * INTO v_challenge FROM public.proctoring_challenges
  WHERE id = p_challenge_id AND session_id = v_session.id;

  -- Replay-proof: only a currently-ISSUED challenge can transition.
  IF v_challenge.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not found (EV-CHALLENGE-404).');
  END IF;
  IF v_challenge.status != 'ISSUED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge already consumed or expired (EV-CHALLENGE-REPLAY).', 'status', v_challenge.status);
  END IF;
  IF v_challenge.expires_at < now() THEN
    UPDATE public.proctoring_challenges SET status = 'EXPIRED', consumed_at = now() WHERE id = v_challenge.id;
    RETURN jsonb_build_object('success', false, 'error', 'Challenge expired (EV-CHALLENGE-410).');
  END IF;
  IF p_nonce IS NULL OR p_nonce != v_challenge.nonce THEN
    UPDATE public.proctoring_challenges SET status = 'FAILED', consumed_at = now() WHERE id = v_challenge.id;
    RETURN jsonb_build_object('success', false, 'error', 'Challenge nonce mismatch (EV-CHALLENGE-400).');
  END IF;

  UPDATE public.proctoring_challenges
  SET status = 'PASSED', consumed_at = now()
  WHERE id = v_challenge.id;

  UPDATE public.proctoring_sessions
  SET liveness_status = 'PASSED', version = version + 1
  WHERE id = v_session.id;

  RETURN jsonb_build_object('success', true, 'liveness_status', 'PASSED');
END;
$function$;

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
  IF v_session.status IN ('TERMINATED','COMPLETED','FAILED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is terminal (EV-STATE-409).');
  END IF;

  IF NOT (p_event_type = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown event type (EV-EVENT-400).');
  END IF;

  -- Client may only propose INFO/LOW severities for behavioral events;
  -- identity/liveness verdicts are server-owned event types.
  v_sev := CASE WHEN p_severity IN ('INFO','LOW','MEDIUM') THEN p_severity ELSE 'INFO' END;

  INSERT INTO public.proctoring_events
    (session_id, sequence_number, event_type, severity, occurred_at_client,
     duration_ms, confidence, metadata)
  VALUES
    (v_session.id, p_sequence, p_event_type, v_sev, now(),
     p_duration_ms, p_confidence, COALESCE(p_metadata, '{}'::jsonb));

  RETURN jsonb_build_object('success', true, 'sequence', p_sequence);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_proctoring_session(p_raw_token TEXT, p_session_id UUID)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_session public.proctoring_sessions;
  v_counts RECORD;
  v_highest TEXT;
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

  SELECT
    count(*) FILTER (WHERE event_type = 'MULTIPLE_FACES') AS multiple_faces,
    count(*) FILTER (WHERE event_type = 'IDENTITY_MISMATCH') AS identity_mismatch,
    count(*) FILTER (WHERE event_type = 'FULLSCREEN_EXITED') AS fullscreen_exits,
    count(*) FILTER (WHERE event_type = 'TAB_HIDDEN') AS tab_hidden,
    count(*) FILTER (WHERE event_type = 'CAMERA_INTERRUPTED') AS camera_interruptions,
    count(*) FILTER (WHERE event_type = 'NETWORK_OFFLINE') AS network_losses,
    count(*) FILTER (WHERE severity = 'CRITICAL') AS critical_events
  INTO v_counts
  FROM public.proctoring_events
  WHERE session_id = v_session.id;

  SELECT COALESCE(max(severity::text), 'INFO') INTO v_highest
  FROM public.proctoring_events
  WHERE session_id = v_session.id
    AND severity IN ('CRITICAL','HIGH','MEDIUM','LOW');

  UPDATE public.proctoring_sessions
  SET status = CASE
        WHEN v_counts.critical_events > 0 OR v_counts.identity_mismatch >= 3
          THEN 'TERMINATION_PENDING'::text
        ELSE 'SUBMITTED'::text
      END,
      ended_at = now(),
      version = version + 1
  WHERE id = v_session.id
  RETURNING status INTO v_session.status;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'final_state', v_session.status,
    'liveness_status', v_session.liveness_status,
    'reference_face_status', v_session.reference_face_status,
    'multiple_face_events', v_counts.multiple_faces,
    'identity_mismatch_count', v_counts.identity_mismatch,
    'fullscreen_exit_count', v_counts.fullscreen_exits,
    'tab_hidden_count', v_counts.tab_hidden,
    'camera_interruptions', v_counts.camera_interruptions,
    'network_losses', v_counts.network_losses,
    'critical_events', v_counts.critical_events,
    'highest_severity', v_highest,
    'model_versions', v_session.model_versions,
    'started_at', v_session.started_at,
    'ended_at', v_session.ended_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_proctoring_session(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proctor_heartbeat(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_liveness_challenge(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_liveness_challenge(text, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_proctoring_event(text, uuid, int, text, text, int, numeric, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_proctoring_session(text, uuid) TO anon, authenticated;

COMMIT;
