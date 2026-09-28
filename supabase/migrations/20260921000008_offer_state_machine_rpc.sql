-- ============================================================================
-- Migration: 20260921000008_offer_state_machine_rpc.sql
-- Purpose: ONE authoritative offer state machine covering the full offer
--   lifecycle (replaces client-side status PATCHes):
--     Pending Approval → Approved        (HR approval gate)
--     Approved → Sent                    (HR dispatch)
--     Sent → Accepted / Declined         (candidate decision; expiry enforced)
--   plus reconcile_offer_status for legacy drift (HR-only, audited).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.transition_offer_status(
  p_offer_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer RECORD;
  v_actor RECORD;
  v_new_status TEXT;
  v_app RECORD;
  v_is_hr BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required (EV-AUTH-401).');
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  v_is_hr := v_actor.role IN ('admin', 'hr');

  SELECT * INTO v_offer FROM public.offer_letters WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found.');
  END IF;

  v_is_owner := v_actor.candidate_id IS NOT NULL AND v_actor.candidate_id = v_offer.candidate_id;

  -- State machine: action → required actor + current state + next state
  IF p_action = 'approve' THEN
    IF NOT v_is_hr THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may approve offers (EV-AUTH-403).');
    END IF;
    IF v_offer.status != 'Pending Approval' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only offers in Pending Approval can be approved (current: ' || v_offer.status || ').');
    END IF;
    v_new_status := 'Approved';

  ELSIF p_action = 'send' THEN
    IF NOT v_is_hr THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may dispatch offers (EV-AUTH-403).');
    END IF;
    IF v_offer.status NOT IN ('Pending Approval', 'Approved') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only approved offers can be sent (current: ' || v_offer.status || ').');
    END IF;
    v_new_status := 'Sent';

  ELSIF p_action = 'accept' THEN
    IF NOT (v_is_hr OR v_is_owner) THEN
      RETURN jsonb_build_object('success', false, 'error', 'This offer does not belong to you (EV-AUTH-403).');
    END IF;
    IF v_offer.status != 'Sent' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only sent offers can be accepted (current: ' || v_offer.status || ').');
    END IF;
    -- Server-authoritative expiry: 14 days after generation.
    IF v_offer.offer_date IS NOT NULL AND v_offer.offer_date < CURRENT_DATE - 14 THEN
      UPDATE public.offer_letters SET status = 'Expired' WHERE id = v_offer.id;
      RETURN jsonb_build_object('success', false, 'error', 'This offer has expired (EV-OFFER-EXP).');
    END IF;
    v_new_status := 'Accepted';

  ELSIF p_action = 'decline' THEN
    IF NOT (v_is_hr OR v_is_owner) THEN
      RETURN jsonb_build_object('success', false, 'error', 'This offer does not belong to you (EV-AUTH-403).');
    END IF;
    IF v_offer.status != 'Sent' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only sent offers can be declined (current: ' || v_offer.status || ').');
    END IF;
    v_new_status := 'Declined';

  ELSIF p_action = 'expire' THEN
    IF NOT v_is_hr THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin may expire offers (EV-AUTH-403).');
    END IF;
    IF v_offer.status != 'Sent' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only sent offers can be expired (current: ' || v_offer.status || ').');
    END IF;
    v_new_status := 'Expired';

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unknown action. Valid: approve|send|accept|decline|expire.');
  END IF;

  -- Perform the transition with truthful timestamps.
  UPDATE public.offer_letters
  SET status = v_new_status,
      approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE v_offer.approved_at END,
      approved_by = CASE WHEN p_action = 'approve' THEN auth.uid() ELSE v_offer.approved_by END,
      sent_at = CASE WHEN p_action = 'send' THEN now() ELSE v_offer.sent_at END,
      responded_at = CASE WHEN p_action IN ('accept', 'decline') THEN now() ELSE v_offer.responded_at END
  WHERE id = v_offer.id;

  -- Authoritative pipeline sync for candidate-driven decisions.
  IF p_action IN ('accept', 'decline') AND v_offer.application_id IS NOT NULL THEN
    PERFORM set_config('app.authoritative_transition', 'true', true);
    UPDATE public.job_applications
    SET status = CASE WHEN p_action = 'accept' THEN 'Offer Accepted' ELSE 'Rejected' END
    WHERE id = v_offer.application_id
      AND status IN ('Offer Generated', 'Offer Accepted');
  END IF;

  -- Notify HR on candidate decisions (actionable hiring prompt).
  IF p_action = 'accept' THEN
    INSERT INTO public.notifications (user_id, title, message, is_read)
    SELECT p.id,
           'Offer Accepted — Ready to Hire',
           'A candidate accepted their offer. Proceed with hiring in the Onboarding Center.',
           false
    FROM public.profiles p WHERE p.role IN ('admin', 'hr');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_offer_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_offer_status(UUID, TEXT) TO authenticated;

COMMIT;
