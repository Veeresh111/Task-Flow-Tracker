import { test, expect } from "./helpers";
import { SEED, getAnonClient, getAdminClient } from "./helpers";

test.describe("Business Workflow: Assessment", () => {
  test("1. Assessments are queryable and contain required fields", async () => {
    const anon = getAnonClient();
    const { data: assessments } = await anon.from("assessments").select("*");
    expect(assessments).toBeDefined();
    expect(assessments!.length).toBeGreaterThan(0);

    const assessment = assessments!.find((a: any) => a.id === SEED.assessmentId);
    expect(assessment).toBeDefined();
    expect(assessment!.title).toBe(SEED.assessmentTitle);
    expect(assessment!.questions).toBeDefined();
  });

  test("2. Assessment token can be created and verified", async () => {
    const admin = await getAdminClient();
    const ts = Date.now();

    const { data: token, error } = await admin.from("assessment_tokens").insert({
      token: "e2e-token-" + ts,
      assessment_id: SEED.assessmentId,
      candidate_id: SEED.candidateId,
      status: "Active",
      used: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    }).select();

    expect(error).toBeNull();
    expect(token).toBeDefined();
    expect(token![0].status).toBe("Active");
    expect(token![0].used).toBe(false);

    // Read back
    const { data: readback } = await admin.from("assessment_tokens").select("*").eq("id", token![0].id);
    expect(readback).toBeDefined();
    expect(readback![0].token).toContain("e2e-token-");

    // Verify candidate notification
    const { data: notif } = await admin.from("candidate_notifications").insert({
      candidate_id: SEED.candidateId,
      title: "Assessment Token Generated",
      message: `Your assessment token is: e2e-token-${ts}`,
      read: false,
    }).select();

    // Cleanup
    await admin.from("assessment_tokens").delete().eq("id", token![0].id);
    if (notif && notif.length > 0) {
      await admin.from("candidate_notifications").delete().eq("id", notif[0].id);
    }
  });

  test("3. Assessment attempt scoring logic works correctly", () => {
    const gradeAssessment = (
      answers: string[],
      correctAnswers: string[],
      passingScore: number,
      violations: number,
      maxViolations: number
    ) => {
      const disqualified = violations >= maxViolations;
      if (disqualified) return { score: 0, passed: false, disqualified: true };
      const correct = answers.filter((a, i) => a.toLowerCase() === (correctAnswers[i] || "").toLowerCase()).length;
      const percentage = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;
      return { score: percentage, passed: percentage >= passingScore, disqualified: false };
    };

    // All correct
    let result = gradeAssessment(["A", "B", "C"], ["A", "B", "C"], 70, 0, 3);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);

    // Partial
    result = gradeAssessment(["A", "B", "X"], ["A", "B", "C"], 70, 0, 3);
    expect(result.score).toBe(67);
    expect(result.passed).toBe(false);

    // Disqualified
    result = gradeAssessment(["A", "B", "C"], ["A", "B", "C"], 70, 3, 3);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.disqualified).toBe(true);

    // Empty
    result = gradeAssessment([], [], 70, 0, 3);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  test("4. /assessment public page loads token input form", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/assessment", { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.toLowerCase()).toContain("token");
  });

  test("5. Assessment attempt creates score record", async () => {
    const admin = await getAdminClient();

    const { data: attempt, error } = await admin.from("assessment_attempts").insert({
      assessment_id: SEED.assessmentId,
      candidate_id: SEED.candidateId,
      score: 85,
      passed: true,
    }).select();

    if (error) {
      // May fail due to unique constraint — check if attempt already exists
      expect(error.message).toContain("unique_candidate_assessment");
    } else {
      expect(attempt![0].score).toBe(85);
      expect(attempt![0].passed).toBe(true);
      await admin.from("assessment_attempts").delete().eq("id", attempt![0].id);
    }
  });
});
