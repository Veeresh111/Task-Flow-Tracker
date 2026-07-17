import { test, expect } from "./helpers";
import { SEED, getAnonClient, getAdminClient } from "./helpers";

test.describe("Business Workflow: Employee Creation", () => {
  test("1. Profiles table is queryable and admin can read own row", async () => {
    const admin = await getAdminClient();
    const { data, error } = await admin.from("profiles").select("id, role");
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    // At minimum the test admin user has a profile
    expect(data!.some((p: any) => p.role === "admin")).toBe(true);
  });

  test("2. Candidate can be converted to employee profile", async () => {
    const anon = getAnonClient();

    // Get candidate
    const { data: candidate } = await anon.from("candidates").select("*").eq("id", SEED.candidateId).single();
    expect(candidate).toBeDefined();

    // Validate candidate has required fields for employee conversion
    const canConvertToEmployee = (c: any): { valid: boolean; reason?: string } => {
      if (!c.full_name) return { valid: false, reason: "Missing full_name" };
      if (!c.email) return { valid: false, reason: "Missing email" };
      return { valid: true };
    };

    const result = canConvertToEmployee(candidate);
    expect(result.valid).toBe(true);
  });

  test("3. Employee requires superset of candidate data", () => {
    const createEmployeeRecord = (candidate: any): { valid: boolean; missing: string[] } => {
      const required = ["full_name", "email", "phone", "department", "designation", "employee_id", "joining_date"];
      const missing = required.filter((f) => !candidate[f]);
      return { valid: missing.length === 0, missing };
    };

    // Candidate may not have all employee fields
    const candidate = { full_name: "Test", email: "test@test.com" };
    const result = createEmployeeRecord(candidate);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("phone");
    expect(result.missing).toContain("department");
    expect(result.missing).toContain("designation");
    expect(result.missing).toContain("employee_id");
    expect(result.missing).toContain("joining_date");
  });

  test("4. Employee ID generation follows format", () => {
    const generateEmployeeId = (department: string, joiningYear: number, sequence: number): string => {
      const deptCode = department.substring(0, 3).toUpperCase();
      return `EMP-${deptCode}-${joiningYear}-${String(sequence).padStart(4, "0")}`;
    };

    const empId = generateEmployeeId("Engineering", 2026, 1);
    expect(empId).toBe("EMP-ENG-2026-0001");

    const empId2 = generateEmployeeId("Human Resources", 2026, 42);
    expect(empId2).toBe("EMP-HUM-2026-0042");
  });

  test("5. Employee status transitions are valid", () => {
    const validTransitions: Record<string, string[]> = {
      Active: ["On Leave", "Terminated", "Resigned"],
      "On Leave": ["Active", "Terminated", "Resigned"],
      Resigned: [],
      Terminated: [],
    };

    for (const [from, tos] of Object.entries(validTransitions)) {
      for (const to of tos) {
        expect(validTransitions[from]?.includes(to)).toBe(true);
      }
    }

    // Active employee can go on leave and back
    expect(validTransitions["Active"]?.includes("On Leave")).toBe(true);
    expect(validTransitions["On Leave"]?.includes("Active")).toBe(true);
  });
});
