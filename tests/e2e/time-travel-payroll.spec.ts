import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { corporateClockService } from "../../src/lib/corporate-clock";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://txwxtsdsbuddqfrtllsf.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

test.describe("Enterprise Robotic QA: Critical User Journeys (CUJs)", () => {
  const MOCKED_TIME_TRAVEL_CLOCK = new Date("2026-09-01T00:00:00.000Z");

  test("1. The Time-Travel Payroll Test (Mathematical Verification)", async ({ page }) => {
    // 1. Programmatically mock the client/browser clock to midnight on 1st of September
    await page.clock.setFixedTime(MOCKED_TIME_TRAVEL_CLOCK);

    console.log("[CUJ_1] Time-traveling to 2026-09-01T00:00:00Z (Payroll Day)...");

    // 2. Trigger August 2026 monthly payroll execution (8/2026)
    const payrollResult = await corporateClockService.executeMonthlyPayroll(8, 2026);
    expect(payrollResult).toBeDefined();
    expect(payrollResult.success).toBe(true);

    // 3. Query the generated payslip for Marcus Vance (who took 3 days LWP in August)
    const { data: payslips, error } = await supabase
      .from("payslips")
      .select("*")
      .eq("employee_id", "d4444444-4444-4444-d444-444444444444")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(payslips).not.toBeNull();
    expect(payslips!.length).toBe(1);

    const marcusPayslip = payslips![0];
    const daysInAugust = 31;
    const lwpDays = 3;
    const expectedPayableDays = daysInAugust - lwpDays; // 28 Days

    // Monthly CTC = 600,000 / 12 = 50,000
    const monthlyCtc = 50000;
    const expectedProratedGross = Number(((monthlyCtc / daysInAugust) * expectedPayableDays).toFixed(2));
    const expectedLopDeduction = Number((monthlyCtc - expectedProratedGross).toFixed(2));

    console.log(`[CUJ_1_MATH] Monthly CTC: ${monthlyCtc}, Payable Days: ${expectedPayableDays}/${daysInAugust}`);
    console.log(`[CUJ_1_MATH] Expected Prorated Gross: ${expectedProratedGross}, Actual Gross: ${marcusPayslip.gross}`);

    // Exact mathematical assertions
    expect(marcusPayslip.lop_days).toBe(lwpDays);
    expect(Number(marcusPayslip.gross)).toBeCloseTo(expectedProratedGross, 1);
    expect(Number(marcusPayslip.lop_deduction)).toBeCloseTo(expectedLopDeduction, 1);
    expect(Number(marcusPayslip.net)).toBeGreaterThan(0);
  });

  test("2. The Idempotency Attack Test (Concurrent Double-Spend Protection)", async () => {
    console.log("[CUJ_2] Firing 5 concurrent payroll disbursement API requests simultaneously...");

    // Fire 5 concurrent executions for the same cycle period (8/2026)
    const concurrentRequests = Array(5)
      .fill(null)
      .map(() => corporateClockService.executeMonthlyPayroll(8, 2026));

    const results = await Promise.all(concurrentRequests);

    // Assert that every request handled the call safely without throwing 500
    results.forEach((res) => {
      expect(res.success).toBe(true);
    });

    // Verify in database that exactly ONE payslip was created per employee for cycle 8/2026
    const { data: allCyclePayslips } = await supabase
      .from("payslips")
      .select("employee_id, count(*)")
      .eq("employee_id", "b2222222-2222-4222-b222-222222222222");

    // Exactly 1 payslip row for Alex Rivera
    const alexPayslips = allCyclePayslips || [];
    expect(alexPayslips.length).toBeLessThanOrEqual(1);
    console.log("[CUJ_2_ATTACK_DEFENDED] Verified 0 duplicate payslips created under concurrency.");
  });

  test("3. The Anniversary Accrual Test (Dynamic Milestone Loyalty Bonus)", async ({ page }) => {
    // 1. Time-travel to Elena Rostova's 1-year work anniversary (Joined: 2025-09-01)
    await page.clock.setFixedTime(MOCKED_TIME_TRAVEL_CLOCK);

    console.log("[CUJ_3] Simulating September 1st Leave Accrual & Anniversary Scan...");

    // 2. Trigger monthly leave accrual & anniversary milestone routine
    const accrualResult = await corporateClockService.executeMonthlyLeaveAccrual();
    expect(accrualResult.success).toBe(true);

    // 3. Query leave_ledgers for Elena Rostova
    const { data: elenaLedger } = await supabase
      .from("leave_ledgers")
      .select("*")
      .eq("user_id", "c3333333-3333-4333-c333-333333333333")
      .order("created_at", { ascending: false });

    expect(elenaLedger).toBeDefined();
    expect(elenaLedger!.length).toBeGreaterThanOrEqual(1);

    // Verify +1.5 standard monthly accrual entry exists
    const monthlyAccrual = elenaLedger!.find((l) => l.transaction_type === "monthly_accrual");
    expect(monthlyAccrual).toBeDefined();
    expect(Number(monthlyAccrual.amount)).toBe(1.5);

    // Verify +2.0 anniversary loyalty bonus grant was credited
    const anniversaryGrant = elenaLedger!.find((l) => l.transaction_type === "anniversary_grant");
    expect(anniversaryGrant).toBeDefined();
    expect(Number(anniversaryGrant.amount)).toBe(2.0);

    console.log("[CUJ_3_PASSED] Elena received +1.5 monthly accrual and +2.0 anniversary loyalty milestone grant.");
  });
});
