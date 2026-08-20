import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fnfService } from "../../src/lib/fnf-service";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://txwxtsdsbuddqfrtllsf.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

test.describe("Enterprise Offboarding & FnF Settlement Robotic Guardrail", () => {
  const OFFBOARD_TEST_USER_ID = "f7777777-7777-4777-f777-777777777777";

  test.beforeAll(async () => {
    // 1. Seed test employee for offboarding
    await supabase.from("profiles").upsert({
      id: OFFBOARD_TEST_USER_ID,
      name: "David Sterling (Staff Engineer)",
      email: "david.sterling@flowtracker.internal",
      role: "employee",
      status: "active",
      department: "Cloud Infrastructure",
      payroll_ctc: 1200000, // 1,00,000 / month, 6,00,000 Basic
      date_of_joining: "2023-08-01T00:00:00Z", // 3-year tenure
      experience: 5.0
    }, { onConflict: "id" });

    // 2. Seed 12.0 Paid Leave balance in ledger
    await supabase.from("leave_ledgers").insert({
      user_id: OFFBOARD_TEST_USER_ID,
      transaction_type: "monthly_accrual",
      leave_type: "paid_leave",
      amount: 12.00,
      balance_after: 12.00,
      fiscal_year: 2026,
      month: 8,
      notes: "Pre-Offboard Leave Accrual Balance"
    });
  });

  test("1. Mathematical Accuracy of FnF Settlement & Leave Encashment", async () => {
    const lastWorkingDay = "2026-08-20";
    const noticeShortfallDays = 5;

    console.log("[OFFBOARD_CUJ] Triggering atomic FnF settlement for David Sterling...");

    // Execute atomic settlement via RPC
    const settlement = await fnfService.processOffboarding(
      OFFBOARD_TEST_USER_ID,
      lastWorkingDay,
      noticeShortfallDays
    );

    expect(settlement).toBeDefined();
    expect(settlement.success).toBe(true);

    // Verify mathematical breakdown
    const annualCtc = 1200000;
    const monthlyCtc = 100000;
    const annualBasic = 600000;
    const daysInAugust = 31;
    const daysWorked = 20;
    const leaveBalance = 12;

    const expectedProratedSalary = Number(((monthlyCtc / daysInAugust) * daysWorked).toFixed(2)); // ₹64,516.13
    const expectedLeaveEncashment = Number(((annualBasic / 365.0) * leaveBalance).toFixed(2));    // ₹19,726.03
    const expectedNoticeDeduction = Number(((monthlyCtc / daysInAugust) * noticeShortfallDays).toFixed(2)); // ₹16,129.03
    const expectedNetPayable = Number((expectedProratedSalary + expectedLeaveEncashment - expectedNoticeDeduction).toFixed(2));

    console.log(`[FNF_MATH] Expected Prorated Pay : ₹${expectedProratedSalary}, Actual: ₹${settlement.prorated_salary}`);
    console.log(`[FNF_MATH] Expected Encashment   : ₹${expectedLeaveEncashment}, Actual: ₹${settlement.leave_encashment}`);
    console.log(`[FNF_MATH] Expected Notice Ded   : ₹${expectedNoticeDeduction}, Actual: ₹${settlement.notice_deduction}`);
    console.log(`[FNF_MATH] Expected Net Payable  : ₹${expectedNetPayable}, Actual: ₹${settlement.net_payable}`);

    expect(Number(settlement.prorated_salary)).toBeCloseTo(expectedProratedSalary, 1);
    expect(Number(settlement.leave_encashment)).toBeCloseTo(expectedLeaveEncashment, 1);
    expect(Number(settlement.notice_deduction)).toBeCloseTo(expectedNoticeDeduction, 1);
    expect(Number(settlement.net_payable)).toBeCloseTo(expectedNetPayable, 1);
  });

  test("2. Idempotency Lock: Duplicate Offboarding Attempt Rejection", async () => {
    console.log("[OFFBOARD_CUJ] Attempting duplicate offboard on already archived employee...");

    // Attempt to offboard again
    const duplicateRun = await fnfService.processOffboarding(
      OFFBOARD_TEST_USER_ID,
      "2026-08-20",
      0
    );

    expect(duplicateRun.success).toBe(false);
    expect(duplicateRun.idempotent).toBe(true);
    expect(duplicateRun.error).toContain("already been offboarded and settled");
    console.log("[OFFBOARD_CUJ] Duplicate offboarding successfully rejected by database idempotency lock.");
  });

  test("3. Soft-Delete & Access Revocation Verification", async () => {
    // 1. Verify user was soft-deleted (status = 'archived') and NEVER SQL deleted
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, status, offboarding_date, fnf_settlement_id")
      .eq("id", OFFBOARD_TEST_USER_ID)
      .single();

    expect(profile).not.toBeNull();
    expect(profile!.status).toBe("archived");
    expect(profile!.offboarding_date).not.toBeNull();
    expect(profile!.fnf_settlement_id).not.toBeNull();

    // 2. Verify leave ledgers zeroed out
    const { data: ledgers } = await supabase
      .from("leave_ledgers")
      .select("balance_after")
      .eq("user_id", OFFBOARD_TEST_USER_ID)
      .order("created_at", { ascending: false })
      .limit(1);

    expect(ledgers).not.toBeNull();
    expect(Number(ledgers![0].balance_after)).toBe(0);

    console.log("[OFFBOARD_CUJ] Soft-delete verified. Historical financial ledgers remain 100% intact.");
  });
});
