-- ============================================================================
-- Centralized Global Corporate Clock & Automated Lifecycle Engine
-- Features:
--   1. Idempotent Monthly Payroll Execution (0 0 1 * *) with LWP Proration & Locks
--   2. Dynamic Server-Time Tenure & Total Experience Calculation
--   3. Automated Monthly Leave Accrual (+1.5 PL) & Work Anniversary Tier Upgrades
--   4. Fiscal Year Carry-Forward / Lapse Sub-routine
--   5. Daily Absentee Auto-Flagging (0 10 * * 1-5)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. LEAVE LEDGERS (Immutable Auditable Transaction History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leave_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'monthly_accrual', 'leave_taken', 'leave_cancelled',
      'fiscal_lapse', 'carry_forward', 'anniversary_grant', 'manual_adjustment'
    )
  ),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('paid_leave', 'sick_leave', 'casual_leave', 'unpaid_leave')),
  amount NUMERIC(5,2) NOT NULL, -- e.g. +1.50, -2.00
  balance_after NUMERIC(6,2) NOT NULL,
  fiscal_year INT NOT NULL,
  month INT CHECK (month BETWEEN 1 AND 12),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_ledgers_user_fiscal ON public.leave_ledgers(user_id, fiscal_year, created_at DESC);

-- ============================================================================
-- 2. DYNAMIC CORPORATE TENURE & TOTAL EXPERIENCE ENGINE
-- ============================================================================
-- Dynamic Company Tenure
CREATE OR REPLACE FUNCTION public.get_company_tenure(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_doj DATE;
  v_now DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_months INT;
  v_years INT;
  v_rem_months INT;
  v_tier TEXT;
  v_is_anniversary_month BOOLEAN := false;
BEGIN
  SELECT date_of_joining::DATE INTO v_doj FROM profiles WHERE id = p_user_id;
  
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
  v_years := v_months / 12;
  v_rem_months := v_months % 12;

  -- Check if current UTC month matches joining month (Anniversary Milestone)
  IF EXTRACT(MONTH FROM v_now) = EXTRACT(MONTH FROM v_doj) AND v_years >= 1 THEN
    v_is_anniversary_month := true;
  END IF;

  -- Corporate Tenure Tier Progression
  IF v_years >= 5 THEN
    v_tier := 'Principal / Veteran Staff';
  ELSIF v_years >= 3 THEN
    v_tier := 'Senior Corporate Member';
  ELSIF v_years >= 1 THEN
    v_tier := 'Confirmed Staff Member';
  ELSE
    v_tier := 'Associate / Probationary Member';
  END IF;

  RETURN jsonb_build_object(
    'years', v_years,
    'months', v_rem_months,
    'total_months', v_months,
    'tier', v_tier,
    'is_anniversary_month', v_is_anniversary_month,
    'date_of_joining', v_doj
  );
END;
$$;

-- Dynamic Total Experience (Initial Experience + Dynamic Tenure at Current Server Time)
CREATE OR REPLACE FUNCTION public.get_total_experience_years(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_doj DATE;
  v_initial_exp NUMERIC := 0;
  v_now DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_tenure_years NUMERIC := 0;
BEGIN
  SELECT 
    COALESCE(date_of_joining::DATE, created_at::DATE),
    COALESCE(experience, 0)
  INTO v_doj, v_initial_exp
  FROM profiles WHERE id = p_user_id;

  IF v_doj IS NOT NULL AND v_now >= v_doj THEN
    v_tenure_years := ROUND((v_now - v_doj)::NUMERIC / 365.25, 2);
  END IF;

  RETURN ROUND(v_initial_exp + v_tenure_years, 2);
END;
$$;

-- ============================================================================
-- 3. IDEMPOTENT AUTOMATED MONTHLY PAYROLL ENGINE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_process_monthly_payroll_idempotent(
  p_month INT,
  p_year INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_actor UUID;
  v_cycle_id UUID;
  v_structure_id UUID;
  v_basic_pct NUMERIC := 50;
  v_hra_pct NUMERIC := 20;
  v_lta_pct NUMERIC := 10;
  v_special_pct NUMERIC := 10;
  v_variable_pct NUMERIC := 10;
  v_pt_amount NUMERIC := 200;
  
  v_days_in_month INT;
  v_emp RECORD;
  v_lwp_days INT := 0;
  v_payable_days NUMERIC;
  v_monthly_ctc NUMERIC;
  v_prorated_monthly_ctc NUMERIC;
  
  v_basic NUMERIC;
  v_hra NUMERIC;
  v_lta NUMERIC;
  v_special NUMERIC;
  v_variable NUMERIC;
  v_gross NUMERIC;
  v_pf NUMERIC;
  v_pt NUMERIC;
  v_tds_monthly NUMERIC;
  v_total_deductions NUMERIC;
  v_net NUMERIC;
  v_lop_deduction NUMERIC;
  
  v_total_employees INT := 0;
  v_total_gross NUMERIC := 0;
  v_total_net NUMERIC := 0;
  v_total_pf NUMERIC := 0;
  v_total_tds NUMERIC := 0;
BEGIN
  -- 1. Resolve System Actor for Audit Logging
  SELECT id INTO v_system_actor FROM profiles WHERE LOWER(role) IN ('admin', 'hr') LIMIT 1;
  IF v_system_actor IS NULL THEN
    SELECT id INTO v_system_actor FROM profiles LIMIT 1;
  END IF;

  -- 2. Input Validation
  IF p_month < 1 OR p_month > 12 OR p_year < 2000 OR p_year > 2100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payroll month/year parameters');
  END IF;

  -- 3. Calculate Days in Target Month
  v_days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day'));

  -- 4. IDEMPOTENCY CHECK & LOCK (Advisory Transaction Lock + Unique Constraint)
  PERFORM pg_advisory_xact_lock(hashtext('payroll_auto_cycle_' || p_year || '_' || p_month));

  IF EXISTS (SELECT 1 FROM payroll_cycles WHERE month = p_month AND year = p_year) THEN
    -- Already generated. Return idempotent acknowledgement.
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', format('Payroll cycle for %s-%s already generated and locked.', p_year, LPAD(p_month::text, 2, '0')),
      'month', p_month,
      'year', p_year
    );
  END IF;

  -- 5. Load Default Salary Structure
  SELECT id INTO v_structure_id FROM salary_structures WHERE is_default = true LIMIT 1;
  IF v_structure_id IS NOT NULL THEN
    SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'BASIC'), 50) INTO v_basic_pct;
    SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'HRA'), 20) INTO v_hra_pct;
    SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'LTA'), 10) INTO v_lta_pct;
    SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'SPECIAL'), 10) INTO v_special_pct;
    SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'VARIABLE'), 10) INTO v_variable_pct;
    SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'PT'), 200) INTO v_pt_amount;
  END IF;

  -- 6. Initialize Cycle Record
  INSERT INTO payroll_cycles (
    month, year, status, generated_by, total_employees,
    total_gross, total_net, total_pf, total_tds, notes
  ) VALUES (
    p_month, p_year, 'generated', v_system_actor, 0, 0, 0, 0, 0,
    format('Automated Corporate Clock Execution for %s-%s', p_year, LPAD(p_month::text, 2, '0'))
  ) RETURNING id INTO v_cycle_id;

  -- 7. Iterate Through All Active Employees with Valid CTC
  FOR v_emp IN
    SELECT id, name, email, department, payroll_ctc
    FROM profiles
    WHERE status = 'active'
      AND payroll_ctc IS NOT NULL
      AND payroll_ctc > 0
      AND (employment_status IS NULL OR employment_status != 'terminated')
    ORDER BY id
  LOOP
    -- Calculate Unpaid Leave (LWP / LOP) for Employee in Target Month
    SELECT COALESCE(SUM(days_count), 0)::INT INTO v_lwp_days
    FROM leaves
    WHERE user_id = v_emp.id
      AND status = 'Approved'
      AND LOWER(type) IN ('unpaid', 'unpaid_leave', 'lwp', 'lop')
      AND start_date <= (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE
      AND end_date >= MAKE_DATE(p_year, p_month, 1);

    v_payable_days := GREATEST(0, v_days_in_month - v_lwp_days);
    v_monthly_ctc := ROUND(v_emp.payroll_ctc / 12, 2);

    -- Prorate Monthly CTC based on Payable Days
    v_prorated_monthly_ctc := ROUND((v_monthly_ctc / v_days_in_month) * v_payable_days, 2);
    v_lop_deduction := ROUND(v_monthly_ctc - v_prorated_monthly_ctc, 2);

    -- Compute Salary Components
    v_basic := ROUND(v_prorated_monthly_ctc * (v_basic_pct / 100), 2);
    v_hra := ROUND(v_prorated_monthly_ctc * (v_hra_pct / 100), 2);
    v_lta := ROUND(v_prorated_monthly_ctc * (v_lta_pct / 100), 2);
    v_special := ROUND(v_prorated_monthly_ctc * (v_special_pct / 100), 2);
    v_variable := ROUND(v_prorated_monthly_ctc * (v_variable_pct / 100), 2);
    v_gross := ROUND(v_basic + v_hra + v_lta + v_special + v_variable, 2);

    -- Deductions: Standard Indian IT Rules (PF: 12% of Basic, PT: 200, TDS: slab estimation)
    v_pf := ROUND(LEAST(v_basic * 0.12, 1800), 2);
    v_pt := CASE WHEN v_gross > 15000 THEN v_pt_amount ELSE 0 END;
    v_tds_monthly := ROUND((GREATEST(0, v_emp.payroll_ctc - 500000) * 0.10) / 12, 2);
    
    v_total_deductions := ROUND(v_pf + v_pt + v_tds_monthly, 2);
    v_net := ROUND(GREATEST(0, v_gross - v_total_deductions), 2);

    -- Insert Immutable Payslip Record (Guarded by Unique Constraint)
    INSERT INTO payslips (
      employee_id, cycle_id,
      employee_name, employee_email, employee_department,
      annual_ctc, monthly_ctc,
      earnings, deductions,
      gross, net,
      pf_amount, pt_amount, tds_amount,
      lop_days, lop_deduction,
      version, status
    ) VALUES (
      v_emp.id, v_cycle_id,
      v_emp.name, v_emp.email, COALESCE(v_emp.department, 'General'),
      v_emp.payroll_ctc, v_monthly_ctc,
      jsonb_build_object('basic', v_basic, 'hra', v_hra, 'lta', v_lta, 'special', v_special, 'variable', v_variable),
      jsonb_build_object('pf', v_pf, 'pt', v_pt, 'tds', v_tds_monthly, 'lop', v_lop_deduction),
      v_gross, v_net,
      v_pf, v_pt, v_tds_monthly,
      v_lwp_days, v_lop_deduction,
      1, 'active'
    ) ON CONFLICT (employee_id, cycle_id, version) DO NOTHING;

    v_total_employees := v_total_employees + 1;
    v_total_gross := v_total_gross + v_gross;
    v_total_net := v_total_net + v_net;
    v_total_pf := v_total_pf + v_pf;
    v_total_tds := v_total_tds + v_tds_monthly;
  END LOOP;

  -- 8. Finalize Cycle Totals
  UPDATE payroll_cycles SET
    total_employees = v_total_employees,
    total_gross = v_total_gross,
    total_net = v_total_net,
    total_pf = v_total_pf,
    total_tds = v_total_tds
  WHERE id = v_cycle_id;

  RETURN jsonb_build_object(
    'success', true,
    'cycle_id', v_cycle_id,
    'month', p_month,
    'year', p_year,
    'total_employees', v_total_employees,
    'total_gross', v_total_gross,
    'total_net', v_total_net
  );
END;
$$;

-- ============================================================================
-- 4. MONTHLY LEAVE ACCRUAL (+1.5 PL) & ANNIVERSARY BONUS ENGINE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accrue_monthly_leaves_and_anniversaries()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  FOR v_emp IN SELECT id, name, date_of_joining FROM profiles WHERE status = 'active' LOOP
    -- Get Current Balance
    SELECT COALESCE(balance_after, 0) INTO v_current_bal
    FROM leave_ledgers
    WHERE user_id = v_emp.id AND leave_type = 'paid_leave'
    ORDER BY created_at DESC LIMIT 1;

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
    IF (v_tenure->>'is_anniversary_month')::BOOLEAN = true THEN
      -- Grant 2.0 Bonus Loyalty Leaves for completing full year milestone
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
$$;

-- ============================================================================
-- 5. FISCAL YEAR RESET SUB-ROUTINE (April 1st Carry-Forward / Lapse Policy)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_fiscal_year_reset(p_new_fiscal_year INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_carry_forward CONSTANT NUMERIC := 15.00;
  v_emp RECORD;
  v_current_bal NUMERIC;
  v_carry_forward NUMERIC;
  v_lapsed NUMERIC;
  v_processed_count INT := 0;
BEGIN
  FOR v_emp IN SELECT id FROM profiles WHERE status = 'active' LOOP
    SELECT COALESCE(balance_after, 0) INTO v_current_bal
    FROM leave_ledgers
    WHERE user_id = v_emp.id AND leave_type = 'paid_leave'
    ORDER BY created_at DESC LIMIT 1;

    IF v_current_bal > 0 THEN
      v_carry_forward := LEAST(v_current_bal, v_max_carry_forward);
      v_lapsed := GREATEST(0, v_current_bal - v_max_carry_forward);

      -- Record lapse if balance exceeded maximum
      IF v_lapsed > 0 THEN
        INSERT INTO leave_ledgers (
          user_id, transaction_type, leave_type, amount, balance_after,
          fiscal_year, notes
        ) VALUES (
          v_emp.id, 'fiscal_lapse', 'paid_leave', -v_lapsed, v_carry_forward,
          p_new_fiscal_year, format('Lapsed %s days exceeding FY carry-forward cap', v_lapsed)
        );
      END IF;

      -- Carry forward record
      INSERT INTO leave_ledgers (
        user_id, transaction_type, leave_type, amount, balance_after,
        fiscal_year, notes
      ) VALUES (
        v_emp.id, 'carry_forward', 'paid_leave', 0.00, v_carry_forward,
        p_new_fiscal_year, format('Carried forward %s days into FY %s', v_carry_forward, p_new_fiscal_year)
      );
      v_processed_count := v_processed_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'fiscal_year', p_new_fiscal_year, 'employees_processed', v_processed_count);
END;
$$;

-- ============================================================================
-- 6. DAILY ABSENTEE AUTO-FLAGGING (10:00 AM Weekday Attendance Check)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.flag_daily_absentees()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_emp RECORD;
  v_has_clocked_in BOOLEAN;
  v_has_approved_leave BOOLEAN;
  v_flagged_count INT := 0;
BEGIN
  -- Skip Saturday and Sunday (6 and 0 in DOW)
  IF EXTRACT(DOW FROM v_today) IN (0, 6) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Weekend: Attendance check skipped', 'flagged_count', 0);
  END IF;

  FOR v_emp IN SELECT id, name FROM profiles WHERE status = 'active' AND LOWER(role) NOT IN ('candidate') LOOP
    -- Check if clocked in today
    SELECT EXISTS (
      SELECT 1 FROM work_logs
      WHERE user_id = v_emp.id
        AND (date = v_today OR clock_in::DATE = v_today)
    ) INTO v_has_clocked_in;

    -- Check if approved leave exists for today
    SELECT EXISTS (
      SELECT 1 FROM leaves
      WHERE user_id = v_emp.id
        AND status = 'Approved'
        AND start_date <= v_today
        AND end_date >= v_today
    ) INTO v_has_approved_leave;

    -- If neither clocked in nor on approved leave, insert flagged attendance
    IF NOT v_has_clocked_in AND NOT v_has_approved_leave THEN
      INSERT INTO work_logs (
        user_id, date, status, notes, work_location
      ) VALUES (
        v_emp.id, v_today, 'Unmarked / Absent',
        'Auto-flagged by Corporate Clock: No clock-in or approved leave by 10:00 AM UTC',
        'OFFICE'
      );
      v_flagged_count := v_flagged_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'date', v_today,
    'flagged_absentees', v_flagged_count
  );
END;
$$;

-- ============================================================================
-- 7. PG_CRON SCHEDULES (Safe conditional registration)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 1st of every month: Idempotent Payroll Run
    PERFORM cron.schedule(
      'corporate-monthly-payroll',
      '0 0 1 * *',
      'SELECT public.auto_process_monthly_payroll_idempotent(EXTRACT(MONTH FROM now())::INT, EXTRACT(YEAR FROM now())::INT);'
    );

    -- 1st of every month: Monthly Leave Accrual
    PERFORM cron.schedule(
      'corporate-monthly-leave-accrual',
      '0 0 1 * *',
      'SELECT public.accrue_monthly_leaves_and_anniversaries();'
    );

    -- Mon-Fri at 10:00 AM UTC: Daily Absentee Auto-Flagging
    PERFORM cron.schedule(
      'corporate-daily-absentee-scan',
      '0 10 * * 1-5',
      'SELECT public.flag_daily_absentees();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Handled silently if pg_cron extension schema is restricted
    RAISE NOTICE 'pg_cron extension not accessible; PL/pgSQL routines remain callable via API scheduler.';
END $$;

COMMIT;
