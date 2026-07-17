-- ============================================================
-- Auto-Generate Payroll (Cron-Enabled Wrapper)
--
-- Purpose: Provides a service-role-safe entry point for
--          automated monthly payroll generation (triggered by
--          Supabase cron or external scheduler on the 1st).
--
-- Design:
--   1. Same core logic as process_monthly_payroll().
--   2. Does NOT require auth.uid() — uses a fixed system UUID
--      for audit trail so cron jobs (no user context) can work.
--   3. The original process_monthly_payroll() is UNCHANGED for
--      manual HR-triggered generation.
--   4. Duplicate cycle prevention is inherited (same payroll_cycles
--      UNIQUE constraint + advisory lock).
-- ============================================================

-- System user UUID for automated operations
-- This UUID represents the "system/automation" identity in audit logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = '00000000-0000-0000-0000-000000000000') THEN
    INSERT INTO profiles (id, full_name, email, role, status, department)
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      'System Automation',
      'system@flowtracker.internal',
      'admin',
      'active',
      'System'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_generate_monthly_payroll(
  p_month INT,
  p_year INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_id CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  v_cycle_id UUID;
  v_structure_id UUID;
  v_basic_pct NUMERIC;
  v_hra_pct NUMERIC;
  v_lta_pct NUMERIC;
  v_special_pct NUMERIC;
  v_variable_pct NUMERIC;
  v_pt_amount NUMERIC;
  v_employee RECORD;
  v_monthly_ctc NUMERIC;
  v_basic NUMERIC;
  v_hra NUMERIC;
  v_lta NUMERIC;
  v_special NUMERIC;
  v_variable NUMERIC;
  v_gross NUMERIC;
  v_pf NUMERIC;
  v_pt NUMERIC;
  v_tds_annual NUMERIC;
  v_tds_monthly NUMERIC;
  v_total_deductions NUMERIC;
  v_net NUMERIC;
  v_earnings_json JSONB;
  v_deductions_json JSONB;
  v_total_employees INT := 0;
  v_total_gross NUMERIC := 0;
  v_total_net NUMERIC := 0;
  v_total_pf NUMERIC := 0;
  v_total_tds NUMERIC := 0;
  v_errors TEXT[] := '{}';
  v_idx INT := 0;
BEGIN
  -- === Validate inputs ===
  IF p_month < 1 OR p_month > 12 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid month');
  END IF;
  IF p_year < 2000 OR p_year > 2100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid year');
  END IF;

  -- === Prevent duplicate cycles (EV-PAY-002) ===
  IF EXISTS (SELECT 1 FROM payroll_cycles WHERE month = p_month AND year = p_year) THEN
    INSERT INTO payroll_audit (evidence_code, entity, action, performed_by, details)
    VALUES ('EV-PAY-002', 'payroll_cycles', 'DUPLICATE_PREVENTED', v_system_id,
      jsonb_build_object('month', p_month, 'year', p_year, 'source', 'auto_generate'));
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payroll cycle already exists for this period',
      'evidence_code', 'EV-PAY-002'
    );
  END IF;

  -- === Load default salary structure ===
  SELECT id INTO v_structure_id FROM salary_structures WHERE is_default = true LIMIT 1;
  IF v_structure_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No default salary structure configured');
  END IF;

  -- Load component percentages
  SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'BASIC'), 50) INTO v_basic_pct;
  SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'HRA'), 20) INTO v_hra_pct;
  SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'LTA'), 10) INTO v_lta_pct;
  SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'SPECIAL'), 10) INTO v_special_pct;
  SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'VARIABLE'), 10) INTO v_variable_pct;
  SELECT COALESCE((SELECT value FROM salary_components WHERE structure_id = v_structure_id AND name = 'PT'), 200) INTO v_pt_amount;

  -- === Create cycle (status = 'generated') ===
  INSERT INTO payroll_cycles (month, year, status, generated_by)
  VALUES (p_month, p_year, 'generated', v_system_id)
  RETURNING id INTO v_cycle_id;

  -- === Advisory lock: prevent concurrent generation for same period ===
  PERFORM pg_advisory_xact_lock(hashtext('payroll_gen_' || p_month || '_' || p_year));

  -- === Process all active employees with salary ===
  FOR v_employee IN
    SELECT id, payroll_ctc, full_name, email, department
    FROM profiles
    WHERE status = 'active'
      AND payroll_ctc IS NOT NULL
      AND payroll_ctc > 0
      AND (employment_status IS NULL OR employment_status != 'terminated')
    ORDER BY id
  LOOP
    v_idx := v_idx + 1;

    BEGIN
      v_monthly_ctc := payroll_round(v_employee.payroll_ctc / 12);

      v_basic := payroll_round(v_monthly_ctc * (v_basic_pct / 100));
      v_hra := payroll_round(v_monthly_ctc * (v_hra_pct / 100));
      v_lta := payroll_round(v_monthly_ctc * (v_lta_pct / 100));
      v_special := payroll_round(v_monthly_ctc * (v_special_pct / 100));
      v_variable := payroll_round(v_monthly_ctc * (v_variable_pct / 100));

      v_gross := payroll_round(v_basic + v_hra + v_lta + v_special + v_variable);

      v_pf := public.calculate_pf(v_basic);
      v_pt := v_pt_amount;
      v_tds_annual := public.calculate_tds(v_employee.payroll_ctc);
      v_tds_monthly := payroll_round(v_tds_annual / 12);

      v_total_deductions := payroll_round(v_pf + v_pt + v_tds_monthly);
      v_net := payroll_round(v_gross - v_total_deductions);

      v_earnings_json := jsonb_build_object(
        'basic', v_basic,
        'hra', v_hra,
        'lta', v_lta,
        'special', v_special,
        'variable', v_variable
      );

      v_deductions_json := jsonb_build_object(
        'pf', v_pf,
        'pt', v_pt,
        'tds', v_tds_monthly
      );

      INSERT INTO payslips (
        employee_id, cycle_id,
        employee_name, employee_email, employee_department,
        annual_ctc, monthly_ctc,
        earnings, deductions, gross, net,
        pf_amount, pt_amount, tds_amount
      ) VALUES (
        v_employee.id, v_cycle_id,
        v_employee.full_name, v_employee.email, v_employee.department,
        v_employee.payroll_ctc, v_monthly_ctc,
        v_earnings_json, v_deductions_json, v_gross, v_net,
        v_pf, v_pt, v_tds_monthly
      );

      v_total_employees := v_total_employees + 1;
      v_total_gross := v_total_gross + v_gross;
      v_total_net := v_total_net + v_net;
      v_total_pf := v_total_pf + v_pf;
      v_total_tds := v_total_tds + v_tds_monthly;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Employee ' || v_employee.id || ': ' || SQLERRM);
    END;
  END LOOP;

  -- If ALL rows failed, roll back
  IF v_total_employees = 0 THEN
    RAISE EXCEPTION 'All payslip rows failed validation. Errors: %', array_to_string(v_errors, '; ');
  END IF;

  -- Update cycle totals
  UPDATE payroll_cycles SET
    total_employees = v_total_employees,
    total_gross = v_total_gross,
    total_net = v_total_net,
    total_pf = v_total_pf,
    total_tds = v_total_tds
  WHERE id = v_cycle_id;

  -- Audit log (EV-PAY-001)
  INSERT INTO payroll_audit (evidence_code, entity, entity_id, action, performed_by, details)
  VALUES (
    'EV-PAY-001', 'payroll_cycles', v_cycle_id, 'AUTO_PAYROLL_GENERATED', v_system_id,
    jsonb_build_object(
      'month', p_month,
      'year', p_year,
      'employees_generated', v_total_employees,
      'failed_rows', v_errors,
      'total_gross', v_total_gross,
      'total_net', v_total_net,
      'total_pf', v_total_pf,
      'total_tds', v_total_tds,
      'source', 'auto_generate'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'evidence_code', 'EV-PAY-001',
    'cycle_id', v_cycle_id,
    'employees_generated', v_total_employees,
    'failed_rows', v_errors,
    'total_gross', v_total_gross,
    'total_net', v_total_net,
    'total_pf', v_total_pf,
    'total_tds', v_total_tds
  );
END;
$$;

-- Grant execute to service_role (for cron edge function)
REVOKE EXECUTE ON FUNCTION public.auto_generate_monthly_payroll(INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_generate_monthly_payroll(INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_generate_monthly_payroll(INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_monthly_payroll(INT, INT) TO service_role;
