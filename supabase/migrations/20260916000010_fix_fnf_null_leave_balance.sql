-- Migration: 20260916000010_fix_fnf_null_leave_balance.sql
-- Fix: ensure v_leave_balance is NEVER null when leave_ledgers has 0 rows for new employees

CREATE OR REPLACE FUNCTION public.process_employee_fnf_settlement(
  p_employee_id UUID,
  p_last_working_day DATE,
  p_notice_shortfall_days INT DEFAULT 0,
  p_settled_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := COALESCE(p_settled_by, auth.uid());
  v_caller_role TEXT;
  v_emp RECORD;
  v_fnf_id UUID;
  v_tenure_years NUMERIC(5,2) := 0;
  v_doj DATE;
  
  v_days_in_month INT;
  v_days_worked INT;
  v_annual_ctc NUMERIC(12,2);
  v_monthly_ctc NUMERIC(12,2);
  v_annual_basic NUMERIC(12,2);
  v_prorated_salary NUMERIC(12,2);
  
  v_leave_balance NUMERIC(5,2) := 0;
  v_leave_encashment NUMERIC(12,2) := 0;
  v_notice_deduction NUMERIC(12,2) := 0;
  v_gratuity NUMERIC(12,2) := 0;
  v_gross_settlement NUMERIC(12,2);
  v_total_deductions NUMERIC(12,2);
  v_net_payable NUMERIC(12,2);
BEGIN
  -- RBAC CHECK: Verify Caller is Admin or HR
  IF v_caller_id IS NOT NULL THEN
    SELECT LOWER(role) INTO v_caller_role FROM profiles WHERE id = v_caller_id AND status != 'archived';
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'hr') THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 403,
        'error', '403 Forbidden: Only Admin or HR roles may process Full-and-Final Settlements.'
      );
    END IF;
  END IF;

  -- Advisory Lock
  PERFORM pg_advisory_xact_lock(hashtext('fnf_settle_' || p_employee_id::text));

  -- Fetch Target Employee
  SELECT * INTO v_emp FROM profiles WHERE id = p_employee_id;
  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 404, 'error', 'Employee record not found.');
  END IF;

  -- Idempotency Check
  IF v_emp.status = 'archived' OR EXISTS (SELECT 1 FROM fnf_settlements WHERE employee_id = p_employee_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 409,
      'idempotent', true,
      'error', 'Employee has already been offboarded and settled. Duplicate settlement rejected.'
    );
  END IF;

  -- Days & Tenure (Use employment_start_date with fallback to created_at)
  v_doj := COALESCE(v_emp.employment_start_date::DATE, v_emp.created_at::DATE);
  v_days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_last_working_day) + INTERVAL '1 month - 1 day'));
  v_days_worked := EXTRACT(DAY FROM p_last_working_day);
  
  IF v_doj IS NOT NULL AND p_last_working_day >= v_doj THEN
    v_tenure_years := ROUND((p_last_working_day - v_doj)::NUMERIC / 365.25, 2);
  END IF;

  -- Financial Calculations
  v_annual_ctc := COALESCE(v_emp.payroll_ctc, 0.00);
  v_monthly_ctc := ROUND(v_annual_ctc / 12.0, 2);
  v_annual_basic := ROUND(v_annual_ctc * 0.50, 2); -- 50% Basic

  -- 1. Prorated Final Month Salary
  IF v_days_in_month > 0 THEN
    v_prorated_salary := ROUND((v_monthly_ctc / v_days_in_month) * v_days_worked, 2);
  ELSE
    v_prorated_salary := 0.00;
  END IF;

  -- 2. Leave Encashment (Null-safe guard if employee has 0 leave_ledger transactions)
  SELECT COALESCE(balance_after, 0.00) INTO v_leave_balance
  FROM leave_ledgers
  WHERE user_id = p_employee_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_leave_balance := COALESCE(v_leave_balance, 0.00);

  IF v_leave_balance > 0 THEN
    v_leave_encashment := ROUND((v_annual_basic / 365.0) * v_leave_balance, 2);
  ELSE
    v_leave_encashment := 0.00;
  END IF;

  -- 3. Notice Period Shortfall Deduction
  IF p_notice_shortfall_days > 0 AND v_days_in_month > 0 THEN
    v_notice_deduction := ROUND((v_monthly_ctc / v_days_in_month) * p_notice_shortfall_days, 2);
  END IF;

  -- 4. Statutory Gratuity (Tenure >= 5 Years)
  IF v_tenure_years >= 5.0 THEN
    v_gratuity := ROUND((15.0 * (v_annual_basic / 12.0) / 26.0) * v_tenure_years, 2);
  END IF;

  -- Summary
  v_gross_settlement := v_prorated_salary + v_leave_encashment + v_gratuity;
  v_total_deductions := v_notice_deduction;
  v_net_payable := GREATEST(0.00, v_gross_settlement - v_total_deductions);

  -- Insert FnF Settlement Snapshot
  INSERT INTO fnf_settlements (
    employee_id, employee_name, employee_email, department,
    date_of_joining, last_working_day, tenure_years,
    annual_ctc, monthly_ctc, annual_basic,
    final_month_days, days_worked_final_month, prorated_salary,
    leave_balance_at_exit, leave_encashment_amount,
    notice_period_shortfall_days, notice_shortfall_deduction,
    gratuity_amount, gross_settlement, total_deductions, net_payable,
    status, settled_by, notes
  ) VALUES (
    v_emp.id, COALESCE(v_emp.name, 'Employee'), v_emp.email, COALESCE(v_emp.department, 'Engineering'),
    v_doj, p_last_working_day, v_tenure_years,
    v_annual_ctc, v_monthly_ctc, v_annual_basic,
    v_days_in_month, v_days_worked, v_prorated_salary,
    v_leave_balance, v_leave_encashment,
    p_notice_shortfall_days, v_notice_deduction,
    v_gratuity, v_gross_settlement, v_total_deductions, v_net_payable,
    'settled', v_caller_id,
    format('Full & Final Settlement completed on %s', p_last_working_day)
  ) RETURNING id INTO v_fnf_id;

  -- Soft-Delete / Archive Profile
  UPDATE profiles SET
    status = 'inactive',
    employment_status = 'offboarded',
    offboarding_date = p_last_working_day::TIMESTAMPTZ,
    fnf_settlement_id = v_fnf_id
  WHERE id = v_emp.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 200,
    'fnf_id', v_fnf_id,
    'employee_id', v_emp.id,
    'employee_name', v_emp.name,
    'last_working_day', p_last_working_day,
    'prorated_salary', v_prorated_salary,
    'leave_encashment', v_leave_encashment,
    'notice_deduction', v_notice_deduction,
    'net_payable', v_net_payable
  );
END;
$$;
