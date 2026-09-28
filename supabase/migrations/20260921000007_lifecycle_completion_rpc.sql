-- ============================================================================
-- Migration: 20260921000007_lifecycle_completion_rpc.sql
-- Purpose (Session 3: connect the automation arrows):
--   A. schedule_interview: HR-only authoritative scheduling. Removes the
--      client-authoritative direct UPDATE on job_applications.
--   B. submit_interview_evaluation: HR-only authoritative evaluation with
--      server-computed average + threshold decision. Replaces the client's
--      double-write (interview_sessions UPDATE + job_applications UPDATE +
--      candidates UPDATE) with one server transaction.
--   C. generate_offer: HR-only offer creation with immutable snapshot,
--      idempotent per application, server-side pipeline transition.
--   D. accept_offer: candidate-authoritative acceptance with offer expiry +
--      ownership binding; hands off to hiring via application status.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A. INTERVIEW SCHEDULING (HUMAN GATE: HR decides to schedule)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.schedule_interview(
  p_application_id UUID,
  p_round_name TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_meeting_link TEXT,
  p_meeting_provider TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_actor_role TEXT;
  v_next_round INT;
  v_session_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();
  IF v_actor_role NOT IN ('admin', 'hr') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may schedule interviews (EV-AUTH-403).');
  END IF;

  SELECT id, status, candidate_id INTO v_app FROM public.job_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
  END IF;

  -- Preconditions: candidate must have completed assessment stage.
  IF v_app.status NOT IN ('Assessment Completed', 'Assessment Passed', 'Interview Scheduled', 'Interview Cleared') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Interview can only be scheduled after assessment completion. Current status: ' || COALESCE(v_app.status, '?'));
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Scheduled time must be in the future.');
  END IF;

  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_next_round
  FROM public.interview_sessions WHERE application_id = p_application_id;

  INSERT INTO public.interview_sessions (
    application_id, round_name, round_number, scheduled_at,
    meeting_link, meeting_provider, status
  ) VALUES (
    p_application_id,
    left(COALESCE(p_round_name, 'Technical Round'), 120),
    v_next_round,
    p_scheduled_at,
    NULLIF(left(COALESCE(p_meeting_link, ''), 500), ''),
    COALESCE(p_meeting_provider, 'Other'),
    'Scheduled'
  ) RETURNING id INTO v_session_id;

  -- Authoritative pipeline transition (internal definer transition).
  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Interview Scheduled', interview_status = 'Scheduled'
  WHERE id = p_application_id;

  RETURN jsonb_build_object('success', true, 'session_id', v_session_id, 'round_number', v_next_round);
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_interview(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_interview(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- B. INTERVIEW EVALUATION (HUMAN GATE: interviewer submits structured scores)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_interview_evaluation(
  p_session_id UUID,
  p_communication INT,
  p_technical INT,
  p_problem_solving INT,
  p_culture_fit INT,
  p_transcript TEXT,
  p_ai_report TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_actor_role TEXT;
  v_avg NUMERIC;
  v_passed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();
  IF v_actor_role NOT IN ('admin', 'hr') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may submit interview evaluations (EV-AUTH-403).');
  END IF;

  SELECT id, application_id, status INTO v_session
  FROM public.interview_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Interview session not found.');
  END IF;
  IF v_session.status = 'Completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This interview has already been evaluated (idempotent).');
  END IF;

  -- Bounded score validation
  IF p_communication IS NULL OR p_technical IS NULL OR p_problem_solving IS NULL OR p_culture_fit IS NULL
     OR p_communication NOT BETWEEN 0 AND 100 OR p_technical NOT BETWEEN 0 AND 100
     OR p_problem_solving NOT BETWEEN 0 AND 100 OR p_culture_fit NOT BETWEEN 0 AND 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'All four scorecard dimensions must be integers 0-100.');
  END IF;

  v_avg := ROUND(((p_communication + p_technical + p_problem_solving + p_culture_fit) / 4.0), 2);
  v_passed := v_avg >= 75; -- authoritative threshold

  UPDATE public.interview_sessions
  SET status = 'Completed',
      score = v_avg,
      communication_score = p_communication,
      technical_score = p_technical,
      problem_solving_score = p_problem_solving,
      culture_fit_score = p_culture_fit,
      transcript = NULLIF(left(COALESCE(p_transcript, ''), 100000), ''),
      ai_analysis_report = NULLIF(left(COALESCE(p_ai_report, ''), 5000), ''),
      feedback = 'Overall Score: ' || v_avg || '%.'
  WHERE id = p_session_id;

  -- Authoritative pipeline transition, single transaction.
  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = CASE WHEN v_passed THEN 'Interview Cleared' ELSE 'Rejected' END,
      interview_status = CASE WHEN v_passed THEN 'Completed' ELSE 'Rejected' END,
      interview_score = v_avg
  WHERE id = v_session.application_id;

  RETURN jsonb_build_object(
    'success', true,
    'average', v_avg,
    'passed', v_passed,
    'next_state', CASE WHEN v_passed THEN 'Interview Cleared' ELSE 'Rejected' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_interview_evaluation(UUID, INT, INT, INT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_interview_evaluation(UUID, INT, INT, INT, INT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- C. OFFER GENERATION (HUMAN GATE: HR authorizes compensation)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_offer(
  p_application_id UUID,
  p_offered_ctc NUMERIC,
  p_joining_date DATE,
  p_terms TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_actor_role TEXT;
  v_offer_id UUID;
  v_existing UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();
  IF v_actor_role NOT IN ('admin', 'hr') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may generate offers (EV-AUTH-403).');
  END IF;

  SELECT id, candidate_id, form_id, status INTO v_app
  FROM public.job_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
  END IF;

  -- Selection precondition: interview cleared (HUMAN decision already made).
  IF v_app.status NOT IN ('Interview Cleared', 'Offer Generated') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Offer can only be generated after interview clearance. Current status: ' || COALESCE(v_app.status, '?'));
  END IF;

  IF p_offered_ctc IS NULL OR p_offered_ctc <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offered CTC must be a positive amount.');
  END IF;

  -- Idempotency: one live offer per application.
  SELECT id INTO v_existing FROM public.offer_letters
  WHERE application_id = p_application_id
    AND status IN ('Pending Approval', 'Approved', 'Offered', 'Sent', 'Viewed')
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_offered', true, 'offer_id', v_existing);
  END IF;

  INSERT INTO public.offer_letters (
    candidate_id, job_form_id, application_id,
    offered_ctc, offer_date, joining_date,
    status, created_by, terms
  ) VALUES (
    v_app.candidate_id, v_app.form_id, p_application_id,
    round(p_offered_ctc, 2), CURRENT_DATE, p_joining_date,
    'Pending Approval', auth.uid(),
    left(COALESCE(p_terms, ''), 5000)
  ) RETURNING id INTO v_offer_id;

  INSERT INTO public.offer_approvals (offer_id, approver_id, approval_order, status)
  VALUES (v_offer_id, auth.uid(), 1, 'Pending');

  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Offer Generated'
  WHERE id = p_application_id AND status = 'Interview Cleared';

  -- Notify candidate (notification only; the offer itself is delivered
  -- through the candidate portal — no raw acceptance token by email).
  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (
    v_app.candidate_id,
    'Offer Generated',
    'An offer has been generated for your application and is pending approval. You will be notified when it is ready to view.',
    false
  );

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_offer(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_offer(UUID, NUMERIC, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- D. OFFER ACCEPTANCE (HUMAN GATE: candidate decides; server enforces expiry,
--    ownership and state). Hands off to hiring by transitioning status.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_offer(
  p_offer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer RECORD;
  v_actor_profile RECORD;
  v_app RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT * INTO v_actor_profile FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_offer FROM public.offer_letters WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found.');
  END IF;

  -- Ownership binding: the authenticated actor must be the offer's candidate
  -- (via profile.candidate_id) or an HR/Admin actor acting on their behalf.
  IF v_actor_profile.role NOT IN ('admin', 'hr') THEN
    IF v_actor_profile.candidate_id IS NULL OR v_actor_profile.candidate_id != v_offer.candidate_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'This offer does not belong to you (EV-AUTH-403).');
    END IF;
  END IF;

  SELECT id, status INTO v_app FROM public.job_applications WHERE id = v_offer.application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is not linked to a valid application.');
  END IF;

  IF v_offer.status IN ('Accepted', 'Declined', 'Expired', 'Withdrawn') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This offer is no longer actionable (status: ' || v_offer.status || ').');
  END IF;

  -- Server-authoritative expiry: offers lapse 14 days after generation.
  IF v_offer.offer_date IS NOT NULL AND v_offer.offer_date < CURRENT_DATE - 14 THEN
    UPDATE public.offer_letters SET status = 'Expired' WHERE id = v_offer.id;
    RETURN jsonb_build_object('success', false, 'error', 'This offer has expired (EV-OFFER-EXP).');
  END IF;

  UPDATE public.offer_letters
  SET status = 'Accepted'
  WHERE id = v_offer.id;

  -- Hand off to hiring: pipeline transition. The hire-candidate Edge
  -- Function remains the identity-provisioning step (Auth + DB reconciliation).
  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Offer Accepted'
  WHERE id = v_offer.application_id
    AND status IN ('Offer Generated', 'Interview Cleared');

  -- Notify HR that the candidate accepted (actionable hiring prompt).
  INSERT INTO public.notifications (user_id, title, message, is_read)
  SELECT p.id,
         'Offer Accepted — Ready to Hire',
         'Candidate accepted the offer for application ' || v_offer.application_id || '. Proceed with hiring in the Onboarding Center.',
         false
  FROM public.profiles p WHERE p.role IN ('admin', 'hr');

  RETURN jsonb_build_object('success', true, 'application_status', 'Offer Accepted');
END;
$$;

REVOKE ALL ON FUNCTION public.accept_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_offer(UUID) TO authenticated;

COMMIT;
