-- ============================================================================
-- Migration: 20260921000005_hr_token_issuance_rpc.sql
-- Purpose:
--   HR-side token issuance now goes through a SECURITY DEFINER RPC:
--   - server generates the high-entropy token and persists ONLY its hash
--   - binds candidate/assessment/application and 48h expiry
--   - advances the pipeline server-side
--   - closes the "Allow authenticated insert assessment tokens" WITH CHECK
--     (true) hole (any authenticated user could mint tokens for anyone).
-- ============================================================================

BEGIN;

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
  -- Actor must be HR/admin: derive from JWT, never from the payload.
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

  -- Assessment must exist and belong to the application's requisition.
  IF NOT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE id = p_assessment_id AND job_form_id = v_app.form_id AND status = 'Active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assessment is not active for this requisition.');
  END IF;

  -- Idempotency: an unconsumed token for the same candidate+assessment wins.
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

  v_raw := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

  INSERT INTO public.assessment_tokens (
    assessment_id, candidate_id, application_id, token, token_hash,
    status, used, expires_at
  ) VALUES (
    p_assessment_id, v_app.candidate_id, v_app.id, 'H:' || v_hash, v_hash,
    'Active', false, now() + interval '48 hours'
  ) RETURNING id INTO v_token_id;

  -- Authoritative pipeline transition (server-side).
  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Assessment Assigned'
  WHERE id = p_application_id
    AND status IN ('Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted', 'Recruiter Screening');

  -- Notification for the candidate (HR message references no raw token —
  -- the token itself is delivered to the candidate via the UI/notifications
  -- service by the caller; here we only confirm assignment).
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
