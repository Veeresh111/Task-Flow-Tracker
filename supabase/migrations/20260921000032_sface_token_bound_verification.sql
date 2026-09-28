-- ============================================================================
-- Migration: 20260921000032_sface_token_bound_verification.sql
-- Purpose (Session 6, PHASE 5/8 — SFace server authority):
--   1. verify_candidate_biometric_face took a CLIENT-SUPPLIED candidate_id
--      from anon callers: a biometric presence oracle ("is this face
--      candidate X?"). Replace with a token-bound variant that derives the
--      candidate identity from the raw assessment token (same authority as
--      enrollment).
--   2. Metric upgrade: the exam client now produces SFace 128-d embeddings
--      (browser ONNX inference, Apache-2.0 opencv_zoo model). Matching must
--      be FR_COSINE with the documented 0.363 threshold (opencv_zoo
--      benchmark) instead of Euclidean/0.65 (face-api.js era).
--   3. The old client-id variant loses anon/authenticated EXECUTE.
--   DECISION AUTHORITY: similarity is computed and decided HERE, from the
--   enrolled-first server descriptor. The client's own similarity guess is
--   never trusted. verified=false is returned, never an exception, so the
--   browser cannot distinguish "not enrolled" from "mismatch" beyond the
--   explicit enrolled flag.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_candidate_biometric_face_token(
  p_raw_token TEXT,
  p_input_descriptor JSONB,
  p_threshold NUMERIC DEFAULT 0.363
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.assessment_tokens;
  v_enrolled_desc JSONB;
  v_input_len INT;
  v_enrolled_len INT;
  v_dot NUMERIC := 0;
  v_norm_in NUMERIC := 0;
  v_norm_en NUMERIC := 0;
  v_i INT;
  v_cosine NUMERIC;
BEGIN
  IF p_raw_token IS NULL OR length(p_raw_token) < 16 OR length(p_raw_token) > 200 THEN
    RETURN jsonb_build_object('enrolled', false, 'verified', false, 'reason', 'TOKEN_INVALID');
  END IF;

  SELECT * INTO v_token
  FROM public.assessment_tokens
  WHERE token_hash = encode(extensions.digest(p_raw_token, 'sha256'), 'hex')
  LIMIT 1;
  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('enrolled', false, 'verified', false, 'reason', 'TOKEN_INVALID');
  END IF;
  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    RETURN jsonb_build_object('enrolled', false, 'verified', false, 'reason', 'TOKEN_EXPIRED');
  END IF;
  IF v_token.candidate_id IS NULL THEN
    RETURN jsonb_build_object('enrolled', false, 'verified', false, 'reason', 'TOKEN_UNBOUND');
  END IF;

  -- Server-owned enrolled descriptor (canonical column, first-wins).
  SELECT descriptor INTO v_enrolled_desc
  FROM public.candidate_biometrics
  WHERE candidate_id = v_token.candidate_id;

  IF v_enrolled_desc IS NULL THEN
    RETURN jsonb_build_object('enrolled', false, 'verified', false, 'reason', 'NOT_ENROLLED');
  END IF;

  IF p_input_descriptor IS NULL OR jsonb_typeof(p_input_descriptor) != 'array' THEN
    RETURN jsonb_build_object('enrolled', true, 'verified', false, 'reason', 'DESCRIPTOR_INVALID');
  END IF;
  v_input_len := jsonb_array_length(p_input_descriptor);
  v_enrolled_len := jsonb_array_length(v_enrolled_desc);
  IF v_input_len = 0 OR v_enrolled_len = 0 OR v_input_len != v_enrolled_len THEN
    RETURN jsonb_build_object('enrolled', true, 'verified', false, 'reason', 'DIMENSION_MISMATCH');
  END IF;

  -- FR_COSINE: cosine similarity between the stored and presented embeddings.
  FOR v_i IN 0..(v_enrolled_len - 1) LOOP
    v_dot := v_dot
      + (v_enrolled_desc->>v_i)::NUMERIC * (p_input_descriptor->>v_i)::NUMERIC;
    v_norm_en := v_norm_en + (v_enrolled_desc->>v_i)::NUMERIC ^ 2;
    v_norm_in := v_norm_in + (p_input_descriptor->>v_i)::NUMERIC ^ 2;
  END LOOP;
  IF v_norm_en = 0 OR v_norm_in = 0 THEN
    RETURN jsonb_build_object('enrolled', true, 'verified', false, 'reason', 'DEGENERATE_VECTOR');
  END IF;
  v_cosine := v_dot / (sqrt(v_norm_en) * sqrt(v_norm_in));

  RETURN jsonb_build_object(
    'enrolled', true,
    'verified', (v_cosine >= p_threshold),
    'similarity', ROUND(v_cosine, 4),
    'threshold', p_threshold
  );
END;
$function$;

-- Anonymous exam client verifies through its token; authenticated pages keep
-- the JWT-bound flow. Legacy client-id variant is no longer browser-callable.
GRANT EXECUTE ON FUNCTION public.verify_candidate_biometric_face_token(text, jsonb, numeric) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_candidate_biometric_face(uuid, jsonb, numeric) FROM anon, authenticated;

COMMIT;
