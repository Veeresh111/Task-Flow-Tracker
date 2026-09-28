-- ============================================================================
-- Migration: 20260926000001_ats_evaluation_method_and_payroll_credit_convention.sql
-- Purpose (truth-in-UI + payroll credit convention):
--
--   PART 1 — ATS evaluation method truth label
--     The ATS scanner produces scores via two genuinely different engines:
--     (a) LLM evaluation (free HF/proxy models) and (b) a deterministic
--     VectorMath rule-based engine used when AI is offline. Previously the
--     stored candidate row did not record which engine produced the score,
--     so HR could not distinguish them. We add candidates.evaluation_method
--     ('ai' | 'rule_based') and backfill nothing (unknown stays NULL — we
--     do NOT invent history).
--
--   PART 2 — Payroll salary-credit convention: previous month, credited on the 1st
--     Business rule: salary for month M is credited on the 1st of M+1.
--     (October salary → credited November 1.) The existing pg_cron job
--     'corporate-monthly-payroll' ran auto_process_monthly_payroll_idempotent
--     for the CURRENT month at 00:00 on the 1st — i.e. it generated payroll
--     for a month that had not finished. It must process the PREVIOUS month.
--
--   PART 3 — Internal salary-credit semantics (no fake bank-transfer claims)
--     When a payroll cycle is RELEASED (final approval), its payslips are
--     marked status='credited'. The wording used everywhere is "credited in
--     the payroll system" — an internal accounting event, NOT a bank
--     transfer. No payment gateway exists or is implied.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PART 1: candidates.evaluation_method
-- ---------------------------------------------------------------------------
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS evaluation_method TEXT
  CHECK (evaluation_method IN ('ai', 'rule_based'));

COMMENT ON COLUMN public.candidates.evaluation_method IS
  'How ats_score was produced: ''ai'' = LLM evaluation; ''rule_based'' = deterministic VectorMath engine (AI offline). NULL = legacy row scored before this column existed.';

-- ---------------------------------------------------------------------------
-- PART 2: Payroll cron — credit PREVIOUS month's salary on the 1st
--   Reschedule 'corporate-monthly-payroll' to compute (month - 1). The
--   function itself stays idempotent (advisory lock + payroll_cycles
--   UNIQUE(month, year)), so re-runs are safe: ALREADY_PROCESSED.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('corporate-monthly-payroll');

    PERFORM cron.schedule(
      'corporate-monthly-payroll',
      '0 0 1 * *',
      $job$SELECT public.auto_process_monthly_payroll_idempotent(
        EXTRACT(MONTH FROM (now() - INTERVAL '1 month'))::INT,
        EXTRACT(YEAR FROM (now() - INTERVAL '1 month'))::INT
      );$job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron reschedule skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- PART 3: Release = internal salary credit
--   Extend transition_payroll_status so that moving a cycle to 'released'
--   ALSO marks its payslips 'credited' (internal payroll-system credit).
--   Payslip status vocabulary: active (calculated) → credited (salary
--   credited in payroll system). Nothing claims a bank transfer occurred.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_payroll_status(
  p_cycle_id UUID,
  p_next_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_current_month INT;
  v_current_year INT;
  v_user_role TEXT;
  v_allowed BOOLEAN := false;
  v_payslips_credited INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('payroll_transition_' || p_cycle_id));

  SELECT status, month, year INTO v_current_status, v_current_month, v_current_year
  FROM payroll_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payroll cycle not found');
  END IF;

  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current_status = 'generated' AND p_next_status = 'verified' THEN
    IF v_user_role IN ('hr', 'admin') THEN
      v_allowed := true;
    END IF;
  ELSIF v_current_status = 'verified' AND p_next_status = 'finance_approved' THEN
    IF v_user_role IN ('finance', 'admin') THEN
      v_allowed := true;
    END IF;
  ELSIF v_current_status = 'finance_approved' AND p_next_status = 'hr_approved' THEN
    IF v_user_role IN ('hr', 'admin') THEN
      v_allowed := true;
    END IF;
  ELSIF v_current_status = 'hr_approved' AND p_next_status = 'released' THEN
    IF v_user_role IN ('hr', 'admin') THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transition from ' || v_current_status || ' to ' || p_next_status ||
               ' not allowed for role ' || v_user_role
    );
  END IF;

  IF p_next_status = 'verified' THEN
    UPDATE payroll_cycles SET status = 'verified', verified_by = auth.uid(), verified_at = now()
    WHERE id = p_cycle_id;
  ELSIF p_next_status = 'finance_approved' THEN
    UPDATE payroll_cycles SET status = 'finance_approved', finance_approved_by = auth.uid(), finance_approved_at = now()
    WHERE id = p_cycle_id;
  ELSIF p_next_status = 'hr_approved' THEN
    UPDATE payroll_cycles SET status = 'hr_approved', hr_approved_by = auth.uid(), hr_approved_at = now()
    WHERE id = p_cycle_id;
  ELSIF p_next_status = 'released' THEN
    UPDATE payroll_cycles SET status = 'released', released_by = auth.uid(), released_at = now()
    WHERE id = p_cycle_id;

    -- INTERNAL SALARY CREDIT: payslips in this cycle are now credited in the
    -- payroll system. This is an accounting event — NOT a bank transfer.
    WITH credited AS (
      UPDATE public.payslips
      SET status = 'credited'
      WHERE cycle_id = p_cycle_id
        AND status IS DISTINCT FROM 'credited'
      RETURNING 1
    )
    SELECT count(*) INTO v_payslips_credited FROM credited;
  END IF;

  INSERT INTO payroll_audit (
    evidence_code, entity, entity_id, action, old_value, new_value,
    performed_by, reason, details
  ) VALUES (
    'EV-PAY-005', 'payroll_cycles', p_cycle_id,
    'STATUS_' || upper(p_next_status),
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', p_next_status),
    auth.uid(),
    'Payroll cycle ' || v_current_month || '/' || v_current_year ||
      ' transitioned from ' || v_current_status || ' to ' || p_next_status,
    jsonb_build_object(
      'month', v_current_month,
      'year', v_current_year,
      'from_status', v_current_status,
      'to_status', p_next_status,
      'performed_by_role', v_user_role,
      'payslips_credited', v_payslips_credited,
      'credit_semantics', 'internal_payroll_system_credit'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'evidence_code', 'EV-PAY-005',
    'cycle_id', p_cycle_id,
    'previous_status', v_current_status,
    'new_status', p_next_status,
    'payslips_credited', v_payslips_credited
  );
END;
$$;

COMMIT;
