import { describe, it, expect } from "vitest";

const VALID_APPLICATION_STATUSES = [
  "Applied", "Screening", "Shortlisted", "ATS Shortlisted",
  "Recruiter Screening", "Assessment Assigned",
  "Assessment Passed", "Assessment Completed",
  "Interview Scheduled", "Interview Cleared",
  "Offer Generated", "Offer Accepted",
  "Onboarding", "Rejected",
] as const;

type ApplicationStatus = typeof VALID_APPLICATION_STATUSES[number];

const VALID_INTERVIEW_STATUSES = [
  "Not Scheduled", "Pending Scheduling", "Scheduled",
  "Rescheduled", "Completed", "Cancelled", "No Show", "Pending",
] as const;

type InterviewStatus = typeof VALID_INTERVIEW_STATUSES[number];

interface JobApplication {
  id: string;
  candidate_id: string;
  form_id: string;
  status: ApplicationStatus;
  interview_status: InterviewStatus | string | null;
  match_score: number | null;
  assessment_score: number | null;
  interview_score: number | null;
  offer_status: string | null;
}

const EARLY_STAGES: ApplicationStatus[] = ["Applied", "Screening"];
const SHORTLISTING_STAGES: ApplicationStatus[] = ["Shortlisted", "ATS Shortlisted", "Recruiter Screening"];
const ASSESSMENT_STAGES: ApplicationStatus[] = ["Assessment Assigned", "Assessment Passed", "Assessment Completed"];
const INTERVIEW_STAGES: ApplicationStatus[] = ["Interview Scheduled", "Interview Cleared"];
const OFFER_STAGES: ApplicationStatus[] = ["Offer Generated", "Offer Accepted"];
const TERMINAL_STAGES: ApplicationStatus[] = ["Onboarding", "Rejected"];

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

function computeInterviewStatus(status: ApplicationStatus, passed: boolean): InterviewStatus {
  if (status === "Assessment Passed" && passed) return "Pending Scheduling";
  if (status === "Rejected") return "Pending";
  return "Not Scheduled";
}

function computeOfferStatus(status: ApplicationStatus): string {
  if (status === "Offer Generated") return "Generated";
  if (status === "Offer Accepted") return "Accepted";
  return "Not Generated";
}

describe("Application Status Validators", () => {
  describe("VALID_APPLICATION_STATUSES", () => {
    it("has all required pipeline stages", () => {
      expect(VALID_APPLICATION_STATUSES).toContain("Applied");
      expect(VALID_APPLICATION_STATUSES).toContain("Assessment Passed");
      expect(VALID_APPLICATION_STATUSES).toContain("Interview Scheduled");
      expect(VALID_APPLICATION_STATUSES).toContain("Offer Generated");
      expect(VALID_APPLICATION_STATUSES).toContain("Onboarding");
      expect(VALID_APPLICATION_STATUSES).toContain("Rejected");
      expect(VALID_APPLICATION_STATUSES.length).toBe(14);
    });

    it("every status appears in exactly one stage group", () => {
      const counted = new Set<string>();
      for (const group of STAGE_GROUPS) {
        for (const s of group) {
          expect(counted.has(s)).toBe(false);
          counted.add(s);
        }
      }
      expect(counted.size).toBe(VALID_APPLICATION_STATUSES.length);
    });
  });

  describe("isTerminalStage", () => {
    it("returns true for terminal statuses", () => {
      expect(isTerminalStage("Onboarding")).toBe(true);
      expect(isTerminalStage("Rejected")).toBe(true);
    });

    it("returns false for non-terminal statuses", () => {
      expect(isTerminalStage("Applied")).toBe(false);
      expect(isTerminalStage("Interview Scheduled")).toBe(false);
      expect(isTerminalStage("Offer Generated")).toBe(false);
    });
  });

  describe("isRejected", () => {
    it("identifies Rejected status", () => {
      expect(isRejected("Rejected")).toBe(true);
      expect(isRejected("Applied")).toBe(false);
    });
  });

  describe("getStageGroup", () => {
    it("classifies early stages", () => {
      expect(getStageGroup("Applied")).toBe("early");
      expect(getStageGroup("Screening")).toBe("early");
    });

    it("classifies assessment stages", () => {
      expect(getStageGroup("Assessment Assigned")).toBe("assessment");
      expect(getStageGroup("Assessment Passed")).toBe("assessment");
    });

    it("classifies terminal stages", () => {
      expect(getStageGroup("Onboarding")).toBe("terminal");
      expect(getStageGroup("Rejected")).toBe("terminal");
    });

    it("returns unknown for invalid status", () => {
      expect(getStageGroup("Invalid Status")).toBe("unknown");
    });
  });

  describe("isValidStatusTransition", () => {
    it("allows staying in the same status", () => {
      expect(isValidStatusTransition("Applied", "Applied")).toBe(true);
      expect(isValidStatusTransition("Rejected", "Rejected")).toBe(true);
    });

    it("allows moving forward through the pipeline", () => {
      expect(isValidStatusTransition("Applied", "Shortlisted")).toBe(true);
      expect(isValidStatusTransition("Shortlisted", "Assessment Assigned")).toBe(true);
      expect(isValidStatusTransition("Assessment Passed", "Interview Scheduled")).toBe(true);
      expect(isValidStatusTransition("Interview Cleared", "Offer Generated")).toBe(true);
      expect(isValidStatusTransition("Offer Generated", "Offer Accepted")).toBe(true);
      expect(isValidStatusTransition("Offer Accepted", "Onboarding")).toBe(true);
    });

    it("allows rejection from any non-terminal status", () => {
      expect(isValidStatusTransition("Applied", "Rejected")).toBe(true);
      expect(isValidStatusTransition("Interview Scheduled", "Rejected")).toBe(true);
      expect(isValidStatusTransition("Offer Generated", "Rejected")).toBe(true);
    });

    it("prevents transitions from terminal statuses", () => {
      expect(isValidStatusTransition("Rejected", "Applied")).toBe(false);
      expect(isValidStatusTransition("Onboarding", "Offer Accepted")).toBe(false);
    });

    it("prevents moving backward", () => {
      expect(isValidStatusTransition("Offer Generated", "Applied")).toBe(false);
      expect(isValidStatusTransition("Assessment Assigned", "Shortlisted")).toBe(false);
      expect(isValidStatusTransition("Interview Scheduled", "Applied")).toBe(false);
    });

    it("handles assessment-specific transitions", () => {
      expect(isValidStatusTransition("Assessment Assigned", "Assessment Passed")).toBe(true);
      expect(isValidStatusTransition("Assessment Assigned", "Assessment Completed")).toBe(true);
    });

    it("returns false for unknown statuses", () => {
      expect(isValidStatusTransition("Applied", "Unknown")).toBe(false);
      expect(isValidStatusTransition("Unknown", "Applied")).toBe(false);
    });
  });

  describe("isEligibleForAssessment", () => {
    it("returns true for shortlisted candidates", () => {
      expect(isEligibleForAssessment("Shortlisted")).toBe(true);
      expect(isEligibleForAssessment("ATS Shortlisted")).toBe(true);
    });

    it("returns false for early or terminal stages", () => {
      expect(isEligibleForAssessment("Applied")).toBe(false);
      expect(isEligibleForAssessment("Rejected")).toBe(false);
    });
  });

  describe("computeInterviewStatus", () => {
    it("sets Pending Scheduling after passing assessment", () => {
      expect(computeInterviewStatus("Assessment Passed", true)).toBe("Pending Scheduling");
    });

    it("sets Pending after rejected assessment", () => {
      expect(computeInterviewStatus("Rejected", false)).toBe("Pending");
    });

    it("defaults to Not Scheduled", () => {
      expect(computeInterviewStatus("Applied", false)).toBe("Not Scheduled");
    });
  });

  describe("computeOfferStatus", () => {
    it("returns Generated for Offer Generated", () => {
      expect(computeOfferStatus("Offer Generated")).toBe("Generated");
    });

    it("returns Accepted for Offer Accepted", () => {
      expect(computeOfferStatus("Offer Accepted")).toBe("Accepted");
    });

    it("returns Not Generated for other statuses", () => {
      expect(computeOfferStatus("Applied")).toBe("Not Generated");
      expect(computeOfferStatus("Interview Scheduled")).toBe("Not Generated");
    });
  });
});
