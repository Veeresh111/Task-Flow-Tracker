-- ============================================================================
-- 20260926000004 — Fix anniversary-grant INSERT typo in monthly leave accrual
-- ============================================================================
-- LIVE-PROVEN BUG (session 8, 2026-09-26):
--   The anniversary_grant INSERT inside accrue_monthly_leaves_and_anniversaries()
--   lists the column `v_month` (a variable) instead of the real column `month`:
--       fiscal_year, v_month, notes
--   Every execution where ANY active employee has a work anniversary in the
--   current month aborts with: column "v_month" of relation "leave_ledgers"
--   does not exist — and because the function runs in a single transaction,
--   the ENTIRE monthly accrual run for ALL employees is lost.
--   It went unnoticed only because no live employee has a September
--   employment_start_date (verified: Sept accruals 461/461, anniversary
--   employees 0). The landmine fires on the first real anniversary month.
--
-- Fix:
--   1. Correct the column list (`v_month` -> `month`).
--   2. Isolate each employee in its own exception block so one employee's
--      edge case can never abort the run for the remaining population.
--   Everything else (advisory lock, idempotency check, balance resolution,
--   return shape) is preserved byte-for-byte from the live definition.
-- ============================================================================

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
    BEGIN
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
          fiscal_year, month, notes
        ) VALUES (
          v_emp.id, 'anniversary_grant', 'paid_leave', 2.00, v_current_bal + 2.00,
          v_fiscal_year, v_month, format('Milestone Loyalty Grant: %s Year Anniversary (%s)', v_tenure->>'years', v_tenure->>'tier')
        );
        v_anniversary_count := v_anniversary_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Isolate per-employee failures: one bad row must never abort the
      -- accrual run for the rest of the population.
      RAISE WARNING 'accrual failed for employee %: %', v_emp.id, SQLERRM;
    END;
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
