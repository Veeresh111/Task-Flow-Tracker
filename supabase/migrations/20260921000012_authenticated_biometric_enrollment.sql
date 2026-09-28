-- ============================================================================
-- Migration: 20260921000012_authenticated_biometric_enrollment.sql
-- Purpose (Session 3 biometric-residual requirement #36):
--   IdentityEnrollment (candidate Identity page, production-reachable) was
--   storing face descriptors in localStorage and claiming "Identity Photo
--   Enrolled" while never touching the server biometric table — a fake
--   success and a second (localStorage-authoritative) biometric
--   architecture.
--   FIX: enroll_authenticated_biometric() — same validation pipeline as
--   enroll_candidate_biometric (dimension bounds, rate limit, idempotent
--   first-wins insert) but identity is DERIVED from auth.uid() →
--   profiles.candidate_id. No client-supplied candidate identity (H4).
--   One authoritative biometric architecture: server-owned.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enroll_authenticated_biometric(p_descriptor jsonb, p_confidence numeric)
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

  INSERT INTO public.candidate_biometrics (candidate_id, face_descriptor, confidence)
  VALUES (
    v_candidate_id,
    p_descriptor,
    GREATEST(0, LEAST(1, COALESCE(p_confidence, 0.9)))
  );

  RETURN jsonb_build_object('success', true, 'already_enrolled', false);
END;
$function$;

-- EXECUTE for authenticated users only (anon has no role here).
REVOKE ALL ON FUNCTION public.enroll_authenticated_biometric(jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_authenticated_biometric(jsonb, numeric) TO authenticated;

COMMIT;
