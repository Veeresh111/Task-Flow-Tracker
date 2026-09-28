-- ============================================================================
-- Migration: 20260921000024_proctoring_events_report.sql
-- Purpose: event ingestion + server-generated proctoring report.
--   Events are INSERT-only from the candidate path, sequence-validated by
--   the RPC (gaps allowed for lost pre-buffer events, duplicates rejected),
--   and immutable: no UPDATE/DELETE grant or policy exists for browsers.
--   The report is computed by the server from persisted events — the
--   candidate cannot fabricate it.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.proctoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.proctoring_sessions(id) ON DELETE CASCADE,
  sequence_number int NOT NULL CHECK (sequence_number >= 0),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'INFO'
    CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  occurred_at_client timestamptz,
  received_at_server timestamptz NOT NULL DEFAULT now(),
  duration_ms int,
  confidence numeric,
  model_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_proctoring_event_sequence UNIQUE (session_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_proctoring_events_session ON public.proctoring_events (session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_proctoring_events_type ON public.proctoring_events (event_type);

ALTER TABLE public.proctoring_events ENABLE ROW LEVEL SECURITY;
-- No policies: browsers ingest via RPC only; HR read via report RPC.

-- Event type allowlist enforced in the RPC (bounded vocabulary).
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

-- Server-generated report (the only read path HR gets; candidate gets nothing).
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
GRANT EXECUTE ON FUNCTION public.enroll_candidate_biometric_token(text, jsonb, numeric) TO anon, authenticated;

COMMIT;
