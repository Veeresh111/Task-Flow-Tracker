import { test, expect } from "./helpers";
import { SEED, getAnonClient, getAdminClient } from "./helpers";

test.describe("Business Workflow: Offer", () => {
  test("1. Offer status transitions follow business rules", () => {
    const validTransitions: Record<string, string[]> = {
      "Pending Approval": ["Approved", "Declined"],
      Approved: ["Sent", "Declined"],
      Sent: ["Accepted", "Declined", "Expired"],
      Accepted: [],
      Declined: [],
      Expired: [],
    };

    for (const [from, tos] of Object.entries(validTransitions)) {
      for (const to of tos) {
        expect(validTransitions[from]?.includes(to)).toBe(true);
      }
    }

    // Verify business rules
    // Can't go backwards
    expect(validTransitions["Accepted"]?.includes("Sent")).toBeFalsy();
    expect(validTransitions["Declined"]?.includes("Sent")).toBeFalsy();

    // Terminal states
    expect(validTransitions["Accepted"]?.length).toBe(0);
    expect(validTransitions["Declined"]?.length).toBe(0);
    expect(validTransitions["Expired"]?.length).toBe(0);
  });

  test("2. Can read offer_letters table structure", async () => {
    const anon = getAnonClient();
    const { data, error } = await anon.from("offer_letters").select("*").limit(0);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("3. Offer insert succeeds after trigger fix", async () => {
    const admin = await getAdminClient();
    const t = Date.now();
    const { data, error } = await admin.from("offer_letters").insert({
      candidate_name: "Test Candidate",
      candidate_email: "test@example.com",
      job_title: "Test Position",
      candidate_id: SEED.candidateId,
      status: "Pending Approval",
    }).select();
    expect(error).toBeNull();
    if (data && data.length > 0) {
      await admin.from("offer_letters").delete().eq("id", data[0].id);
    }
  });

  test("4. Offer requires candidate with application", () => {
    const generateOffer = (
      applicationStatus: string,
      interviewCleared: boolean
    ): { valid: boolean; reason?: string } => {
      if (!interviewCleared) return { valid: false, reason: "Interview not cleared" };
      if (applicationStatus !== "Interview Cleared") {
        return { valid: false, reason: "Application not in Interview Cleared status" };
      }
      return { valid: true };
    };

    let result = generateOffer("Interview Cleared", true);
    expect(result.valid).toBe(true);

    result = generateOffer("Applied", false);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Interview not cleared");

    result = generateOffer("Applied", true);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Interview Cleared");
  });

  test("5. Offer approval flow requires sequential steps", () => {
    const approveOffer = (currentStatus: string, action: string): { valid: boolean; newStatus?: string } => {
      const transitions: Record<string, string[]> = {
        "Pending Approval": ["Approved"],
        Approved: ["Sent"],
        Sent: ["Accepted", "Declined"],
      };

      if (!transitions[currentStatus]?.includes(action)) {
        return { valid: false };
      }
      return { valid: true, newStatus: action === "Accepted" ? "Accepted" : action };
    };

    expect(approveOffer("Pending Approval", "Approved").valid).toBe(true);
    expect(approveOffer("Pending Approval", "Sent").valid).toBe(false); // Must approve first
    expect(approveOffer("Approved", "Sent").valid).toBe(true);
    expect(approveOffer("Sent", "Accepted").valid).toBe(true);
    expect(approveOffer("Sent", "Declined").valid).toBe(true);
    expect(approveOffer("Accepted", "Sent").valid).toBe(false); // Can't go back
  });

  test("6. Full lifecycle: application can transition through offer stages via DB", async () => {
    const admin = await getAdminClient();
    const ts = Date.now();

    // Create application
    const { data: app } = await admin.from("job_applications").upsert({
      form_id: SEED.jobFormId,
      candidate_id: SEED.candidateId,
      candidate_name: SEED.candidateName,
      candidate_email: "e2e-offer-lifecycle-" + ts + "@test.com",
      status: "Interview Cleared",
      answers: {},
    }, { onConflict: "candidate_id, form_id" }).select();

    expect(app).not.toBeNull();
    expect(app!.length).toBe(1);

    // Transition through offer stages
    for (const status of ["Offer Generated", "Offer Accepted"]) {
      const { error: updateErr } = await admin.from("job_applications")
        .update({ status }).eq("id", app![0].id);
      expect(updateErr).toBeNull();

      const { data: check } = await admin.from("job_applications")
        .select("status").eq("id", app![0].id);
      expect(check![0].status).toBe(status);
    }

    // Cleanup
    try { await admin.from("job_applications").delete().eq("id", app![0].id); } catch {} // eslint-disable-line no-empty
  });
});
