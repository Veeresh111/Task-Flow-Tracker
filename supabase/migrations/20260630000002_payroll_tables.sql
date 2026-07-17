-- ============================================================
-- Phase 2A.5: Enterprise Payroll Foundation (Revision 2)
--
-- Key design decisions:
--   1. RPC is the SINGLE source of truth for payroll calculation.
--      Frontend never decides salary — it only previews.
--   2. All calculation logic is embedded in the RPC (PL/pgSQL).
--      JS payroll.ts is preview-only.
--   3. Attendance-ready fields (LOP, OT, bonus, incentive).
--   4. Full multi-step approval workflow (generated→verified→
--      finance_approved→hr_approved→released).
--   5. Enhanced audit with entity, old/new values, evidence codes.
--   6. Salary structure supports percentage, fixed, and formula
--      calculation types.
--   7. Every important operation emits evidence codes (EV-PAY-*)
--      for future Enterprise Validation Platform integration.
-- ============================================================

-- ============================================================
-- 1. SALARY STRUCTURES (configurable, extensible)
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual salary components (extensible)
CREATE TABLE IF NOT EXISTS salary_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id UUID NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- e.g. 'BASIC', 'HRA', 'PF', 'PT', 'TDS'
  category TEXT NOT NULL CHECK (category IN ('earning', 'deduction')),
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('percentage', 'fixed', 'formula')),
  -- For percentage type: the percentage of monthly CTC (e.g. 50 for BASIC)
  -- For fixed type: the fixed amount (e.g. 200 for PT)
  -- For formula type: not used (logic is in the RPC)
  value NUMERIC DEFAULT 0,
  formula_name TEXT,            -- e.g. 'pf_capped', 'tds_slab' for formula types
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE(structure_id, name)
);

-- Insert default Standard Indian IT structure
INSERT INTO salary_structures (name, is_default)
VALUES ('Standard Indian IT Structure', true)
ON CONFLICT DO NOTHING;

-- Insert default components (only if the structure was just inserted)
INSERT INTO salary_components (structure_id, name, category, calculation_type, value, sort_order)
SELECT s.id, c.name, c.category, c.calculation_type, c.value, c.sort_order
FROM salary_structures s
CROSS JOIN (VALUES
  ('BASIC', 'earning', 'percentage', 50, 1),
  ('HRA', 'earning', 'percentage', 20, 2),
  ('LTA', 'earning', 'percentage', 10, 3),
  ('SPECIAL', 'earning', 'percentage', 10, 4),
  ('VARIABLE', 'earning', 'percentage', 10, 5),
  ('PF', 'deduction', 'formula', 0, 6),
  ('PT', 'deduction', 'fixed', 200, 7),
  ('TDS', 'deduction', 'formula', 0, 8)
) AS c(name, category, calculation_type, value, sort_order)
WHERE s.is_default = true
AND NOT EXISTS (SELECT 1 FROM salary_components sc WHERE sc.structure_id = s.id);

-- ============================================================
-- 2. SALARY REVISIONS (immutable CTC change history)
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_ctc NUMERIC,
  new_ctc NUMERIC NOT NULL,
  effective_from DATE NOT NULL,
  revised_by UUID REFERENCES profiles(id),
  reason TEXT,
  evidence_code TEXT DEFAULT 'EV-PAY-003',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_revisions_employee ON salary_revisions(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_revisions_effective ON salary_revisions(effective_from DESC);

-- ============================================================
-- 3. PAYROLL CYCLES (multi-step approval workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL,
  -- Full approval workflow: draft → generated → verified → finance_approved → hr_approved → released
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generated','verified','finance_approved','hr_approved','released')),
  generated_by UUID REFERENCES profiles(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  finance_approved_by UUID REFERENCES profiles(id),
  finance_approved_at TIMESTAMPTZ,
  hr_approved_by UUID REFERENCES profiles(id),
  hr_approved_at TIMESTAMPTZ,
  released_by UUID REFERENCES profiles(id),
  released_at TIMESTAMPTZ,
  total_employees INT NOT NULL DEFAULT 0,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  total_pf NUMERIC NOT NULL DEFAULT 0,
  total_tds NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status ON payroll_cycles(status);
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_period ON payroll_cycles(year DESC, month DESC);

-- ============================================================
-- 4. PAYSLIPS (immutable, versioned, attendance-ready)
-- ============================================================
CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
  -- Employee snapshot at generation time (immune to future profile changes)
  employee_name TEXT NOT NULL DEFAULT '',
  employee_email TEXT NOT NULL DEFAULT '',
  employee_department TEXT DEFAULT '',
  -- Salary snapshot at generation time
  annual_ctc NUMERIC NOT NULL,
  monthly_ctc NUMERIC NOT NULL,
  -- Earnings breakdown (JSONB for extensibility)
  earnings JSONB NOT NULL,
  -- Deductions breakdown
  deductions JSONB NOT NULL,
  gross NUMERIC NOT NULL,
  net NUMERIC NOT NULL,
  pf_amount NUMERIC NOT NULL DEFAULT 0,
  pt_amount NUMERIC NOT NULL DEFAULT 0,
  tds_amount NUMERIC NOT NULL DEFAULT 0,
  -- Attendance-ready fields (default 0 until integrated)
  lop_days INT NOT NULL DEFAULT 0,
  lop_deduction NUMERIC NOT NULL DEFAULT 0,
  overtime_hours NUMERIC NOT NULL DEFAULT 0,
  overtime_pay NUMERIC NOT NULL DEFAULT 0,
  bonus_amount NUMERIC NOT NULL DEFAULT 0,
  incentive_amount NUMERIC NOT NULL DEFAULT 0,
  reimbursements JSONB DEFAULT '[]',
  -- Versioning: >1 means correction/adjustment
  version INT NOT NULL DEFAULT 1,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'adjusted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, cycle_id, version)
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_cycle ON payslips(cycle_id);

-- ============================================================
-- 5. ENHANCED AUDIT TRAIL (evidence-ready)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_code TEXT NOT NULL DEFAULT 'EV-PAY-001',
  entity TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  performed_by UUID REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  browser TEXT,
  device TEXT,
  reason TEXT,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_code ON payroll_audit(evidence_code);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_entity ON payroll_audit(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_performed ON payroll_audit(performed_at DESC);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_audit ENABLE ROW LEVEL SECURITY;

-- Helper: check if the current user has one of the given roles
CREATE OR REPLACE FUNCTION public.user_has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ANY(roles)
  );
$$;

-- salary_structures: all authenticated can read, admin/hr/payroll write
CREATE POLICY "salary_structures_select_all" ON salary_structures
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "salary_structures_insert_admin_hr_payroll" ON salary_structures
  FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));
CREATE POLICY "salary_structures_update_admin_hr_payroll" ON salary_structures
  FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));

-- salary_components: same as salary_structures
CREATE POLICY "salary_components_select_all" ON salary_components
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "salary_components_insert_admin_hr_payroll" ON salary_components
  FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));
CREATE POLICY "salary_components_update_admin_hr_payroll" ON salary_components
  FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));

-- salary_revisions: employee sees own, admin/hr/payroll sees all
CREATE POLICY "salary_revisions_select_own" ON salary_revisions
  FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY "salary_revisions_select_staff" ON salary_revisions
  FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));
CREATE POLICY "salary_revisions_insert_staff" ON salary_revisions
  FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));

-- payroll_cycles: staff sees all, others see released only
CREATE POLICY "payroll_cycles_select_staff" ON payroll_cycles
  FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll', 'finance']));
CREATE POLICY "payroll_cycles_select_released" ON payroll_cycles
  FOR SELECT USING (status = 'released');
CREATE POLICY "payroll_cycles_insert_staff" ON payroll_cycles
  FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));
CREATE POLICY "payroll_cycles_update_staff" ON payroll_cycles
  FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));

-- payslips: employee sees own, staff sees all
CREATE POLICY "payslips_select_own" ON payslips
  FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY "payslips_select_staff" ON payslips
  FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));
CREATE POLICY "payslips_insert_staff" ON payslips
  FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr', 'payroll']));

-- payroll_audit: staff sees all, no direct insert from frontend
-- (all audit records are created by SECURITY DEFINER RPCs)
CREATE POLICY "payroll_audit_select_staff" ON payroll_audit
  FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr', 'payroll', 'auditor']));

-- ============================================================
-- CORE PAYROLL CALCULATION FUNCTIONS (embedded in Postgres)
-- Single source of truth — JS is only for preview.
-- ============================================================

-- Helper: round to 2 decimal places
CREATE OR REPLACE FUNCTION public.payroll_round(n NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(n, 2);
$$;

-- PF calculation: 12% of basic, capped at ₹1,800
CREATE OR REPLACE FUNCTION public.calculate_pf(basic NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(ROUND(basic * 0.12, 2), 1800);
$$;

-- Professional Tax: flat ₹200
CREATE OR REPLACE FUNCTION public.calculate_pt()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 200;
$$;

-- Simplified TDS based on Indian tax slabs (New Regime, FY 2025-26)
CREATE OR REPLACE FUNCTION public.calculate_tds(annual_ctc NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN annual_ctc <= 400000 THEN 0
    WHEN annual_ctc <= 800000 THEN ROUND((annual_ctc - 400000) * 0.05, 2)
    WHEN annual_ctc <= 1200000 THEN ROUND(20000 + (annual_ctc - 800000) * 0.10, 2)
    WHEN annual_ctc <= 1600000 THEN ROUND(60000 + (annual_ctc - 1200000) * 0.15, 2)
    WHEN annual_ctc <= 2000000 THEN ROUND(120000 + (annual_ctc - 1600000) * 0.20, 2)
    WHEN annual_ctc <= 2400000 THEN ROUND(200000 + (annual_ctc - 2000000) * 0.25, 2)
    ELSE ROUND(300000 + (annual_ctc - 2400000) * 0.30, 2)
  END;
$$;

-- ============================================================
-- RPC: process_monthly_payroll()
-- SINGLE SOURCE OF TRUTH for payroll generation.
-- Accepts ONLY month, year, and who generated it.
-- Reads employee data and salary structure from the database.
-- Frontend NEVER decides salary amounts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_monthly_payroll(
  p_month INT,
  p_year INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  -- === Require authentication ===
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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
    VALUES ('EV-PAY-002', 'payroll_cycles', 'DUPLICATE_PREVENTED', auth.uid(),
      jsonb_build_object('month', p_month, 'year', p_year));
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
  VALUES (p_month, p_year, 'generated', auth.uid())
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
    'EV-PAY-001', 'payroll_cycles', v_cycle_id, 'PAYROLL_GENERATED', auth.uid(),
    jsonb_build_object(
      'month', p_month,
      'year', p_year,
      'employees_generated', v_total_employees,
      'failed_rows', v_errors,
      'total_gross', v_total_gross,
      'total_net', v_total_net,
      'total_pf', v_total_pf,
      'total_tds', v_total_tds
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

-- ============================================================
-- HELPER: Get payslip breakdown for preview (used by frontend)
-- This is a READ-ONLY preview function. Actual payroll
-- generation must use process_monthly_payroll().
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_payslip_breakdown(
  p_annual_ctc NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_net NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_annual_ctc <= 0 THEN
    RETURN jsonb_build_object('annual_ctc', 0, 'monthly_ctc', 0, 'gross', 0, 'net', 0);
  END IF;

  v_monthly_ctc := payroll_round(p_annual_ctc / 12);
  v_basic := payroll_round(v_monthly_ctc * 0.50);
  v_hra := payroll_round(v_monthly_ctc * 0.20);
  v_lta := payroll_round(v_monthly_ctc * 0.10);
  v_special := payroll_round(v_monthly_ctc * 0.10);
  v_variable := payroll_round(v_monthly_ctc * 0.10);
  v_gross := payroll_round(v_basic + v_hra + v_lta + v_special + v_variable);
  v_pf := public.calculate_pf(v_basic);
  v_pt := public.calculate_pt();
  v_tds_annual := public.calculate_tds(p_annual_ctc);
  v_tds_monthly := payroll_round(v_tds_annual / 12);
  v_net := payroll_round(v_gross - v_pf - v_pt - v_tds_monthly);

  RETURN jsonb_build_object(
    'annual_ctc', p_annual_ctc,
    'monthly_ctc', v_monthly_ctc,
    'earnings', jsonb_build_object('basic', v_basic, 'hra', v_hra, 'lta', v_lta, 'special', v_special, 'variable', v_variable),
    'deductions', jsonb_build_object('pf', v_pf, 'pt', v_pt, 'tds', v_tds_monthly),
    'gross', v_gross,
    'net', v_net
  );
END;
$$;

-- ============================================================
-- RPC: transition_payroll_status()
-- Secure workflow transition — frontend NEVER writes directly
-- to payroll_cycles or payroll_audit.
--
-- Audit record is created inside the same database transaction.
-- Advisory lock prevents concurrent transitions on the same cycle.
-- Role validation is enforced server-side.
-- ============================================================

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
BEGIN
  -- === Require authentication ===
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- === Advisory lock: prevent concurrent transitions on same cycle ===
  PERFORM pg_advisory_xact_lock(hashtext('payroll_transition_' || p_cycle_id));

  -- === Validate cycle exists and get current status ===
  SELECT status, month, year INTO v_current_status, v_current_month, v_current_year
  FROM payroll_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payroll cycle not found');
  END IF;

  -- === Get user role ===
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- === Validate transition is allowed from current status ===
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

  -- === Update cycle ===
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
  END IF;

  -- === Audit log (inside the same transaction) ===
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
      'performed_by_role', v_user_role
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'evidence_code', 'EV-PAY-005',
    'cycle_id', p_cycle_id,
    'previous_status', v_current_status,
    'new_status', p_next_status
  );
END;
$$;
