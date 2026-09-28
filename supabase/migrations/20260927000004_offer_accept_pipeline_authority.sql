-- ============================================================================
-- 20260927000004 — Offer-acceptance pipeline sync authority fix
-- ============================================================================
-- LIVE-PROVEN BUG (session 9, full-lifecycle probe LC-08b):
--   transition_offer_status (SECURITY DEFINER RPC) syncs the application
--   pipeline on candidate accept/decline:
--       PERFORM set_config('app.authoritative_transition', 'true', true);
--       UPDATE job_applications SET status = 'Offer Accepted' ...
--   But guard_job_application_status_authority only trusts that GUC when
--   auth.uid() IS NULL. A CANDIDATE caller (the normal self-accept path)
--   falls through to the HR/Admin role check and dies with
--   EV-RBAC-102 "Only HR/Admin may change job application status" —
--   rolling back the ENTIRE acceptance. Candidate self-acceptance of an
--   offer whose application sits in 'Offer Generated' (the canonical flow)
--   is therefore impossible.
--
-- Safety of the fix: PostgREST clients CANNOT set custom GUCs
-- (documented in the original migration), so app.authoritative_transition
-- can only ever be set by SECURITY DEFINER database code. Trusting it for
-- authenticated callers grants nothing to the client.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_job_application_status_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Server-authoritative internal transitions (SECURITY DEFINER RPCs such as
  -- transition_offer_status) mark their transaction with this GUC. PostgREST
  -- clients cannot set custom GUCs, so this cannot be forged from outside
  -- the database — for anon OR authenticated callers.
  IF current_setting('app.authoritative_transition', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Anonymous sessions cannot modify job application status (EV-RBAC-101)';
  END IF;

  SELECT LOWER(COALESCE(role, '')) INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid() AND status != 'archived';

  IF v_caller_role NOT IN ('admin', 'hr') THEN
    RAISE EXCEPTION 'Only HR/Admin may change job application status (EV-RBAC-102)';
  END IF;

  RETURN NEW;
END;
$$;
