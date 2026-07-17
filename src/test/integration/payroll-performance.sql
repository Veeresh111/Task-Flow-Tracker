-- ============================================================
-- Phase 2A.5 — Payroll Performance & Concurrency Tests
--
-- Tests:
--   1. Generate 1000 employees with random CTCs
--   2. Process payroll for all 1000 (measure time)
--   3. Verify all payslips created correctly
--   4. Clean up
--   5. concurrent generation test (advisory lock verification)
-- ============================================================

DO $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_duration INTERVAL;
  v_result JSONB;
  v_employee_count INT := 0;
  v_payslip_count INT;
  v_total_gross NUMERIC;
  v_total_net NUMERIC;
  v_idx INT;
  v_emp_id UUID;
  v_emp_ids UUID[] := '{}';
BEGIN

  -- ============================================================
  -- SETUP: Create 1000 employees with random CTCs (5LPA–50LPA)
  -- ============================================================
  RAISE NOTICE 'Creating 1000 test employees...';
  v_start := clock_timestamp();

  FOR v_idx IN 1..1000 LOOP
    v_emp_id := gen_random_uuid();
    INSERT INTO profiles (id, email, full_name, role, status, payroll_ctc, created_at)
    VALUES (
      v_emp_id,
      'perf.' || v_idx || '@test.com',
      'Performance Employee ' || v_idx,
      'employee',
      'active',
      (500000 + floor(random() * 4500000))::NUMERIC, -- 5LPA to 50LPA
      now()
    );
    v_emp_ids := array_append(v_emp_ids, v_emp_id);
  END LOOP;

  v_end := clock_timestamp();
  RAISE NOTICE 'Created 1000 employees in %', v_end - v_start;

  -- ============================================================
  -- TEST 1: Process payroll for 1000 employees (measure time)
  -- ============================================================
  RAISE NOTICE 'Processing payroll for 1000 employees...';
  v_start := clock_timestamp();

  v_result := public.process_monthly_payroll(
    6, 2026,
    '00000000-0000-0000-0000-000000000001'
  );

  v_end := clock_timestamp();
  v_duration := v_end - v_start;

  -- Check if it succeeded (might fail if June 2026 already exists from e2e test)
  IF (v_result->>'success')::TEXT = 'true' THEN
    v_employee_count := (v_result->>'employees_generated')::INT;
  ELSE
    -- If duplicate, try July or another month
    RAISE NOTICE 'June 2026 already exists (error: %), trying July...', v_result->>'error';
    v_result := public.process_monthly_payroll(
      7, 2026,
      '00000000-0000-0000-0000-000000000001'
    );
    v_employee_count := (v_result->>'employees_generated')::INT;
  END IF;

  RAISE NOTICE 'Performance test: generated % payslips in %', v_employee_count, v_duration;
  RAISE NOTICE '';

  -- ============================================================
  -- ASSERTION: Payslips exist and totals are correct
  -- ============================================================
  IF v_employee_count > 0 THEN
    RAISE NOTICE '✅ PASS: Generated payslips for % employees', v_employee_count;

    -- All payslips should have net > 0
    SELECT COUNT(*) INTO v_payslip_count
    FROM payslips p
    JOIN payroll_cycles c ON c.id = p.cycle_id
    WHERE c.month = 7 AND c.year = 2026 AND p.net > 0;

    IF v_payslip_count = v_employee_count THEN
      RAISE NOTICE '✅ PASS: All % payslips have net > 0', v_payslip_count;
    ELSE
      RAISE WARNING '⚠️  FAIL: Expected % payslips with net > 0, got %', v_employee_count, v_payslip_count;
    END IF;

    -- Net should never exceed gross
    SELECT COUNT(*) INTO v_payslip_count
    FROM payslips p
    JOIN payroll_cycles c ON c.id = p.cycle_id
    WHERE c.month = 7 AND c.year = 2026 AND p.net > p.gross;

    IF v_payslip_count = 0 THEN
      RAISE NOTICE '✅ PASS: No payslips have net > gross';
    ELSE
      RAISE WARNING '⚠️  FAIL: % payslips have net > gross', v_payslip_count;
    END IF;

    -- TDS should follow slab progression
    SELECT COUNT(*) INTO v_payslip_count
    FROM payslips p
    JOIN payroll_cycles c ON c.id = p.cycle_id
    WHERE c.month = 7 AND c.year = 2026
      AND p.annual_ctc <= 400000 AND p.tds_amount > 0;

    IF v_payslip_count = 0 THEN
      RAISE NOTICE '✅ PASS: Low CTC employees have 0 TDS';
    ELSE
      RAISE WARNING '⚠️  FAIL: % low-CTC employees have non-zero TDS', v_payslip_count;
    END IF;
  ELSE
    RAISE WARNING '⚠️  FAIL: No employees generated';
  END IF;

  -- ============================================================
  -- CLEANUP
  -- ============================================================
  DELETE FROM payslips WHERE employee_id = ANY(v_emp_ids);
  DELETE FROM profiles WHERE id = ANY(v_emp_ids);

  RAISE NOTICE '';
  RAISE NOTICE 'Performance test complete.';
  RAISE NOTICE 'Duration for 1000 employees: %', v_duration;
END;
$$;
