-- ============================================================================
-- Migration: 20260921000015_leave_ledger_balance_fix.sql
-- Purpose: corrective follow-up to 20260921000014. The version of
--   accrue_monthly_leaves_and_anniversaries() recorded by migration 14 still
--   contained the zero-row balance bug (COALESCE applied to the column, not
--   to the NULL result of an empty ledger, against a NOT NULL
--   balance_after). This migration records and ships the corrected body:
--   the default is applied after the SELECT, so employees with no ledger
--   history start from 0 instead of violating the NOT NULL constraint.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.accrue_monthly_leaves_and_anniversaries()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now TIMESTAMPTZ := (now() AT TIME ZONE 'UTC');
  v_month INT := EXTRACT(MONTH FROM v_now);
  v_year INT := EXTRACT(YEAR FROM v_now);
  v_fiscal_year INT := CASE WHEN v_month >= 4 THEN v_year ELSE v_year - 1 END;
  v_emp RECORD;
  v_tenure JSONB;
  v_current_bal NUMERIC := 0;
  v_accrued_count INT := 0;
  v_anniversary_count INT := 0;
  v_already INT := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('leave_accrual_' || v_fiscal_year || '_' || v_month));

  FOR v_emp IN
    SELECT id, name
    FROM profiles
    WHERE status = 'active'
      AND (employment_status IS NULL OR employment_status != 'terminated')
      AND LOWER(COALESCE(role, '')) NOT IN ('candidate', 'archived')
  LOOP
    SELECT count(*)::INT INTO v_already
    FROM leave_ledgers
    WHERE user_id = v_emp.id
      AND transaction_type = 'monthly_accrual'
      AND fiscal_year = v_fiscal_year
      AND month = v_month;
    IF v_already > 0 THEN
      CONTINUE;
    END IF;

    -- Zero-row safe balance resolution (NOT NULL balance_after).
    v_current_bal := 0;
    SELECT balance_after INTO v_current_bal
    FROM leave_ledgers
    WHERE user_id = v_emp.id AND leave_type = 'paid_leave'
    ORDER BY created_at DESC LIMIT 1;
    IF v_current_bal IS NULL THEN v_current_bal := 0; END IF;

    -- 1. Standard Monthly Accrual (+1.5 Days)
    INSERT INTO leave_ledgers (
      user_id, transaction_type, leave_type, amount, balance_after,
      fiscal_year, month, notes
    ) VALUES (
      v_emp.id, 'monthly_accrual', 'paid_leave', 1.50, v_current_bal + 1.50,
      v_fiscal_year, v_month, format('Monthly Paid Leave Accrual for %s-%s', v_year, v_month)
    );
    v_accrued_count := v_accrued_count + 1;
    v_current_bal := v_current_bal + 1.50;

    -- 2. Work Anniversary Milestone Check
    v_tenure := public.get_company_tenure(v_emp.id);
    IF (v_tenure->>'is_anniversary_month')::BOOLEAN IS TRUE THEN
      INSERT INTO leave_ledgers (
        user_id, transaction_type, leave_type, amount, balance_after,
        fiscal_year, v_month, notes
      ) VALUES (
        v_emp.id, 'anniversary_grant', 'paid_leave', 2.00, v_current_bal + 2.00,
        v_fiscal_year, v_month, format('Milestone Loyalty Grant: %s Year Anniversary (%s)', v_tenure->>'years', v_tenure->>'tier')
      );
      v_anniversary_count := v_anniversary_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'employees_credited', v_accrued_count,
    'anniversaries_celebrated', v_anniversary_count,
    'month', v_month,
    'year', v_year
  );
END;
$function$;

COMMIT;
