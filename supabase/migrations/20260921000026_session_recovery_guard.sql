-- ============================================================================
-- Migration: 20260921000026_session_recovery_guard.sql
-- Purpose: corrective to start_proctoring_session (migration 23/25).
--   BUG (found by adversarial probe C): a fresh session has heartbeat_at IS
--   NULL; the stale-recovery condition `heartbeat_at < now() - 15min`
--   evaluates NULL → not matched by IF... so the code fell through to the
--   "recovered" branch — a second concurrent start silently resumed the
--   session instead of being denied (single-active invariant leak).
--   FIX: staleness uses COALESCE(heartbeat_at, created_at) so a fresh
--   session denies a second start (EV-SESSION-409) and only genuinely
--   stale (>15 min silent) sessions recover.
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

  SELECT * INTO v_session FROM public.proctoring_sessions
  WHERE token_id = v_token.id
    AND status NOT IN ('TERMINATED','COMPLETED','FAILED','SUBMITTED')
  ORDER BY created_at DESC LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    IF COALESCE(v_session.heartbeat_at, v_session.created_at) < now() - interval '15 minutes' THEN
      -- genuinely stale: controlled recovery of the same session row
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

GRANT EXECUTE ON FUNCTION public.start_proctoring_session(text, jsonb) TO anon, authenticated;

COMMIT;
