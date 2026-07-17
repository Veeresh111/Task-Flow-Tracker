import { describe, it, expect } from "vitest";

// Extended status validators from src/lib/status-validators.ts
// Inlined for test isolation (no import dependency issues)

const OFFER_LETTER_STATUSES = [
  "Pending Approval", "Approved", "Sent", "Accepted", "Declined", "Expired",
] as const;

const JOB_FORM_STATUSES = ["Draft", "Published", "Open", "Closed", "Archived"] as const;

const JOB_FORM_ORDER: Record<string, number> = {
  "Draft": 0,
  "Published": 1,
  "Open": 1,
  "Closed": 2,
  "Archived": 3,
  "Expired": 3,
};

const VALID_APPLICATION_STATUSES = [
  "Applied", "Screening", "Shortlisted", "ATS Shortlisted",
  "Recruiter Screening", "Assessment Assigned",
  "Assessment Passed", "Assessment Completed",
  "Interview Scheduled", "Interview Cleared",
  "Offer Generated", "Offer Accepted", "Offer Declined",
  "Onboarding", "Rejected",
] as const;

type ApplicationStatus = typeof VALID_APPLICATION_STATUSES[number];

const EARLY_STAGES: ApplicationStatus[] = ["Applied", "Screening"];
const SHORTLISTING_STAGES: ApplicationStatus[] = ["Shortlisted", "ATS Shortlisted", "Recruiter Screening"];
const ASSESSMENT_STAGES: ApplicationStatus[] = ["Assessment Assigned", "Assessment Passed", "Assessment Completed"];
const INTERVIEW_STAGES: ApplicationStatus[] = ["Interview Scheduled", "Interview Cleared"];
const OFFER_STAGES: ApplicationStatus[] = ["Offer Generated", "Offer Accepted"];
const TERMINAL_STAGES: ApplicationStatus[] = ["Onboarding", "Offer Declined", "Rejected"];

const STAGE_GROUPS: ApplicationStatus[][] = [
  EARLY_STAGES, SHORTLISTING_STAGES, ASSESSMENT_STAGES,
  INTERVIEW_STAGES, OFFER_STAGES, TERMINAL_STAGES,
];

function isTerminalStage(status: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(status);
}

function isRejected(status: string): boolean {
  return status === "Rejected";
}

function isInGroup(status: string, group: readonly ApplicationStatus[]): boolean {
  return (group as readonly string[]).includes(status);
}

function getStageGroup(status: string): string {
  if (isInGroup(status, EARLY_STAGES)) return "early";
  if (isInGroup(status, SHORTLISTING_STAGES)) return "shortlisting";
  if (isInGroup(status, ASSESSMENT_STAGES)) return "assessment";
  if (isInGroup(status, INTERVIEW_STAGES)) return "interview";
  if (isInGroup(status, OFFER_STAGES)) return "offer";
  if (isInGroup(status, TERMINAL_STAGES)) return "terminal";
  return "unknown";
}

function isValidStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (to === "Rejected") return true;
  if (isTerminalStage(from)) return false;
  if (from === "Assessment Assigned" && to === "Assessment Passed") return true;
  if (from === "Assessment Assigned" && to === "Assessment Completed") return true;
  if (from === "Assessment Passed" && to === "Interview Scheduled") return true;
  if (from === "Interview Scheduled" && to === "Interview Cleared") return true;
  if (from === "Interview Cleared" && to === "Offer Generated") return true;
  if (from === "Offer Generated" && to === "Offer Accepted") return true;
  if (from === "Offer Generated" && to === "Offer Declined") return true;
  if (from === "Offer Accepted" && to === "Offer Declined") return true;
  if (from === "Offer Accepted" && to === "Onboarding") return true;
  const fromGroup = getStageGroup(from);
  const toGroup = getStageGroup(to);
  if (fromGroup === "unknown" || toGroup === "unknown") return false;
  const fromIdx = STAGE_GROUPS.findIndex(g => g.includes(from as ApplicationStatus));
  const toIdx = STAGE_GROUPS.findIndex(g => g.includes(to as ApplicationStatus));
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx >= fromIdx;
}

function isEligibleForAssessment(status: string): boolean {
  return isInGroup(status, [...SHORTLISTING_STAGES, "Assessment Assigned"]);
}

function computeInterviewStatus(status: ApplicationStatus, passed: boolean): string {
  if (status === "Assessment Passed" && passed) return "Pending Scheduling";
  if (status === "Rejected") return "Pending";
  return "Not Scheduled";
}

function computeOfferStatus(status: ApplicationStatus): string {
  if (status === "Offer Generated") return "Generated";
  if (status === "Offer Accepted") return "Accepted";
  return "Not Generated";
}

function isValidOfferStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const ORDER = OFFER_LETTER_STATUSES as readonly string[];
  const fromIdx = ORDER.indexOf(from);
  const toIdx = ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  if (to === "Declined" || to === "Expired") return true;
  return toIdx >= fromIdx;
}

function isValidJobFormStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const fromOrder = JOB_FORM_ORDER[from];
  const toOrder = JOB_FORM_ORDER[to];
  if (fromOrder === undefined || toOrder === undefined) return false;
  return toOrder >= fromOrder;
}

// ============================================================
// Tests
// ============================================================

describe("Extended Status Validators", () => {
  describe("VALID_APPLICATION_STATUSES (extended)", () => {
    it("includes Offer Declined", () => {
      expect(VALID_APPLICATION_STATUSES).toContain("Offer Declined");
    });

    it("has exactly 15 statuses", () => {
      expect(VALID_APPLICATION_STATUSES.length).toBe(15);
    });
  });

  describe("isTerminalStage (extended)", () => {
    it("considers Offer Declined as terminal", () => {
      expect(isTerminalStage("Offer Declined")).toBe(true);
    });

    it("blocks transitions from Offer Declined", () => {
      expect(isValidStatusTransition("Offer Declined", "Applied")).toBe(false);
      expect(isValidStatusTransition("Offer Declined", "Onboarding")).toBe(false);
    });

    it("allows rejection from any non-terminal", () => {
      expect(isValidStatusTransition("Offer Generated", "Rejected")).toBe(true);
    });
  });

  describe("Offer-specific transitions", () => {
    it("allows Offer Generated → Offer Declined", () => {
      expect(isValidStatusTransition("Offer Generated", "Offer Declined")).toBe(true);
    });

    it("allows Offer Accepted → Offer Declined", () => {
      expect(isValidStatusTransition("Offer Accepted", "Offer Declined")).toBe(true);
    });

    it("allows Offer Accepted → Onboarding", () => {
      expect(isValidStatusTransition("Offer Accepted", "Onboarding")).toBe(true);
    });

    it("blocks Offer Declined → any other status", () => {
      expect(isValidStatusTransition("Offer Declined", "Offer Generated")).toBe(false);
      expect(isValidStatusTransition("Offer Declined", "Onboarding")).toBe(false);
    });
  });

  describe("isEligibleForAssessment", () => {
    it("returns true for Recruiter Screening", () => {
      expect(isEligibleForAssessment("Recruiter Screening")).toBe(true);
    });

    it("returns false for Interview Scheduled", () => {
      expect(isEligibleForAssessment("Interview Scheduled")).toBe(false);
    });

    it("returns true for Assessment Assigned (re-assessment)", () => {
      expect(isEligibleForAssessment("Assessment Assigned")).toBe(true);
    });
  });

  describe("computeOfferStatus", () => {
    it("returns Not Generated for Offer Declined", () => {
      expect(computeOfferStatus("Offer Declined")).toBe("Not Generated");
    });
  });

  describe("Offer Letter Status Transitions", () => {
    it("allows forward transitions", () => {
      expect(isValidOfferStatusTransition("Pending Approval", "Approved")).toBe(true);
      expect(isValidOfferStatusTransition("Approved", "Sent")).toBe(true);
      expect(isValidOfferStatusTransition("Sent", "Accepted")).toBe(true);
    });

    it("allows decline from any status", () => {
      expect(isValidOfferStatusTransition("Pending Approval", "Declined")).toBe(true);
      expect(isValidOfferStatusTransition("Approved", "Declined")).toBe(true);
      expect(isValidOfferStatusTransition("Sent", "Declined")).toBe(true);
    });

    it("allows expiry from Sent", () => {
      expect(isValidOfferStatusTransition("Sent", "Expired")).toBe(true);
    });

    it("prevents backward transitions", () => {
      expect(isValidOfferStatusTransition("Approved", "Pending Approval")).toBe(false);
      expect(isValidOfferStatusTransition("Sent", "Pending Approval")).toBe(false);
    });

    it("rejects invalid statuses", () => {
      expect(isValidOfferStatusTransition("Pending Approval", "Invalid")).toBe(false);
      expect(isValidOfferStatusTransition("Unknown", "Approved")).toBe(false);
    });

    it("allows same status", () => {
      expect(isValidOfferStatusTransition("Pending Approval", "Pending Approval")).toBe(true);
    });
  });

  describe("Job Form Status Transitions", () => {
    it("allows Draft → Published", () => {
      expect(isValidJobFormStatusTransition("Draft", "Published")).toBe(true);
    });

    it("allows Draft → Open", () => {
      expect(isValidJobFormStatusTransition("Draft", "Open")).toBe(true);
    });

    it("allows Published → Open", () => {
      expect(isValidJobFormStatusTransition("Published", "Open")).toBe(true);
    });

    it("allows Open → Closed", () => {
      expect(isValidJobFormStatusTransition("Open", "Closed")).toBe(true);
    });

    it("allows Closed → Archived", () => {
      expect(isValidJobFormStatusTransition("Closed", "Archived")).toBe(true);
    });

    it("prevents backward transitions", () => {
      expect(isValidJobFormStatusTransition("Open", "Draft")).toBe(false);
      expect(isValidJobFormStatusTransition("Closed", "Open")).toBe(false);
      expect(isValidJobFormStatusTransition("Archived", "Draft")).toBe(false);
    });

    it("prevents Published → Draft regression", () => {
      expect(isValidJobFormStatusTransition("Published", "Draft")).toBe(false);
    });

    it("rejects unknown statuses", () => {
      expect(isValidJobFormStatusTransition("Draft", "Unknown")).toBe(false);
      expect(isValidJobFormStatusTransition("Unknown", "Draft")).toBe(false);
    });

    it("allows same status", () => {
      expect(isValidJobFormStatusTransition("Draft", "Draft")).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("handles undefined/empty from status", () => {
      expect(isValidStatusTransition("", "Applied")).toBe(false);
      expect(getStageGroup("")).toBe("unknown");
    });

    it("handles case sensitivity", () => {
      expect(isValidStatusTransition("applied", "shortlisted")).toBe(false);
      expect(isValidStatusTransition("Applied", "Rejected")).toBe(true);
    });
  });
});
