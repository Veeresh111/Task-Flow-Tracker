-- Fix leaves column reference in auto_process_monthly_payroll_idempotent

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
    BEGIN
      SELECT COALESCE(SUM(
        GREATEST(1, (LEAST(end_date::DATE, (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE) - GREATEST(start_date::DATE, MAKE_DATE(p_year, p_month, 1)) + 1))
      ), 0)::INT INTO v_lwp_days
      FROM leaves
      WHERE user_id = v_emp.id
        AND status = 'Approved'
        AND (
          LOWER(COALESCE(leave_type, '')) IN ('unpaid', 'unpaid_leave', 'lwp', 'lop')
        )
        AND start_date::DATE <= (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE
        AND end_date::DATE >= MAKE_DATE(p_year, p_month, 1);
    EXCEPTION
      WHEN OTHERS THEN
        v_lwp_days := 0;
    END;

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
