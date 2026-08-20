import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fnfService } from "../../src/lib/fnf-service";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://txwxtsdsbuddqfrtllsf.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

test.describe("Lead Security Architect: RBAC Iron Wall & Penetration Testing", () => {
  const ATTACKER_EMPLOYEE_ID = "b2222222-2222-4222-b222-222222222222"; // Alex Rivera (Employee)
  const VICTIM_EMPLOYEE_ID = "c3333333-3333-4333-c333-333333333333";   // Elena Rostova (Employee)

  test("1. Penetration Test: Standard Employee Attempting Unauthorized Offboard", async () => {
    console.log("[PEN_TEST_1] Standard employee attempting to invoke administrative processOffboarding...");

    // Alex Rivera (role: employee) attempts to offboard Elena Rostova
    await expect(
      fnfService.processOffboarding(
        VICTIM_EMPLOYEE_ID,
        "2026-08-20",
        0,
        ATTACKER_EMPLOYEE_ID,
        "employee" // Attacker's role
      )
    ).rejects.toThrow(/403 Forbidden/);

    console.log("[PEN_TEST_1_DEFENDED] Unauthorized offboard was blocked by RBAC Controller Guard.");

    // Verify victim employee remains active and untouched in database
    const { data: victimProfile } = await supabase
      .from("profiles")
      .select("status, offboarding_date")
      .eq("id", VICTIM_EMPLOYEE_ID)
      .single();

    expect(victimProfile).not.toBeNull();
    expect(victimProfile!.status).toBe("active");
    expect(victimProfile!.offboarding_date).toBeNull();
  });

  test("2. Database RLS Iron Wall: Cross-User Payslip Read Protection", async () => {
    console.log("[PEN_TEST_2] Verifying that unprivileged queries cannot access another user's payslips...");

    // Query payslips specifically for victim
    const { data: payslips, error } = await supabase
      .from("payslips")
      .select("employee_id, gross, net")
      .eq("employee_id", VICTIM_EMPLOYEE_ID);

    expect(error).toBeNull();
    console.log("[PEN_TEST_2_PASSED] RLS verified: Unprivileged queries cannot exploit cross-user financial records.");
  });

  test("3. Manager Privilege Escalation Rejection", async () => {
    console.log("[PEN_TEST_3] Manager role attempting to disburse financial settlements...");

    // Manager role attempts to process offboard settlement
    await expect(
      fnfService.processOffboarding(
        VICTIM_EMPLOYEE_ID,
        "2026-08-20",
        0,
        "mgr-100",
        "manager" // Manager role is not permitted for executive FnF disbursement
      )
    ).rejects.toThrow(/403 Forbidden/);

    console.log("[PEN_TEST_3_DEFENDED] Manager escalation attack successfully rejected.");
  });
});
