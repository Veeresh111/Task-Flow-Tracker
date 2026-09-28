-- ============================================================================
-- Migration: 20260921000014_leave_accrual_repair.sql
-- Purpose (S4-S3 deep cron audit finding):
--   corporate-monthly-leave-accrual (cron job 9) FAILED on its only run
--   (Sep 1) with "column date_of_joining does not exist". The real profiles
--   column is employment_start_date. leave_ledgers contains ZERO
--   monthly_accrual rows — accrual has never succeeded in production.
--   get_company_tenure() shares the same phantom-column defect.
--
--   FIX:
--   1. accrue_monthly_leaves_and_anniversaries(): use employment_start_date;
--      add per-employee (fiscal_year, month) idempotency check + advisory
--      lock so retries never double-credit; exclude
--      terminated/archived/candidate profiles.
--   2. get_company_tenure(): use employment_start_date (created_at fallback
--      retained).
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
  -- Serialize concurrent runs for the same period (idempotency guard).
  PERFORM pg_advisory_xact_lock(hashtext('leave_accrual_' || v_fiscal_year || '_' || v_month));

  FOR v_emp IN
    SELECT id, name
    FROM profiles
    WHERE status = 'active'
      AND (employment_status IS NULL OR employment_status != 'terminated')
      AND LOWER(COALESCE(role, '')) NOT IN ('candidate', 'archived')
  LOOP
    -- Idempotency: skip if this employee already has the month's accrual.
    SELECT count(*)::INT INTO v_already
    FROM leave_ledgers
    WHERE user_id = v_emp.id
      AND transaction_type = 'monthly_accrual'
      AND fiscal_year = v_fiscal_year
      AND month = v_month;
    IF v_already > 0 THEN
      CONTINUE;
    END IF;

    -- Current balance (default applies when the employee has NO ledger
    -- rows at all — balance_after is NOT NULL, so a zero-row SELECT must
    -- yield the default, not NULL).
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

-- Fix the shared phantom-column defect in tenure calculation.
CREATE OR REPLACE FUNCTION public.get_company_tenure(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doj DATE;
  v_now DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_months INT;
  v_years INT;
  v_rem_months INT;
  v_tier TEXT;
  v_is_anniversary_month BOOLEAN := false;
BEGIN
  SELECT employment_start_date::DATE INTO v_doj FROM profiles WHERE id = p_user_id;

  IF v_doj IS NULL THEN
    -- Fall back to profile created_at
    SELECT created_at::DATE INTO v_doj FROM profiles WHERE id = p_user_id;
  END IF;

  IF v_doj IS NULL OR v_doj > v_now THEN
    RETURN jsonb_build_object(
      'years', 0,
      'months', 0,
      'total_months', 0,
      'tier', 'Probationary / Associate',
      'is_anniversary_month', false
    );
  END IF;

  -- Calculate full calendar months
  v_months := (EXTRACT(YEAR FROM age(v_now, v_doj)) * 12) + EXTRACT(MONTH FROM age(v_now, v_doj));
  IF EXTRACT(DAY FROM v_now) < EXTRACT(DAY FROM v_doj) THEN
    v_months := v_months - 1;
  END IF;

  v_years := floor(v_months / 12);
  v_rem_months := v_months % 12;

  v_tier := CASE
    WHEN v_years >= 5 THEN 'Senior / Veteran'
    WHEN v_years >= 2 THEN 'Established'
    WHEN v_months >= 6 THEN 'Confirmed'
    ELSE 'Probationary / Associate'
  END;

  -- Anniversary month: same month as joining AND at least 1 full year
  v_is_anniversary_month := (EXTRACT(MONTH FROM v_doj) = EXTRACT(MONTH FROM v_now)) AND v_years >= 1;

  RETURN jsonb_build_object(
    'years', v_years,
    'months', v_rem_months,
    'total_months', v_months,
    'tier', v_tier,
    'is_anniversary_month', v_is_anniversary_month
  );
END;
$function$;

COMMIT;
