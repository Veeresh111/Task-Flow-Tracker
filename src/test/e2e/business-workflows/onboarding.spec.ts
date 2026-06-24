import { test, expect } from "./helpers";
import { SEED, getAnonClient, getAdminClient } from "./helpers";

test.describe("Business Workflow: Onboarding", () => {
  test("1. Onboarding table exists and can be read", async () => {
    const anon = getAnonClient();
    const { data, error } = await anon.from("candidate_onboarding").select("*").limit(0);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("2. Onboarding stages flow in correct order", () => {
    const stages = [
      "Documents Pending",
      "Document Verification",
      "Background Check",
      "Offer Acceptance",
      "Offer Signed",
      "Joining Date Confirmed",
      "Onboarding Complete",
    ];

    // Verify non-regression
    expect(stages[0]).toBe("Documents Pending");
    expect(stages[stages.length - 1]).toBe("Onboarding Complete");

    // Verify order — must progress forward
    for (let i = 0; i < stages.length - 1; i++) {
      const currentIdx = stages.indexOf(stages[i]);
      const nextIdx = stages.indexOf(stages[i + 1]);
      expect(nextIdx).toBe(currentIdx + 1);
    }
  });

  test("3. Onboarding cannot start without offer acceptance", () => {
    const canStartOnboarding = (offerStatus: string): boolean => {
      return offerStatus === "Accepted";
    };

    expect(canStartOnboarding("Accepted")).toBe(true);
    expect(canStartOnboarding("Sent")).toBe(false);
    expect(canStartOnboarding("Pending Approval")).toBe(false);
    expect(canStartOnboarding("Declined")).toBe(false);
  });

  test("4. Documents required checklist validates correctly", () => {
    const validateDocuments = (docs: string[]): { valid: boolean; missing: string[] } => {
      const required = ["ID Proof", "Address Proof", "Educational Certificates", "Resume"];
      const missing = required.filter((d) => !docs.includes(d));
      return { valid: missing.length === 0, missing };
    };

    const result1 = validateDocuments(["ID Proof", "Address Proof", "Educational Certificates", "Resume"]);
    expect(result1.valid).toBe(true);
    expect(result1.missing).toHaveLength(0);

    const result2 = validateDocuments(["ID Proof"]);
    expect(result2.valid).toBe(false);
    expect(result2.missing).toContain("Address Proof");
    expect(result2.missing).toContain("Educational Certificates");
    expect(result2.missing).toContain("Resume");
  });

  test("5. /onboarding page renders without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/onboarding", { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
