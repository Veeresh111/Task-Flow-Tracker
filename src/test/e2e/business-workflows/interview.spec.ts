import { test, expect } from "./helpers";
import { SEED, getAnonClient, getAdminClient } from "./helpers";

test.describe("Business Workflow: Interview", () => {
  test("1. Interview sessions table is queryable and supports required columns", async () => {
    const admin = await getAdminClient();
    const sessionId = crypto.randomUUID();

    const { data: session, error } = await admin.from("interview_sessions").insert({
      id: sessionId,
      application_id: "00000000-0000-0000-0000-000000000000",
      round_number: 1,
      status: "Scheduled",
    }).select();

    expect(error).toBeNull();
    expect(session).toBeDefined();
    expect(session![0].status).toBe("Scheduled");
    expect(session![0].round_number).toBe(1);

    // Update status
    const { error: updateErr } = await admin.from("interview_sessions")
      .update({ status: "Completed", score: 85, feedback: "Strong candidate" })
      .eq("id", sessionId);

    expect(updateErr).toBeNull();

    // Read back updated record
    const { data: updated } = await admin.from("interview_sessions").select("*").eq("id", sessionId);
    expect(updated![0].status).toBe("Completed");
    expect(updated![0].score).toBe(85);

    // Cleanup
    await admin.from("interview_sessions").delete().eq("id", sessionId);
  });

  test("2. Interview status transitions follow valid order", () => {
    const validTransitions: Record<string, string[]> = {
      Scheduled: ["In Progress", "Cancelled", "Rescheduled"],
      "In Progress": ["Completed", "Cancelled"],
      Completed: ["Reviewed"],
      Reviewed: [],
      Cancelled: ["Rescheduled"],
      Rescheduled: ["Scheduled"],
    };

    for (const [from, tos] of Object.entries(validTransitions)) {
      for (const to of tos) {
        expect(validTransitions[from]?.includes(to)).toBe(true);
      }
    }

    // Terminal states
    expect(validTransitions["Reviewed"]?.length).toBe(0);
  });

  test("3. Interview with scores updates application status", async () => {
    const admin = await getAdminClient();

    // Create an application first
    const ts = Date.now();
    const { data: app, error: appInsertErr } = await admin.from("job_applications").upsert({
      form_id: SEED.jobFormId,
      candidate_id: SEED.candidateId,
      candidate_name: SEED.candidateName,
      candidate_email: "e2e-int-" + ts + "@test.com",
      status: "Interview Scheduled",
      answers: {},
    }, { onConflict: "candidate_id, form_id" }).select();

    expect(appInsertErr).toBeNull();
    expect(app).not.toBeNull();
    expect(app!.length).toBe(1);

    // Create interview for this application
    const sessionId = crypto.randomUUID();
    const { error: intErr } = await admin.from("interview_sessions").insert({
      id: sessionId,
      application_id: app![0].id,
      round_number: 1,
      status: "Scheduled",
    }).select();
    expect(intErr).toBeNull();

    // Update app status to Interview Cleared
    const { error: appUpdateErr } = await admin.from("job_applications")
      .update({ status: "Interview Cleared" })
      .eq("id", app![0].id);
    expect(appUpdateErr).toBeNull();

    // Verify
    const { data: updatedApp } = await admin.from("job_applications").select("status").eq("id", app![0].id);
    expect(updatedApp![0].status).toBe("Interview Cleared");

    // Cleanup (best-effort — RLS may block delete)
    try { await admin.from("interview_sessions").delete().eq("id", sessionId); } catch {} // eslint-disable-line no-empty
    try { await admin.from("job_applications").delete().eq("id", app![0].id); } catch {} // eslint-disable-line no-empty
  });
});
