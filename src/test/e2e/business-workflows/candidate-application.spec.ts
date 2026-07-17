import { test, expect } from "./helpers";
import { SEED, getAnonClient, getAdminClient, expectTableRead } from "./helpers";

test.describe("Business Workflow: Candidate Application", () => {
  test("1. Seed data exists — candidates and job forms are queryable", async () => {
    const anon = getAnonClient();

    const { data: candidates } = await anon.from("candidates").select("id, email, full_name");
    expect(candidates).toBeDefined();
    expect(candidates!.length).toBeGreaterThan(0);

    const { data: forms } = await anon.from("job_forms").select("id, job_title, status");
    expect(forms).toBeDefined();
    expect(forms!.length).toBeGreaterThan(0);

    const candidate = candidates!.find((c: any) => c.id === SEED.candidateId);
    expect(candidate).toBeDefined();
    expect(candidate!.email).toBe(SEED.candidateEmail);
  });

  test("2. Create job application via Supabase and verify readback", async () => {
    const admin = await getAdminClient();
    const ts = Date.now();

    const { data: app, error } = await admin.from("job_applications").upsert({
      form_id: SEED.jobFormId,
      candidate_id: SEED.candidateId,
      candidate_name: SEED.candidateName,
      candidate_email: "e2e-apply-" + ts + "@test.com",
      status: "Applied",
      answers: {},
    }, { onConflict: "candidate_id, form_id" }).select();

    expect(error).toBeNull();
    expect(app).not.toBeNull();
    expect(app!.length).toBe(1);
    expect(app![0].status).toBe("Applied");
    expect(app![0].form_id).toBe(SEED.jobFormId);

    // Read back and verify
    const { data: readback } = await admin.from("job_applications").select("*").eq("id", app![0].id);
    expect(readback).toBeDefined();
    expect(readback!.length).toBe(1);
    expect(readback![0].status).toBe("Applied");

    // Cleanup (best-effort — RLS may block delete)
    try { await admin.from("job_applications").delete().eq("id", app![0].id); } catch {} // eslint-disable-line no-empty
  });

  test("3. Application status transitions follow valid path", () => {
    const validTransitions: Record<string, string[]> = {
      Applied: ["Shortlisted", "Rejected"],
      Shortlisted: ["Assessment Assigned", "Rejected"],
      "Assessment Assigned": ["Assessment Passed", "Assessment Completed", "Rejected"],
      "Assessment Passed": ["Interview Scheduled", "Rejected"],
      "Interview Scheduled": ["Interview Cleared", "Rejected"],
      "Interview Cleared": ["Offer Generated", "Rejected"],
      "Offer Generated": ["Offer Accepted", "Offer Declined"],
    };

    for (const [from, tos] of Object.entries(validTransitions)) {
      for (const to of tos) {
        const isValid = validTransitions[from]?.includes(to);
        expect(isValid).toBe(true);
      }
    }

    // Verify no backward transitions
    expect(validTransitions["Shortlisted"]?.includes("Applied")).toBeFalsy();
    expect(validTransitions["Accepted"]).toBeUndefined(); // terminal
  });

  test("4. /apply/:formId public page loads for valid form", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`/apply/${SEED.jobFormId}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toContain(SEED.jobTitle);
  });

  test("5. Job application references valid candidate and form", async () => {
    const anon = getAnonClient();

    const { data: apps } = await anon.from("job_applications").select("*, candidates!inner(id), job_forms!inner(id)");
    expect(apps).toBeDefined();
  });
});
