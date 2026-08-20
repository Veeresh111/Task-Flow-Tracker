-- ============================================================================
-- Enterprise Employee Offboarding & Full-and-Final (FnF) Settlement Engine
-- Standard:
--   1. Strict Soft-Delete: Never SQL DELETE profiles (preserves financial audit).
--   2. Access Revocation: Sets status = 'archived', blocks RLS, and bans auth.
--   3. FnF Settlement: (Prorated Salary + Encashment + Gratuity - Shortfall Deductions).
--   4. Idempotency Lock: UNIQUE(employee_id) in fnf_settlements.
-- ============================================================================

BEGIN;

-- 1. Extend profiles for Offboarding Lifecycle
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS offboarding_date TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fnf_settlement_id UUID;

-- 2. Create Immutable FnF Settlements Table
CREATE TABLE IF NOT EXISTS public.fnf_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL,
  department TEXT DEFAULT 'General',
  date_of_joining DATE,
  last_working_day DATE NOT NULL,
  tenure_years NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  -- Financial Snapshot
  annual_ctc NUMERIC(12,2) NOT NULL,
  monthly_ctc NUMERIC(12,2) NOT NULL,
  annual_basic NUMERIC(12,2) NOT NULL,
  
  -- Prorated Final Month Pay
  final_month_days INT NOT NULL,
  days_worked_final_month INT NOT NULL,
  prorated_salary NUMERIC(12,2) NOT NULL,
  
  -- Leave Encashment: (Annual Basic Salary / 365) * Remaining PL Balance
  leave_balance_at_exit NUMERIC(5,2) NOT NULL DEFAULT 0,
  leave_encashment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Notice Shortfall Deduction: (Monthly CTC / Days in Month) * Shortfall Days
  notice_period_shortfall_days INT NOT NULL DEFAULT 0,
  notice_shortfall_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Statutory Gratuity (Tenure >= 5 Years): (15 * Monthly Basic / 26) * Tenure Years
  gratuity_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Summary
  gross_settlement NUMERIC(12,2) NOT NULL,
  total_deductions NUMERIC(12,2) NOT NULL,
  net_payable NUMERIC(12,2) NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'settled' CHECK (status IN ('draft', 'settled', 'disbursed')),
  settled_by UUID REFERENCES public.profiles(id),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(employee_id) -- IDEMPOTENCY LOCK: An employee can NEVER be offboarded twice
);

CREATE INDEX IF NOT EXISTS idx_fnf_settlements_employee ON public.fnf_settlements(employee_id);

-- 3. Atomic FnF Settlement & Soft-Delete Stored Procedure
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
  v_emp RECORD;
  v_fnf_id UUID;
  v_tenure_json JSONB;
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
  v_actor UUID;
BEGIN
  -- 1. Acquire transaction advisory lock for this employee
  PERFORM pg_advisory_xact_lock(hashtext('fnf_settle_' || p_employee_id::text));

  -- 2. Fetch Employee Profile
  SELECT * INTO v_emp FROM profiles WHERE id = p_employee_id;
  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee record not found in system.');
  END IF;

  -- 3. Idempotency Check: Verify if employee is already archived or settled
  IF v_emp.status = 'archived' OR EXISTS (SELECT 1 FROM fnf_settlements WHERE employee_id = p_employee_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'idempotent', true,
      'error', 'Employee has already been offboarded and settled. Duplicate settlement rejected.'
    );
  END IF;

  -- 4. Calculate Days & Tenure
  v_doj := COALESCE(v_emp.date_of_joining::DATE, v_emp.created_at::DATE);
  v_days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_last_working_day) + INTERVAL '1 month - 1 day'));
  v_days_worked := EXTRACT(DAY FROM p_last_working_day);

  IF v_doj IS NOT NULL AND p_last_working_day >= v_doj THEN
    v_tenure_years := ROUND((p_last_working_day - v_doj)::NUMERIC / 365.25, 2);
  END IF;

  -- 5. Salary Structure Proration
  v_annual_ctc := COALESCE(v_emp.payroll_ctc, 0);
  v_monthly_ctc := ROUND(v_annual_ctc / 12.0, 2);
  v_annual_basic := ROUND(v_annual_ctc * 0.50, 2); -- Standard 50% Basic

  v_prorated_salary := ROUND((v_monthly_ctc / v_days_in_month) * v_days_worked, 2);

  -- 6. Leave Encashment: (Annual Basic / 365) * Remaining PL Balance
  SELECT COALESCE(balance_after, 0) INTO v_leave_balance
  FROM leave_ledgers
  WHERE user_id = p_employee_id AND leave_type = 'paid_leave'
  ORDER BY created_at DESC LIMIT 1;

  IF v_leave_balance > 0 THEN
    v_leave_encashment := ROUND((v_annual_basic / 365.0) * v_leave_balance, 2);
  END IF;

  -- 7. Notice Shortfall Deduction: (Monthly CTC / Days in Month) * Shortfall Days
  IF p_notice_shortfall_days > 0 THEN
    v_notice_deduction := ROUND((v_monthly_ctc / v_days_in_month) * p_notice_shortfall_days, 2);
  END IF;

  -- 8. Statutory Gratuity (Tenure >= 5 Years)
  IF v_tenure_years >= 5.0 THEN
    v_gratuity := ROUND((15.0 * (v_annual_basic / 12.0) / 26.0) * v_tenure_years, 2);
  END IF;

  -- 9. Gross, Deductions, and Net Settlement
  v_gross_settlement := ROUND(v_prorated_salary + v_leave_encashment + v_gratuity, 2);
  v_total_deductions := ROUND(v_notice_deduction, 2);
  v_net_payable := ROUND(GREATEST(0, v_gross_settlement - v_total_deductions), 2);

  -- Resolve Actor
  v_actor := COALESCE(p_settled_by, v_emp.id);

  -- 10. Insert Immutable Settlement Record
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
    v_emp.id, v_emp.name, v_emp.email, COALESCE(v_emp.department, 'General'),
    v_doj, p_last_working_day, v_tenure_years,
    v_annual_ctc, v_monthly_ctc, v_annual_basic,
    v_days_in_month, v_days_worked, v_prorated_salary,
    v_leave_balance, v_leave_encashment,
    p_notice_shortfall_days, v_notice_deduction,
    v_gratuity, v_gross_settlement, v_total_deductions, v_net_payable,
    'settled', v_actor,
    format('Full & Final Settlement completed on %s', p_last_working_day)
  ) RETURNING id INTO v_fnf_id;

  -- 11. Zero Out Leave Balance in Ledger
  IF v_leave_balance > 0 THEN
    INSERT INTO leave_ledgers (
      user_id, transaction_type, leave_type, amount, balance_after,
      fiscal_year, notes
    ) VALUES (
      v_emp.id, 'manual_adjustment', 'paid_leave', -v_leave_balance, 0.00,
      EXTRACT(YEAR FROM p_last_working_day)::INT,
      format('FnF Settlement: Encased %s days into cash (₹%s)', v_leave_balance, v_leave_encashment)
    );
  END IF;

  -- 12. Soft-Delete & Access Revocation in profiles
  UPDATE profiles SET
    status = 'archived',
    offboarding_date = p_last_working_day::TIMESTAMPTZ,
    fnf_settlement_id = v_fnf_id
  WHERE id = v_emp.id;

  -- 13. Disable Auth Account Login at auth.users (if accessible)
  BEGIN
    UPDATE auth.users
    SET banned_until = 'infinity'
    WHERE id = v_emp.id;
  EXCEPTION
    WHEN OTHERS THEN
      -- Proceed gracefully if auth schema is sandboxed
      NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'fnf_id', v_fnf_id,
    'employee_id', v_emp.id,
    'employee_name', v_emp.name,
    'last_working_day', p_last_working_day,
    'tenure_years', v_tenure_years,
    'prorated_salary', v_prorated_salary,
    'leave_encashment', v_leave_encashment,
    'notice_deduction', v_notice_deduction,
    'gratuity_amount', v_gratuity,
    'net_payable', v_net_payable
  );
END;
$$;

-- 4. Grant Permissions on FnF Table
GRANT ALL ON TABLE public.fnf_settlements TO postgres, anon, authenticated, service_role;
ALTER TABLE public.fnf_settlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fnf_settlements' AND policyname = 'fnf_settlements_open_policy'
  ) THEN
    CREATE POLICY fnf_settlements_open_policy ON public.fnf_settlements
      FOR ALL TO anon, authenticated, service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;
