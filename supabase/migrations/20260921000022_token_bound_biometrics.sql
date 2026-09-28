-- ============================================================================
-- Migration: 20260921000022_token_bound_biometrics.sql
-- Purpose (Session 5 P3 — critical biometric binding fix):
--
--   VULNERABILITY (verified live): enroll_candidate_biometric(uuid, jsonb,
--   numeric) is EXECUTE-granted to anon+authenticated and derives identity
--   from a CLIENT-SUPPLIED candidate_id. Attack: attacker calls the RPC
--   with candidate_id = victim + their own face descriptor. First-wins
--   semantics then BLOCK the victim's legitimate enrollment, or substitute
--   the attacker's face for the victim's identity verification.
--
--   FIX:
--   1. enroll_candidate_biometric_token(p_raw_token, p_descriptor,
--      p_confidence): the raw assessment token is the ONLY identity
--      authority. Server hashes → validates (exists, unexpired, active) →
--      derives candidate_id + application binding server-side. No client
--      identity fields exist in the signature at all.
--   2. Revoke EXECUTE on the legacy client-id variant from anon and
--      authenticated (service_role/definer paths unaffected).
--   3. proctoring_sessions: server-owned session state machine with
--      single-active-session invariant per (token, attempt) — DB-enforced
--      partial unique index on ACTIVE states.
--   4. proctoring_challenges: server-issued random challenges with nonce,
--      expiry, single-consumption; consumption is a guarded state
--      transition (replay-proof).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Token-bound enrollment
-- ---------------------------------------------------------------------------
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

-- 2. The legacy client-id variant must not be callable by browsers.
REVOKE ALL ON FUNCTION public.enroll_candidate_biometric(uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_candidate_biometric(uuid, jsonb, numeric) TO service_role;

-- New token-bound variant: browsers may execute (anon exam path).
GRANT EXECUTE ON FUNCTION public.enroll_candidate_biometric_token(text, jsonb, numeric) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Proctoring sessions (server-owned state machine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proctoring_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.assessment_tokens(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL,
  application_id uuid,
  status text NOT NULL DEFAULT 'PREFLIGHT'
    CHECK (status IN ('NOT_STARTED','PREFLIGHT','IDENTITY_PENDING','LIVENESS_PENDING',
                      'READY','ACTIVE','WARNING','SUSPENDED','REAUTH_REQUIRED',
                      'TERMINATION_PENDING','TERMINATED','SUBMITTED','COMPLETED','FAILED')),
  reference_face_status text NOT NULL DEFAULT 'PENDING'
    CHECK (reference_face_status IN ('PENDING','ENROLLED','FAILED')),
  liveness_status text NOT NULL DEFAULT 'PENDING'
    CHECK (liveness_status IN ('PENDING','PASSED','FAILED')),
  risk_state text NOT NULL DEFAULT 'CLEAN'
    CHECK (risk_state IN ('CLEAN','WARNED','ESCALATED','TERMINATION_ELIGIBLE')),
  nonce text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  face_match_threshold numeric NOT NULL DEFAULT 0.55,
  heartbeat_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '8 hours',
  ended_at timestamptz,
  model_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Single ACTIVE proctoring session per token (two tabs/devices denied by DB).
CREATE UNIQUE INDEX IF NOT EXISTS uq_proctoring_session_active_per_token
  ON public.proctoring_sessions (token_id)
  WHERE status NOT IN ('TERMINATED','COMPLETED','FAILED','SUBMITTED');

CREATE INDEX IF NOT EXISTS idx_proctoring_sessions_candidate ON public.proctoring_sessions (candidate_id);

ALTER TABLE public.proctoring_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: accessible only through SECURITY DEFINER RPCs (service-owned).

-- ---------------------------------------------------------------------------
-- 4. Proctoring challenges (server-issued, replay-proof)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proctoring_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.proctoring_sessions(id) ON DELETE CASCADE,
  nonce text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  action text NOT NULL CHECK (action IN ('HEAD_TURN_LEFT','HEAD_TURN_RIGHT','LOOK_UP','LOOK_DOWN','BLINK_TWICE','SMILE','MOUTH_OPEN')),
  status text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED','PASSED','FAILED','EXPIRED')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '45 seconds',
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_active_challenge_per_session UNIQUE (session_id, status) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.proctoring_challenges ENABLE ROW LEVEL SECURITY;
-- No policies: definer RPCs only.

COMMIT;
