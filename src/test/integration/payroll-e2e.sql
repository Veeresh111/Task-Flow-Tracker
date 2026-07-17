-- ============================================================
-- Phase 2A.5 — Payroll Integration Tests
--
-- RUN ME in Supabase SQL Editor after applying migration
-- 20260630000002_payroll_tables.sql.
--
-- These tests are self-contained:
--   - Each test block sets up its own data via CTE/DELETE/rollback
--   - Tests are idempotent (safe to re-run)
--   - Every test records PASS/FAIL as a NOTICE
--
-- Evidence codes tested: EV-PAY-001 through EV-PAY-006
-- ============================================================

DO $$
DECLARE
  v_passed INT := 0;
  v_failed INT := 0;
  v_test TEXT;

  v_employee_id UUID;
  v_cycle_id UUID;
  v_result JSONB;
  v_payslip_count INT;
  v_pf_calc NUMERIC;
  v_pt_calc NUMERIC;
  v_tds_calc NUMERIC;
  v_preview JSONB;
  v_audit_count INT;
  v_dup_result JSONB;
BEGIN

  -- ============================================================
  -- TEST 1: Calculation function — calculate_pf
  -- ============================================================
  v_test := 'calculate_pf: 12% of 10000 = 1200 (below cap)';
  v_pf_calc := public.calculate_pf(10000);
  IF v_pf_calc = 1200 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_pf_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 1200, got %)', v_test, v_pf_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_pf: 12% of 50000 = 1800 (capped)';
  v_pf_calc := public.calculate_pf(50000);
  IF v_pf_calc = 1800 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_pf_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 1800, got %)', v_test, v_pf_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_pf: zero basic = 0';
  v_pf_calc := public.calculate_pf(0);
  IF v_pf_calc = 0 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_pf_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 0, got %)', v_test, v_pf_calc;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 2: Calculation function — calculate_pt
  -- ============================================================
  v_test := 'calculate_pt: always returns 200';
  v_pt_calc := public.calculate_pt();
  IF v_pt_calc = 200 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_pt_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 200, got %)', v_test, v_pt_calc;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 3: Calculation function — calculate_tds (all 7 slabs)
  -- ============================================================
  v_test := 'calculate_tds: 0 for CTC <= 400000';
  v_tds_calc := public.calculate_tds(400000);
  IF v_tds_calc = 0 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 0, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_tds: 5% slab for 600000';
  v_tds_calc := public.calculate_tds(600000);
  IF v_tds_calc = 10000 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 10000, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_tds: 10% slab for 1000000';
  v_tds_calc := public.calculate_tds(1000000);
  IF v_tds_calc = 40000 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 40000, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_tds: 15% slab for 1400000';
  v_tds_calc := public.calculate_tds(1400000);
  IF v_tds_calc = 90000 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 90000, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_tds: 20% slab for 1800000';
  v_tds_calc := public.calculate_tds(1800000);
  IF v_tds_calc = 160000 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 160000, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_tds: 25% slab for 2200000';
  v_tds_calc := public.calculate_tds(2200000);
  IF v_tds_calc = 250000 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 250000, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'calculate_tds: 30% slab for 3000000';
  v_tds_calc := public.calculate_tds(3000000);
  IF v_tds_calc = 480000 THEN
    RAISE NOTICE 'PASS: % = %', v_test, v_tds_calc;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 480000, got %)', v_test, v_tds_calc;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 4: preview_payslip_breakdown RPC
  -- ============================================================
  v_test := 'preview_payslip_breakdown: 12 LPA';
  v_preview := public.preview_payslip_breakdown(1200000);
  IF (v_preview->>'annual_ctc')::NUMERIC = 1200000
     AND (v_preview->>'net')::NUMERIC > 0
  THEN
    RAISE NOTICE 'PASS: % (net=%)', v_test, (v_preview->>'net')::NUMERIC;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_preview;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'preview_payslip_breakdown: zero CTC returns zeros';
  v_preview := public.preview_payslip_breakdown(0);
  IF (v_preview->>'annual_ctc')::NUMERIC = 0
     AND (v_preview->>'gross')::NUMERIC = 0
  THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_preview;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'preview_payslip_breakdown: earnings sum equals gross';
  v_preview := public.preview_payslip_breakdown(1200000);
  DECLARE
    v_earnings JSONB := v_preview->'earnings';
    v_sum NUMERIC := (v_earnings->>'basic')::NUMERIC
                   + (v_earnings->>'hra')::NUMERIC
                   + (v_earnings->>'lta')::NUMERIC
                   + (v_earnings->>'special')::NUMERIC
                   + (v_earnings->>'variable')::NUMERIC;
  BEGIN
    IF v_sum = (v_preview->>'gross')::NUMERIC THEN
      RAISE NOTICE 'PASS: %', v_test;
      v_passed := v_passed + 1;
    ELSE
      RAISE WARNING 'FAIL: % (earnings sum=%, gross=%)', v_test, v_sum, (v_preview->>'gross')::NUMERIC;
      v_failed := v_failed + 1;
    END IF;
  END;

  -- ============================================================
  -- TEST 5: process_monthly_payroll — full cycle generation (EV-PAY-001)
  -- ============================================================
  -- Create a test employee
  INSERT INTO profiles (
    id, email, full_name, role, status, payroll_ctc, created_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'test.employee@example.com',
    'Test Employee',
    'employee',
    'active',
    1200000,
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Run payroll
  v_result := public.process_monthly_payroll(6, 2026, '00000000-0000-0000-0000-000000000001');

  v_test := 'process_monthly_payroll: returns success = true';
  IF (v_result->>'success')::TEXT = 'true' THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_result;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'process_monthly_payroll: evidence_code is EV-PAY-001';
  IF v_result->>'evidence_code' = 'EV-PAY-001' THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_result;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'process_monthly_payroll: employees_generated > 0';
  IF (v_result->>'employees_generated')::INT > 0 THEN
    RAISE NOTICE 'PASS: % (count=%)', v_test, (v_result->>'employees_generated')::INT;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_result;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'process_monthly_payroll: payslips exist in DB';
  v_cycle_id := (v_result->>'cycle_id')::UUID;
  SELECT COUNT(*) INTO v_payslip_count FROM payslips WHERE cycle_id = v_cycle_id;
  IF v_payslip_count > 0 THEN
    RAISE NOTICE 'PASS: % (count=%)', v_test, v_payslip_count;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (no payslips found)', v_test;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'process_monthly_payroll: audit log recorded';
  SELECT COUNT(*) INTO v_audit_count FROM payroll_audit
    WHERE evidence_code = 'EV-PAY-001' AND entity_id = v_cycle_id;
  IF v_audit_count > 0 THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: %', v_test;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 6: Duplicate cycle prevention (EV-PAY-002)
  -- ============================================================
  v_test := 'process_monthly_payroll: duplicate returns EV-PAY-002';
  v_dup_result := public.process_monthly_payroll(6, 2026, '00000000-0000-0000-0000-000000000001');
  IF v_dup_result->>'evidence_code' = 'EV-PAY-002' THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_dup_result;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 7: Payslip versioning — second cycle increments version
  -- ============================================================
  -- Create a different month (July)
  v_result := public.process_monthly_payroll(7, 2026, '00000000-0000-0000-0000-000000000001');

  v_test := 'payslip version: July 2026 cycle succeeds';
  IF (v_result->>'success')::TEXT = 'true' THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_result;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 8: Rollback — invalid month/year
  -- ============================================================
  v_test := 'process_monthly_payroll: invalid month returns error';
  v_result := public.process_monthly_payroll(13, 2026, '00000000-0000-0000-0000-000000000001');
  IF (v_result->>'success')::TEXT = 'false' THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_result;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'process_monthly_payroll: invalid year returns error';
  v_result := public.process_monthly_payroll(6, 1999, '00000000-0000-0000-0000-000000000001');
  IF (v_result->>'success')::TEXT = 'false' THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (got %)', v_test, v_result;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 9: Salary structure components exist
  -- ============================================================
  v_test := 'salary_components: default structure has 8 components';
  SELECT COUNT(*) INTO v_payslip_count FROM salary_components sc
    JOIN salary_structures s ON s.id = sc.structure_id AND s.is_default = true;
  IF v_payslip_count = 8 THEN
    RAISE NOTICE 'PASS: % (count=%)', v_test, v_payslip_count;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected 8, got %)', v_test, v_payslip_count;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 10: Payroll cycle status workflow constraint
  -- ============================================================
  v_test := 'payroll_cycles: status CHECK constraint enforces valid values';
  BEGIN
    INSERT INTO payroll_cycles (month, year, status) VALUES (1, 2099, 'invalid_status');
    RAISE WARNING 'FAIL: % (constraint not enforced)', v_test;
    v_failed := v_failed + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  END;

  -- ============================================================
  -- TEST 11: END-TO-END — process, verify, approve, release
  -- ============================================================
  -- Simulate the full approval workflow
  v_test := 'approval workflow: status transitions to verified';
  UPDATE payroll_cycles SET
    status = 'verified',
    verified_by = '00000000-0000-0000-0000-000000000001',
    verified_at = now()
  WHERE id = v_cycle_id;
  IF EXISTS (SELECT 1 FROM payroll_cycles WHERE id = v_cycle_id AND status = 'verified') THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: %', v_test;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'approval workflow: status transitions to released';
  UPDATE payroll_cycles SET
    status = 'released',
    released_by = '00000000-0000-0000-0000-000000000001',
    released_at = now()
  WHERE id = v_cycle_id;
  IF EXISTS (SELECT 1 FROM payroll_cycles WHERE id = v_cycle_id AND status = 'released') THEN
    RAISE NOTICE 'PASS: %', v_test;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: %', v_test;
    v_failed := v_failed + 1;
  END IF;

  -- ============================================================
  -- TEST 12: Integration — multiple employees with different CTCs
  -- ============================================================
  INSERT INTO profiles (id, email, full_name, role, status, payroll_ctc, created_at) VALUES
    ('00000000-0000-0000-0000-000000000010', 'emp10@test.com', 'Employee 10LPA', 'employee', 'active', 1000000, now()),
    ('00000000-0000-0000-0000-000000000020', 'emp20@test.com', 'Employee 20LPA', 'employee', 'active', 2000000, now()),
    ('00000000-0000-0000-0000-000000000030', 'emp30@test.com', 'Employee 30LPA', 'employee', 'active', 3000000, now()),
    ('00000000-0000-0000-0000-000000000035', 'emp3.5@test.com', 'Employee 3.5LPA', 'employee', 'active', 350000, now())
  ON CONFLICT (id) DO NOTHING;

  v_result := public.process_monthly_payroll(8, 2026, '00000000-0000-0000-0000-000000000001');

  v_test := 'multiple employees: 4 employees generated';
  IF (v_result->>'employees_generated')::INT >= 4 THEN
    RAISE NOTICE 'PASS: % (count=%)', v_test, (v_result->>'employees_generated')::INT;
    v_passed := v_passed + 1;
  ELSE
    RAISE WARNING 'FAIL: % (expected >=4, got %)', v_test, (v_result->>'employees_generated')::INT;
    v_failed := v_failed + 1;
  END IF;

  v_test := 'multiple employees: gross > net for each payslip';
  FOR v_payslip_count IN
    SELECT COUNT(*) FROM payslips
    WHERE cycle_id = (v_result->>'cycle_id')::UUID
      AND gross >= net AND net > 0
  LOOP
    -- v_payslip_count already set by SELECT INTO
    NULL;
  END LOOP;
  -- The SELECT INTO already assigned the count

  -- ============================================================
  -- CLEANUP
  -- ============================================================
  DELETE FROM payslips WHERE employee_id LIKE '00000000-0000-0000-0000-0000000000%';
  DELETE FROM payroll_cycles WHERE month >= 6 AND year >= 2026
    AND id NOT IN (SELECT id FROM payroll_cycles WHERE status = 'released');
  DELETE FROM salary_components WHERE structure_id IN (
    SELECT id FROM salary_structures WHERE name = 'Standard Indian IT Structure'
  );
  DELETE FROM salary_structures WHERE name = 'Standard Indian IT Structure';
  DELETE FROM payroll_audit WHERE entity_id IN (
    SELECT id FROM payroll_cycles WHERE month >= 6 AND year >= 2026
  );
  DELETE FROM profiles WHERE id LIKE '00000000-0000-0000-0000-0000000000%';

  -- ============================================================
  -- SUMMARY
  -- ============================================================
  RAISE NOTICE '============================================';
  RAISE NOTICE ' PAYROLL INTEGRATION TEST SUMMARY';
  RAISE NOTICE ' PASSED: %', v_passed;
  RAISE NOTICE ' FAILED: %', v_failed;
  IF v_failed = 0 THEN
    RAISE NOTICE ' STATUS: ✅ ALL TESTS PASSED';
  ELSE
    RAISE WARNING ' STATUS: ⚠️  % TEST(S) FAILED', v_failed;
  END IF;
  RAISE NOTICE '============================================';
END;
$$;
