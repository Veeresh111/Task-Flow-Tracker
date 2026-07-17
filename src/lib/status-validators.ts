export const VALID_APPLICATION_STATUSES = [
  "Applied", "Screening", "Shortlisted", "ATS Shortlisted",
  "Recruiter Screening", "Assessment Assigned",
  "Assessment Passed", "Assessment Completed",
  "Interview Scheduled", "Interview Cleared",
  "Offer Generated", "Offer Accepted", "Offer Declined",
  "Onboarding", "Rejected",
] as const;

export type ApplicationStatus = typeof VALID_APPLICATION_STATUSES[number];

export const VALID_INTERVIEW_STATUSES = [
  "Not Scheduled", "Pending Scheduling", "Scheduled",
  "Rescheduled", "Completed", "Cancelled", "No Show", "Pending",
] as const;

export type InterviewStatus = typeof VALID_INTERVIEW_STATUSES[number];

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

export function isTerminalStage(status: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(status);
}

export function isRejected(status: string): boolean {
  return status === "Rejected";
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

function isInGroup(status: string, group: readonly ApplicationStatus[]): boolean {
  return (group as readonly string[]).includes(status);
}

export function isValidStatusTransition(from: string, to: string): boolean {
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

export function isEligibleForAssessment(status: string): boolean {
  return isInGroup(status, [...SHORTLISTING_STAGES, "Assessment Assigned"]);
}

export function computeInterviewStatus(status: ApplicationStatus, passed: boolean): InterviewStatus {
  if (status === "Assessment Passed" && passed) return "Pending Scheduling";
  if (status === "Rejected") return "Pending";
  return "Not Scheduled";
}

export function computeOfferStatus(status: ApplicationStatus): string {
  if (status === "Offer Generated") return "Generated";
  if (status === "Offer Accepted") return "Accepted";
  return "Not Generated";
}

export const OFFER_LETTER_STATUSES = [
  "Pending Approval", "Approved", "Sent", "Accepted", "Declined", "Expired",
] as const;

export function isValidOfferStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const ORDER = OFFER_LETTER_STATUSES as readonly string[];
  const fromIdx = ORDER.indexOf(from);
  const toIdx = ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  if (to === "Declined" || to === "Expired") return true;
  return toIdx >= fromIdx;
}

export const JOB_FORM_STATUSES = ["Draft", "Published", "Open", "Closed", "Archived"] as const;

const JOB_FORM_ORDER: Record<string, number> = {
  "Draft": 0,
  "Published": 1,
  "Open": 1,
  "Closed": 2,
  "Archived": 3,
  "Expired": 3,
};

export function isValidJobFormStatusTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const fromOrder = JOB_FORM_ORDER[from];
  const toOrder = JOB_FORM_ORDER[to];
  if (fromOrder === undefined || toOrder === undefined) return false;
  return toOrder >= fromOrder;
}
