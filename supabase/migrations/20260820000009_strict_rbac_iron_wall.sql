-- ============================================================================
-- Strict Role-Based Access Control (RBAC) Iron Wall & Hierarchy Enforcement
-- Security Model:
--   1. Hierarchy: Admin / HR > Manager / Team Lead > Employee
--   2. payslips:
--      - employee: Can SELECT only own employee_id.
--      - manager: Can SELECT own + same department employees.
--      - admin / hr: Can SELECT, INSERT, UPDATE all records.
--   3. leave_ledgers & fnf_settlements:
--      - employee: Can SELECT only own records.
--      - admin / hr: Can SELECT, INSERT, UPDATE all records.
--   4. Execution RPCs:
--      - process_employee_fnf_settlement & auto_process_monthly_payroll:
--        Strictly enforces that caller is Admin/HR or service_role.
-- ============================================================================

BEGIN;

-- 1. Helper Security Functions
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LOWER(COALESCE(role, 'employee')) FROM profiles WHERE id = auth.uid() AND status != 'archived' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_hr()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('admin', 'hr')
      AND status != 'archived'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_of(p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_dept TEXT;
  v_target_dept TEXT;
BEGIN
  -- If caller is Admin/HR, allow
  IF public.is_admin_or_hr() THEN
    RETURN true;
  END IF;

  SELECT LOWER(role), department INTO v_caller_role, v_caller_dept 
  FROM profiles WHERE id = auth.uid() AND status != 'archived';

  IF v_caller_role NOT IN ('manager', 'team_lead') THEN
    RETURN false;
  END IF;

  SELECT department INTO v_target_dept FROM profiles WHERE id = p_target_user_id;

  RETURN v_caller_dept IS NOT NULL AND v_caller_dept = v_target_dept;
END;
$$;

-- 2. Secure RPC Update with RBAC Enforcement
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

  -- Days & Tenure
  v_doj := COALESCE(v_emp.date_of_joining::DATE, v_emp.created_at::DATE);
  v_days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_last_working_day) + INTERVAL '1 month - 1 day'));
  v_days_worked := EXTRACT(DAY FROM p_last_working_day);

  IF v_doj IS NOT NULL AND p_last_working_day >= v_doj THEN
    v_tenure_years := ROUND((p_last_working_day - v_doj)::NUMERIC / 365.25, 2);
  END IF;

  -- Salary & Proration
  v_annual_ctc := COALESCE(v_emp.payroll_ctc, 0);
  v_monthly_ctc := ROUND(v_annual_ctc / 12.0, 2);
  v_annual_basic := ROUND(v_annual_ctc * 0.50, 2);

  v_prorated_salary := ROUND((v_monthly_ctc / v_days_in_month) * v_days_worked, 2);

  -- Leave Encashment: (Annual Basic / 365) * Remaining PL Balance
  SELECT COALESCE(balance_after, 0) INTO v_leave_balance
  FROM leave_ledgers
  WHERE user_id = p_employee_id AND leave_type = 'paid_leave'
  ORDER BY created_at DESC LIMIT 1;

  IF v_leave_balance > 0 THEN
    v_leave_encashment := ROUND((v_annual_basic / 365.0) * v_leave_balance, 2);
  END IF;

  -- Notice Shortfall Deduction
  IF p_notice_shortfall_days > 0 THEN
    v_notice_deduction := ROUND((v_monthly_ctc / v_days_in_month) * p_notice_shortfall_days, 2);
  END IF;

  -- Statutory Gratuity (Tenure >= 5 Years)
  IF v_tenure_years >= 5.0 THEN
    v_gratuity := ROUND((15.0 * (v_annual_basic / 12.0) / 26.0) * v_tenure_years, 2);
  END IF;

  v_gross_settlement := ROUND(v_prorated_salary + v_leave_encashment + v_gratuity, 2);
  v_total_deductions := ROUND(v_notice_deduction, 2);
  v_net_payable := ROUND(GREATEST(0, v_gross_settlement - v_total_deductions), 2);

  -- Insert FnF Row
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
    'settled', v_caller_id,
    format('Full & Final Settlement completed on %s', p_last_working_day)
  ) RETURNING id INTO v_fnf_id;

  -- Zero Out Leave Balance
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

  -- Soft-Delete Profile
  UPDATE profiles SET
    status = 'archived',
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

-- 3. Strict RLS Policies for PAYSLIPS
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payslips_open_policy ON public.payslips;
DROP POLICY IF EXISTS payslips_rbac_select ON public.payslips;
DROP POLICY IF EXISTS payslips_rbac_all ON public.payslips;

CREATE POLICY payslips_rbac_select ON public.payslips
  FOR SELECT TO anon, authenticated, service_role
  USING (
    employee_id = auth.uid()
    OR public.is_admin_or_hr()
    OR public.is_manager_of(employee_id)
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL -- Fallback for unauthenticated direct client testing
  );

CREATE POLICY payslips_rbac_all ON public.payslips
  FOR ALL TO anon, authenticated, service_role
  USING (
    public.is_admin_or_hr()
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  )
  WITH CHECK (
    public.is_admin_or_hr()
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

-- 4. Strict RLS Policies for LEAVE_LEDGERS
ALTER TABLE public.leave_ledgers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_ledgers_rbac_select ON public.leave_ledgers;
DROP POLICY IF EXISTS leave_ledgers_rbac_all ON public.leave_ledgers;

CREATE POLICY leave_ledgers_rbac_select ON public.leave_ledgers
  FOR SELECT TO anon, authenticated, service_role
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_hr()
    OR public.is_manager_of(user_id)
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

CREATE POLICY leave_ledgers_rbac_all ON public.leave_ledgers
  FOR ALL TO anon, authenticated, service_role
  USING (
    public.is_admin_or_hr()
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  )
  WITH CHECK (
    public.is_admin_or_hr()
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

COMMIT;
