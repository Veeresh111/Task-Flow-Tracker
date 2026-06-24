import { describe, it, expect, vi, beforeEach } from "vitest";

interface FlowActor {
  id: string;
  name: string;
  email: string;
}

interface JobForm {
  id: string;
  job_title: string;
  location: string;
  jd_text: string;
  requires_assessment: boolean;
  status: string;
}

interface JobApplication {
  id: string;
  form_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  match_score: number | null;
  assessment_score: number | null;
  interview_status: string | null;
  offer_status: string | null;
}

interface Assessment {
  id: string;
  title: string;
  questions: { question: string; options: string[]; correctAnswer: string }[];
  passing_score: number;
  job_form_id: string;
}

interface InterviewSession {
  id: string;
  application_id: string;
  round_name: string;
  scheduled_at: string;
  status: string;
  score: number | null;
}

interface CandidateNotification {
  id: string;
  candidate_id: string;
  title: string;
  message: string;
  read: boolean;
}

interface AssessmentToken {
  id: string;
  assessment_id: string;
  candidate_id: string;
  application_id: string;
  token: string;
  status: string;
  used: boolean;
}

const VIOLATION_MAX = 5;

function generateId(): string {
  return crypto.randomUUID();
}

function makeAssessmentToken(): AssessmentToken {
  return {
    id: generateId(),
    assessment_id: "",
    candidate_id: "",
    application_id: "",
    token: generateId(),
    status: "Active",
    used: false,
  };
}

function makeJobForm(overrides: Partial<JobForm> = {}): JobForm {
  return {
    id: generateId(),
    job_title: "Software Engineer",
    location: "Bangalore",
    jd_text: "Build great software.",
    requires_assessment: true,
    status: "Open",
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: generateId(),
    title: "Technical Screening",
    questions: [
      { question: "What is 2+2?", options: ["3", "4", "5", "6"], correctAnswer: "4" },
      { question: "What is React?", options: ["Library", "Framework", "Language", "Database"], correctAnswer: "Library" },
    ],
    passing_score: 70,
    job_form_id: "",
    ...overrides,
  };
}

function gradeAnswers(
  questions: Assessment["questions"],
  answers: Record<number, string>,
  passingScore: number,
): { score: number; passed: boolean; correctCount: number } {
  let correctCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const user = (answers[i] || "").trim().toLowerCase();
    const master = (questions[i].correctAnswer || "").trim().toLowerCase();
    if (user === master) correctCount++;
  }
  const pct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  return { score: pct, passed: pct >= passingScore, correctCount };
}

class RecruitmentFlowHarness {
  forms: Map<string, JobForm> = new Map();
  applications: Map<string, JobApplication> = new Map();
  candidateApps: Map<string, any> = new Map();
  assessments: Map<string, Assessment> = new Map();
  tokens: Map<string, AssessmentToken> = new Map();
  sessions: Map<string, InterviewSession> = new Map();
  notifications: CandidateNotification[] = [];
  candidates: Map<string, FlowActor> = new Map();
  profiles: Map<string, any> = new Map();
  eventLog: string[] = [];

  private syncToCandidateApp(ja: JobApplication): void {
    const key = `${ja.candidate_id}_${ja.form_id}`;
    this.candidateApps.set(key, {
      candidate_id: ja.candidate_id,
      job_form_id: ja.form_id,
      job_application_id: ja.id,
      status: ja.status,
      ai_score: ja.match_score,
      interview_status: ja.interview_status || "Pending",
      offer_status: ja.offer_status,
      assessment_score: ja.assessment_score,
    });
  }

  private updateCandidateApp(ja: JobApplication): void {
    const key = `${ja.candidate_id}_${ja.form_id}`;
    const existing = this.candidateApps.get(key);
    if (existing) {
      existing.status = ja.status;
      if (ja.match_score !== null) existing.ai_score = ja.match_score;
      if (ja.assessment_score !== null) existing.assessment_score = ja.assessment_score;
      if (ja.interview_status !== null) existing.interview_status = ja.interview_status;
      if (ja.offer_status !== null) existing.offer_status = ja.offer_status;
    }
  }

  step1_createJobForm(hrUser: FlowActor): JobForm {
    const form = makeJobForm({ created_by: hrUser.id });
    this.forms.set(form.id, form);
    this.eventLog.push(`HR ${hrUser.name} created job form "${form.job_title}" (${form.id})`);
    return form;
  }

  step2_apply(jobForm: JobForm, candidate: FlowActor): JobApplication {
    const app: JobApplication = {
      id: generateId(),
      form_id: jobForm.id,
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      candidate_email: candidate.email,
      status: "Applied",
      match_score: null,
      assessment_score: null,
      interview_status: null,
      offer_status: null,
    };
    this.applications.set(app.id, app);
    this.syncToCandidateApp(app);
    this.eventLog.push(`Candidate ${candidate.name} applied to "${jobForm.job_title}"`);
    return app;
  }

  step3_hrScreens(hrUser: FlowActor, app: JobApplication, score: number): JobApplication {
    const updated = { ...app, match_score: score, status: score >= 75 ? "Shortlisted" : "Screening" };
    this.applications.set(updated.id, updated);
    this.updateCandidateApp(updated);
    this.eventLog.push(`HR ${hrUser.name} screened ${app.candidate_name}: score=${score} → ${updated.status}`);
    return updated;
  }

  step4_assignAssessment(hrUser: FlowActor, jobForm: JobForm, app: JobApplication): { token: AssessmentToken; assessment: Assessment } {
    const assessment = makeAssessment({ job_form_id: jobForm.id });
    this.assessments.set(assessment.id, assessment);

    const appUpdated = { ...app, status: "Assessment Assigned" };
    this.applications.set(appUpdated.id, appUpdated);
    this.updateCandidateApp(appUpdated);

    const token: AssessmentToken = {
      ...makeAssessmentToken(),
      assessment_id: assessment.id,
      candidate_id: app.candidate_id,
      application_id: app.id,
    };
    this.tokens.set(token.token, token);

    this.notifications.push({
      id: generateId(),
      candidate_id: app.candidate_id,
      title: "Assessment Assigned",
      message: `Assessment token: ${token.token}`,
      read: false,
    });

    this.eventLog.push(`HR ${hrUser.name} assigned assessment "${assessment.title}" to ${app.candidate_name}`);
    return { token, assessment };
  }

  step5_candidateTakesAssessment(
    app: JobApplication,
    assessment: Assessment,
    answers: Record<number, string>,
    violationCount: number = 0,
  ): { result: { score: number; passed: boolean }; updatedApp: JobApplication } {
    const { score, passed, correctCount } = gradeAnswers(assessment.questions, answers, assessment.passing_score);
    const wasDisqualified = violationCount >= VIOLATION_MAX;
    const finalPassed = passed && !wasDisqualified;

    const updatedApp: JobApplication = {
      ...app,
      assessment_score: score,
      status: finalPassed ? "Assessment Passed" : "Rejected",
      interview_status: finalPassed ? "Pending Scheduling" : "Pending",
    };
    this.applications.set(updatedApp.id, updatedApp);
    this.updateCandidateApp(updatedApp);

    this.eventLog.push(
      `Candidate ${app.candidate_name} submitted assessment: ${correctCount}/${assessment.questions.length} correct → ${updatedApp.status}`,
    );
    return { result: { score, passed: finalPassed }, updatedApp };
  }

  step6_scheduleInterview(hrUser: FlowActor, app: JobApplication, round: string): InterviewSession {
    const session: InterviewSession = {
      id: generateId(),
      application_id: app.id,
      round_name: round,
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      status: "Scheduled",
      score: null,
    };
    this.sessions.set(session.id, session);

    const updatedApp = { ...app, status: "Interview Scheduled", interview_status: "Scheduled" };
    this.applications.set(updatedApp.id, updatedApp);
    this.updateCandidateApp(updatedApp);

    this.eventLog.push(`HR ${hrUser.name} scheduled "${round}" for ${app.candidate_name}`);
    return session;
  }

  step7_scoreInterview(hrUser: FlowActor, session: InterviewSession, app: JobApplication, score: number): { updatedSession: InterviewSession; updatedApp: JobApplication } {
    const updatedSession = { ...session, score, status: "Completed" };
    this.sessions.set(updatedSession.id, updatedSession);

    const updatedApp: JobApplication = {
      ...app,
      interview_score: score,
      status: score >= 75 ? "Interview Cleared" : "Rejected",
      interview_status: "Completed",
    };
    this.applications.set(updatedApp.id, updatedApp);
    this.updateCandidateApp(updatedApp);

    this.eventLog.push(`HR ${hrUser.name} scored interview for ${app.candidate_name}: ${score} → ${updatedApp.status}`);
    return { updatedSession, updatedApp };
  }

  getApplication(appId: string): JobApplication | undefined {
    return this.applications.get(appId);
  }

  getCandidateApp(candidateId: string, formId: string): any {
    return this.candidateApps.get(`${candidateId}_${formId}`);
  }

  getLog(): string[] {
    return this.eventLog;
  }
}

describe("Complete Recruitment Pipeline Flow", () => {
  let harness: RecruitmentFlowHarness;
  let hr: FlowActor;
  let candidate: FlowActor;

  beforeEach(() => {
    harness = new RecruitmentFlowHarness();
    hr = { id: generateId(), name: "Hannah HR", email: "hr@company.com" };
    candidate = { id: generateId(), name: "Charlie Candidate", email: "charlie@example.com" };
  });

  it("runs the full happy path: create → apply → screen → assess → interview → offer", () => {
    const jobForm = harness.step1_createJobForm(hr);
    expect(jobForm.status).toBe("Open");

    const app = harness.step2_apply(jobForm, candidate);
    expect(app.status).toBe("Applied");
    expect(app.form_id).toBe(jobForm.id);

    const screened = harness.step3_hrScreens(hr, app, 88);
    expect(screened.status).toBe("Shortlisted");
    expect(screened.match_score).toBe(88);

    const { token, assessment } = harness.step4_assignAssessment(hr, jobForm, screened);
    expect(token.status).toBe("Active");
    expect(token.application_id).toBe(screened.id);
    expect(token.candidate_id).toBe(candidate.id);

    const { result, updatedApp } = harness.step5_candidateTakesAssessment(
      screened,
      assessment,
      { 0: "4", 1: "Library" },
      0,
    );
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(updatedApp.status).toBe("Assessment Passed");
    expect(updatedApp.assessment_score).toBe(100);
    expect(updatedApp.interview_status).toBe("Pending Scheduling");

    const session = harness.step6_scheduleInterview(hr, updatedApp, "Technical Round 1");
    expect(session.status).toBe("Scheduled");
    expect(session.application_id).toBe(updatedApp.id);

    const { updatedApp: finalApp } = harness.step7_scoreInterview(hr, session, updatedApp, 92);
    expect(finalApp.status).toBe("Interview Cleared");
    expect(finalApp.interview_score).toBe(92);

    const log = harness.getLog();
    expect(log.length).toBe(7);
    expect(log[0]).toContain("HR Hannah HR created job form");
    expect(log[1]).toContain("Charlie Candidate applied");
    expect(log[6]).toContain("Hannah HR scored interview for Charlie Candidate");
  });

  it("rejects candidate with low assessment score", () => {
    const jobForm = harness.step1_createJobForm(hr);
    const app = harness.step2_apply(jobForm, candidate);
    const screened = harness.step3_hrScreens(hr, app, 80);
    const { assessment } = harness.step4_assignAssessment(hr, jobForm, screened);

    const { result, updatedApp } = harness.step5_candidateTakesAssessment(
      screened,
      assessment,
      { 0: "3", 1: "Database" },
      0,
    );
    expect(result.passed).toBe(false);
    expect(updatedApp.status).toBe("Rejected");
    expect(updatedApp.interview_status).toBe("Pending");
  });

  it("disqualifies candidate with excessive violations", () => {
    const jobForm = harness.step1_createJobForm(hr);
    const app = harness.step2_apply(jobForm, candidate);
    const screened = harness.step3_hrScreens(hr, app, 82);
    const { assessment } = harness.step4_assignAssessment(hr, jobForm, screened);

    const { result, updatedApp } = harness.step5_candidateTakesAssessment(
      screened,
      assessment,
      { 0: "4", 1: "Library" },
      6,
    );
    expect(result.passed).toBe(false);
    expect(updatedApp.status).toBe("Rejected");
  });

  it("handles ats screening with below-threshold score", () => {
    const jobForm = harness.step1_createJobForm(hr);
    const app = harness.step2_apply(jobForm, candidate);
    const screened = harness.step3_hrScreens(hr, app, 45);
    expect(screened.status).toBe("Screening");
    expect(screened.match_score).toBe(45);
  });

  it("maintains data consistency between job_applications and candidate_applications", () => {
    const jobForm = harness.step1_createJobForm(hr);
    const app = harness.step2_apply(jobForm, candidate);
    const screened = harness.step3_hrScreens(hr, app, 85);

    const ca = harness.getCandidateApp(candidate.id, jobForm.id);
    expect(ca).toBeDefined();
    expect(ca.status).toBe("Shortlisted");
    expect(ca.ai_score).toBe(85);

    const { assessment } = harness.step4_assignAssessment(hr, jobForm, screened);
    harness.step5_candidateTakesAssessment(screened, assessment, { 0: "4", 1: "Library" }, 0);

    const caAfter = harness.getCandidateApp(candidate.id, jobForm.id);
    expect(caAfter.status).toBe("Assessment Passed");
    expect(caAfter.assessment_score).toBe(100);
  });
});
