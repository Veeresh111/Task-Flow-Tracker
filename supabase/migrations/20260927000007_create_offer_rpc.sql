-- ============================================================================
-- 20260927000007 — Authoritative offer-creation RPC (product decision A)
-- ============================================================================

-- SQL mirror of the TS application state machine (src/lib/status-validators.ts),
-- restricted to the forward transitions the offer path needs. This is a helper
-- for offer creation only — the full machine remains in the guard trigger.
CREATE OR REPLACE FUNCTION public.is_valid_application_transition(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    p_from = p_to
    OR (p_from, p_to) IN (
      ('Assessment Completed', 'Interview Scheduled'),
      ('Assessment Completed', 'Interview Cleared'),
      ('Interview Scheduled', 'Interview Cleared'),
      ('Interview Cleared', 'Offer Generated'),
      ('Assessment Completed', 'Offer Generated')
    )
  );
$$;
-- Smallest production-grade path for HR to initiate an offer:
--   HR UI -> create_offer_for_application(app_id, ctc, joining_date, title?)
--   -> HR/Admin authorization (JWT-derived; never client-asserted)
--   -> candidate/application relationship + state validated server-side
--   -> offer_letters row created (Pending Approval)
--   -> application status advanced to 'Offer Generated' via the SAME
--      authoritative GUC the offer state machine uses
--   -> audit_logs event
-- The client cannot manufacture arbitrary offers: salary, status, approver and
-- identity fields are derived or constrained server-side. Transitions after
-- creation remain exclusively in transition_offer_status (existing machine).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_offer_for_application(
  p_application_id UUID,
  p_offered_ctc NUMERIC,
  p_joining_date DATE,
  p_job_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_actor_role TEXT;
  v_app RECORD;
  v_offer_id UUID;
  v_ref TEXT;
BEGIN
  -- 1. Authorization: HR/Admin only (derived from JWT, never client-asserted).
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-OFFER-AUTH).');
  END IF;
  SELECT LOWER(COALESCE(role, '')) INTO v_actor_role
  FROM public.profiles WHERE id = v_actor AND status != 'archived';
  IF v_actor_role NOT IN ('admin', 'hr') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may create offers (EV-OFFER-403).');
  END IF;

  -- 2. Input validation.
  IF p_offered_ctc IS NULL OR p_offered_ctc <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offered CTC must be a positive value.');
  END IF;
  IF p_joining_date IS NULL OR p_joining_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Joining date must be today or in the future.');
  END IF;

  -- 3. Authoritative application + candidate relationship (server-derived).
  SELECT * INTO v_app FROM public.job_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
  END IF;
  IF v_app.candidate_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application is not bound to a candidate.');
  END IF;

  -- 4. State validation: only pre-offer stages may receive an offer; no
  --    duplicate offers for the same application.
  IF v_app.status NOT IN ('Assessment Completed', 'Interview Scheduled',
                          'Interview Cleared', 'Offer Generated') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Application not in an offer-eligible state (current: ' || v_app.status || ').');
  END IF;
  IF EXISTS (SELECT 1 FROM public.offer_letters WHERE application_id = p_application_id
             AND status NOT IN ('Declined', 'Expired')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'An active offer already exists for this application.');
  END IF;

  -- 5. Create the offer in the machine's initial state.
  v_ref := 'FWC-OFF-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::text), 1, 6));
  INSERT INTO public.offer_letters (
    candidate_id, application_id, job_form_id,
    candidate_name, candidate_email, job_title,
    offered_ctc, salary_ctc, joining_date, offer_date,
    status, created_by, reference_number
  ) VALUES (
    v_app.candidate_id, v_app.id, v_app.form_id,
    COALESCE(v_app.candidate_name, 'Candidate'), COALESCE(v_app.candidate_email, ''),
    COALESCE(p_job_title, 'Offer'), p_offered_ctc, p_offered_ctc::text,
    p_joining_date, CURRENT_DATE,
    'Pending Approval', v_actor, v_ref
  ) RETURNING id INTO v_offer_id;

  -- 6. Advance the pipeline through the SAME authority the state machine uses
  --    (unforgeable GUC; guard trigger accepts it for authenticated callers).
  IF v_app.status <> 'Offer Generated' THEN
    PERFORM set_config('app.authoritative_transition', 'true', true);
    UPDATE public.job_applications
    SET status = 'Offer Generated'
    WHERE id = v_app.id AND public.is_valid_application_transition(v_app.status, 'Offer Generated');
    PERFORM set_config('app.authoritative_transition', '', true);
  END IF;

  -- 7. Audit event.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    v_actor, 'OFFER_CREATED', 'offer_letters', v_offer_id,
    jsonb_build_object(
      'application_id', v_app.id,
      'candidate_id', v_app.candidate_id,
      'offered_ctc', p_offered_ctc,
      'joining_date', p_joining_date,
      'reference', v_ref
    )
  );

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id, 'reference', v_ref);
END;
$$;
