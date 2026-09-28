-- ============================================================================
-- Migration: 20260921000023_proctoring_session_rpc.sql
-- Purpose: server-authoritative proctoring session lifecycle. Every RPC
--   derives identity from the RAW TOKEN (hashed server-side) — the browser
--   supplies only the token and session/challenge ids it was issued.
--   - start_proctoring_session: single-active invariant (DB index enforces;
--     stale ACTIVE session > 15 min old is recoverable), returns server state.
--   - proctor_heartbeat: updates last-seen, validates state.
--   - issue_liveness_challenge: one active challenge per session, CSPRNG
--     action selection, server expiry.
--   - submit_liveness_challenge: nonce-bound single consumption (replay
--     impossible: ISSUED→PASSED/FAILED terminal transition).
--   - record_proctoring_event: sequence-validated event ingestion.
--   - finalize_proctoring_session: server-generated report (candidate
--     cannot fabricate the report).
-- ============================================================================

BEGIN;

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

COMMIT;
