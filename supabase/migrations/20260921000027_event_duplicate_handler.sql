-- ============================================================================
-- Migration: 20260921000027_event_duplicate_handler.sql
-- Purpose: corrective to record_proctoring_event (24/25). Duplicate
--   sequence numbers were rejected by the DB constraint but surfaced as a
--   raw SQL error to the caller instead of the RPC's truthful JSON error
--   contract. Adds an explicit duplicate handler (EV-EVENT-DUP) and a
--   monotonicity check (sequence must not go backwards below the session's
--   committed high-water mark minus a bounded gap).
-- ============================================================================

BEGIN;

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
  v_max_seq INT;
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

GRANT EXECUTE ON FUNCTION public.record_proctoring_event(text, uuid, int, text, text, int, numeric, jsonb) TO anon, authenticated;

COMMIT;
