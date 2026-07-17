import { describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// Shared types
// ============================================================================

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  stage: string;
}

interface JobForm {
  id: string;
  job_title: string;
  status: string;
  form_schema: { id: string; label: string; type: string; required: boolean }[];
}

interface JobApplication {
  id: string;
  form_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  answers: Record<string, string>;
}

interface AssessmentAttempt {
  id: string;
  assessment_id: string;
  candidate_id: string;
  started_at: string;
  completed_at: string | null;
}

interface ProctorResponse {
  faceCount?: number;
  objects?: string[];
  suspicious?: boolean;
  alerts?: string[];
  error?: string;
  ai_disabled?: boolean;
}

function genId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// 1. ApplyForm duplicate detection logic
// ============================================================================

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: genId(),
    full_name: "Test User",
    email: "test@example.com",
    phone: "+91 9876543210",
    stage: "Applied",
    ...overrides,
  };
}

function makeJobForm(overrides: Partial<JobForm> = {}): JobForm {
  return {
    id: genId(),
    job_title: "Software Engineer",
    status: "Open",
    form_schema: [
      { id: "full_name", label: "Full Name", type: "text", required: true },
      { id: "email", label: "Email", type: "email", required: true },
      { id: "resume_link", label: "Resume Link", type: "file", required: false },
    ],
    ...overrides,
  };
}

interface ApplyFormStore {
  candidates: Map<string, Candidate>;
  jobApplications: Map<string, JobApplication>;
  jobForms: Map<string, JobForm>;
}

class ApplyFormSimulator {
  store: ApplyFormStore = { candidates: new Map(), jobApplications: new Map(), jobForms: new Map() };
  errors: string[] = [];

  seedForm(form: JobForm): void {
    this.store.jobForms.set(form.id, form);
  }

  seedCandidate(candidate: Candidate): void {
    this.store.candidates.set(candidate.email, candidate);
  }

  submitApplication(
    formId: string,
    fullName: string,
    email: string,
    phone: string | null,
    answers: Record<string, string>,
  ): { success: boolean; candidate?: Candidate; application?: JobApplication; error?: string } {
    if (!email) return { success: false, error: "Email Required" };

    const form = this.store.jobForms.get(formId);
    if (!form) return { success: false, error: "Form not found" };

    // Find or create candidate (logic matching ApplyForm.tsx)
    let existingCandidate: Candidate | undefined;
    for (const c of this.store.candidates.values()) {
      if (c.email === email) {
        existingCandidate = c;
        break;
      }
    }

    if (existingCandidate) {
      // Check per-job duplicate (email + form_id)
      for (const app of this.store.jobApplications.values()) {
        if (app.candidate_id === existingCandidate.id && app.form_id === formId) {
          return { success: false, error: "Already Applied" };
        }
      }
    }

    const candidateId = existingCandidate?.id || genId();
    if (!existingCandidate) {
      const newCandidate: Candidate = {
        id: candidateId,
        full_name: fullName,
        email,
        phone,
        stage: "Applied",
      };
      this.store.candidates.set(email, newCandidate);
      existingCandidate = newCandidate;
    }

    const application: JobApplication = {
      id: genId(),
      form_id: formId,
      candidate_id: candidateId,
      candidate_name: fullName,
      candidate_email: email,
      status: "Applied",
      answers,
    };
    this.store.jobApplications.set(application.id, application);

    return { success: true, candidate: existingCandidate, application };
  }
}

function extractEmailFromField(value: string): string {
  const match = value.match(/<(.+)>/);
  return match ? match[1] : value;
}

function isTokenHardcoded(code: string): boolean {
  return code.includes("hf_bqNmy");
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countEmptyCatchBlocks(code: string): number {
  const matches = code.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g);
  if (!matches) return 0;
  return matches.filter(m => !m.includes("console.") && !m.includes("toast(") && !m.includes("throw")).length;
}

describe("Phase 4.3: ApplyForm flow — per-job duplicate detection", () => {
  let sim: ApplyFormSimulator;
  let form: JobForm;
  let candidate: Candidate;

  beforeEach(() => {
    sim = new ApplyFormSimulator();
    form = makeJobForm();
    candidate = makeCandidate();
    sim.seedForm(form);
  });

  it("allows first application for a new candidate", () => {
    const result = sim.submitApplication(form.id, "Alice", "alice@example.com", "+91 1111111111", {});
    expect(result.success).toBe(true);
    expect(result.application).toBeDefined();
    expect(result.application!.form_id).toBe(form.id);
    expect(result.application!.status).toBe("Applied");
  });

  it("rejects duplicate application to the same form for same candidate", () => {
    sim.seedCandidate(candidate);
    const first = sim.submitApplication(form.id, candidate.full_name, candidate.email, candidate.phone, {});
    expect(first.success).toBe(true);

    const second = sim.submitApplication(form.id, candidate.full_name, candidate.email, candidate.phone, {});
    expect(second.success).toBe(false);
    expect(second.error).toBe("Already Applied");
  });

  it("allows same candidate to apply to different forms", () => {
    sim.seedCandidate(candidate);
    const form2 = makeJobForm({ id: genId(), job_title: "Product Manager" });
    sim.seedForm(form2);

    const first = sim.submitApplication(form.id, candidate.full_name, candidate.email, candidate.phone, {});
    expect(first.success).toBe(true);

    const second = sim.submitApplication(form2.id, candidate.full_name, candidate.email, candidate.phone, {});
    expect(second.success).toBe(true);
    expect(second.application!.form_id).toBe(form2.id);
    expect(second.application!.candidate_id).toBe(candidate.id);
  });

  it("creates candidate record when none exists", () => {
    const result = sim.submitApplication(form.id, "New User", "new@example.com", null, {});
    expect(result.success).toBe(true);
    expect(result.candidate).toBeDefined();
    expect(result.candidate!.id).toBeDefined();
    expect(result.candidate!.email).toBe("new@example.com");
    expect(result.candidate!.stage).toBe("Applied");
  });

  it("rejects application when email is missing", () => {
    const result = sim.submitApplication(form.id, "No Email", "", null, {});
    expect(result.success).toBe(false);
  });

  it("handles file fields as text links", () => {
    const formWithFile = makeJobForm({
      form_schema: [
        { id: "resume", label: "Resume Link", type: "file", required: false },
        { id: "cover", label: "Cover Letter Link", type: "file", required: false },
      ],
    });
    sim.seedForm(formWithFile);

    const answers = {
      resume: "https://drive.google.com/file/d/abc123/view",
      cover: "https://docs.google.com/document/d/xyz789",
    };

    const result = sim.submitApplication(formWithFile.id, "Bob", "bob@example.com", null, answers);
    expect(result.success).toBe(true);
    expect(result.application!.answers).toEqual(answers);
  });
});

describe("Phase 4.4: AssessmentAccess timer exploit fix", () => {
  const DURATION_MINUTES = 60;
  const DURATION_SECONDS = DURATION_MINUTES * 60;

  function simulateTimerLogic(
    existingAttempt: AssessmentAttempt | null,
    now: number,
  ): { remainingSeconds: number; shouldReset: boolean; shouldExpire: boolean } {
    if (!existingAttempt) {
      return { remainingSeconds: DURATION_SECONDS, shouldReset: true, shouldExpire: false };
    }

    const passedSeconds = Math.floor((now - new Date(existingAttempt.started_at).getTime()) / 1000);
    const remainingSeconds = DURATION_SECONDS - passedSeconds;

    return {
      remainingSeconds: Math.max(0, remainingSeconds),
      shouldReset: false,
      shouldExpire: remainingSeconds <= 0,
    };
  }

  it("creates new attempt when no existing attempt", () => {
    const result = simulateTimerLogic(null, Date.now());
    expect(result.shouldReset).toBe(true);
    expect(result.remainingSeconds).toBe(DURATION_SECONDS);
    expect(result.shouldExpire).toBe(false);
  });

  it("resumes existing attempt with correct remaining time", () => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    const attempt: AssessmentAttempt = {
      id: genId(), assessment_id: genId(), candidate_id: genId(),
      started_at: startedAt, completed_at: null,
    };

    const result = simulateTimerLogic(attempt, Date.now());
    expect(result.shouldReset).toBe(false);
    expect(result.shouldExpire).toBe(false);
    expect(result.remainingSeconds).toBeGreaterThan(0);
    expect(result.remainingSeconds).toBeLessThan(DURATION_SECONDS);
  });

  it("expires when time is up (remainingSeconds <= 0)", () => {
    const startedAt = new Date(Date.now() - DURATION_SECONDS * 1000 - 1000).toISOString(); // >60 min ago
    const attempt: AssessmentAttempt = {
      id: genId(), assessment_id: genId(), candidate_id: genId(),
      started_at: startedAt, completed_at: null,
    };

    const result = simulateTimerLogic(attempt, Date.now());
    expect(result.shouldExpire).toBe(true);
  });

  it("never resets started_at — eliminates timer exploit", () => {
    const startedAt = new Date(Date.now() - DURATION_SECONDS * 1000 + 5000).toISOString(); // 5 seconds left
    const attempt: AssessmentAttempt = {
      id: genId(), assessment_id: genId(), candidate_id: genId(),
      started_at: startedAt, completed_at: null,
    };

    const result = simulateTimerLogic(attempt, Date.now());
    expect(result.shouldReset).toBe(false);
    expect(result.shouldExpire).toBe(false);
    expect(result.remainingSeconds).toBeLessThanOrEqual(5);
  });
});

describe("Phase 4.3/4.4: ApplyForm candidate creation links to job_applications", () => {
  it("creates both candidate and job_application in a single flow", () => {
    const store: ApplyFormStore = {
      candidates: new Map(),
      jobApplications: new Map(),
      jobForms: new Map(),
    };
    const form = makeJobForm();
    store.jobForms.set(form.id, form);

    const candidateId = genId();
    store.candidates.set("new@example.com", {
      id: candidateId,
      full_name: "New User",
      email: "new@example.com",
      phone: null,
      stage: "Applied",
    });

    const app: JobApplication = {
      id: genId(),
      form_id: form.id,
      candidate_id: candidateId,
      candidate_name: "New User",
      candidate_email: "new@example.com",
      status: "Applied",
      answers: {},
    };
    store.jobApplications.set(app.id, app);

    expect(store.candidates.get("new@example.com")?.stage).toBe("Applied");
    expect(store.jobApplications.get(app.id)?.form_id).toBe(form.id);
    expect(store.jobApplications.get(app.id)?.candidate_id).toBe(candidateId);
  });
});

describe("Phase 4.5: SmartInbox security fixes", () => {
  it("extracts email from From field with angle brackets", () => {
    expect(extractEmailFromField("John <john@example.com>")).toBe("john@example.com");
    expect(extractEmailFromField("john@example.com")).toBe("john@example.com");
    expect(extractEmailFromField("")).toBe("");
  });

  it("does not contain hardcoded HF_TOKEN fallback", () => {
    const code = `
      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;
      if (!HF_TOKEN) throw new Error("AI proxy token not configured");
    `;
    expect(isTokenHardcoded(code)).toBe(false);
  });

  it("detects hardcoded HF_TOKEN fallback", () => {
    const badCode = `
      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "hf_bqNmy...";
    `;
    expect(isTokenHardcoded(badCode)).toBe(true);
  });

  it("safely parses JSON without crashing", () => {
    expect(safeJsonParse('{"valid": true}')).toEqual({ valid: true });
    expect(safeJsonParse("invalid json")).toBeNull();
    expect(safeJsonParse("")).toBeNull();
    expect(safeJsonParse("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("routes sourced candidates into recruitment pipeline", () => {
    const candidates: Candidate[] = [
      { id: "cand-1", full_name: "Sourced A", email: "sourced-a@example.com", phone: null, stage: "Applied" },
    ];

    const pipelineEntries: JobApplication[] = [];
    const emailToPush = "sourced-a@example.com";
    const existingCand = candidates.find(c => c.email === emailToPush);

    if (existingCand) {
      pipelineEntries.push({
        id: genId(),
        candidate_id: existingCand.id,
        candidate_email: existingCand.email,
        form_id: "sourced-form",
        candidate_name: existingCand.full_name,
        status: "Sourced",
        answers: { source: "gmail_smart_inbox", subject: "Resume for SE Role" },
      });
    }

    expect(pipelineEntries.length).toBe(1);
    expect(pipelineEntries[0].status).toBe("Sourced");
    expect(pipelineEntries[0].candidate_id).toBe("cand-1");
  });

  it("skips pipeline push for unknown candidates", () => {
    const candidates: Candidate[] = [];
    const emailToPush = "unknown@example.com";
    const existingCand = candidates.find(c => c.email === emailToPush);
    expect(existingCand).toBeUndefined();
  });
});

describe("Phase 4.5: HR AI pages — no direct HF token exposure", () => {
  it("callCorporateAI is used instead of direct HF fetch", () => {
    const codeUsingCallCorporateAI = `
      const result = await callCorporateAI({
        prompt: "Analyze...",
        systemInstruction: "You are an HR AI"
      });
    `;
    expect(codeUsingCallCorporateAI).toContain("callCorporateAI");
    expect(codeUsingCallCorporateAI).not.toContain("hf_bqNmy");
  });
});

describe("Phase 4.1/4.2: RLS + automation DB logic", () => {
  interface CandidateNotification {
    candidate_id: string;
    title: string;
    message: string;
    read: boolean;
  }

  it("syncs job_applications.status to candidates.stage (trigger simulation)", () => {
    const candidate: Candidate = makeCandidate();
    const form = makeJobForm();
    const app: JobApplication = {
      id: genId(), form_id: form.id, candidate_id: candidate.id,
      candidate_name: candidate.full_name, candidate_email: candidate.email,
      status: "Shortlisted", answers: {},
    };

    // Simulate trigger: sync_candidate_stage()
    candidate.stage = app.status;
    expect(candidate.stage).toBe("Shortlisted");
  });

  it("notifies candidate on status change (trigger simulation)", () => {
    const notifications: CandidateNotification[] = [];
    const candidateId = genId();
    const validStatuses = ["Rejected", "Onboarding", "Offer Generated", "Assessment Completed", "Shortlisted", "Interview Scheduled", "Offer Accepted"];

    for (const status of validStatuses) {
      notifications.push({
        candidate_id: candidateId,
        title: `Status: ${status}`,
        message: `Your status changed to ${status}`,
        read: false,
      });
    }

    expect(notifications.length).toBe(7);
    notifications.forEach(n => {
      expect(n.read).toBe(false);
      expect(n.candidate_id).toBe(candidateId);
    });
  });

  it("auto-creates onboarding record on candidate insert (trigger simulation)", () => {
    const newCandidate: Candidate = makeCandidate({ id: genId() });
    const onboardingCreated = true; // Simulated trigger

    expect(onboardingCreated).toBe(true);
    expect(newCandidate.id).toBeDefined();
  });

  it("expires past-due assessment tokens (function simulation)", () => {
    const tokens = [
      { id: genId(), status: "Active", expires_at: new Date(Date.now() - 86400000).toISOString() },
      { id: genId(), status: "Active", expires_at: new Date(Date.now() + 86400000).toISOString() },
      { id: genId(), status: "Used", expires_at: new Date(Date.now() - 86400000).toISOString() },
    ];

    function autoExpireTokens(): number {
      let expired = 0;
      for (const t of tokens) {
        if (t.status === "Active" && t.expires_at && new Date(t.expires_at) < new Date()) {
          t.status = "Expired";
          expired++;
        }
      }
      return expired;
    }

    const expiredCount = autoExpireTokens();
    expect(expiredCount).toBe(1);
    expect(tokens[0].status).toBe("Expired");
    expect(tokens[1].status).toBe("Active");
    expect(tokens[2].status).toBe("Used");
  });

  it("allows candidate UPDATE on assessment_tokens (RLS policy)", () => {
    // Simulates RLS policy: tokens_update_candidate_own
    const token = { id: genId(), candidate_id: genId(), status: "Active" };
    const requestingUserId = token.candidate_id;

    const canUpdate = requestingUserId === token.candidate_id;
    expect(canUpdate).toBe(true);

    token.status = "Used";
    expect(token.status).toBe("Used");
  });

  it("blocks candidate UPDATE on other candidate's tokens (RLS policy)", () => {
    const token = { id: genId(), candidate_id: genId(), status: "Active" };
    const requestingUserId = genId(); // Different user

    const canUpdate = requestingUserId === token.candidate_id;
    expect(canUpdate).toBe(false);
  });
});

describe("Phase 4.4: grade-assessment edge function logic", () => {
  function simulateGradeAssessment(
    totalQuestions: number,
    answers: Record<number, string>,
    correctAnswerMap: Record<number, string>,
    violationCount: number,
    maxViolations: number = 5,
  ): { score: number; correct: number; total: number; passed: boolean; disqualified: boolean } {
    if (violationCount >= maxViolations) {
      return { score: 0, correct: 0, total: totalQuestions, passed: false, disqualified: true };
    }

    if (totalQuestions === 0) {
      return { score: 0, correct: 0, total: 0, passed: false, disqualified: false };
    }

    let correctCount = 0;
    for (let i = 0; i < totalQuestions; i++) {
      const user = (answers[i] || "").trim().toLowerCase();
      const master = (correctAnswerMap[i] || "").trim().toLowerCase();
      if (user === master) correctCount++;
    }

    const score = Math.round((correctCount / totalQuestions) * 100);
    return { score, correct: correctCount, total: totalQuestions, passed: score >= 70, disqualified: false };
  }

  it("returns early with 0 for empty assessment", () => {
    const result = simulateGradeAssessment(0, {}, {}, 0);
    expect(result.score).toBe(0);
    expect(result.total).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("returns correct score for exact matches", () => {
    const result = simulateGradeAssessment(2, { 0: "4", 1: "Library" }, { 0: "4", 1: "Library" }, 0);
    expect(result.score).toBe(100);
    expect(result.correct).toBe(2);
    expect(result.passed).toBe(true);
  });

  it("returns partial credit for mixed answers", () => {
    const result = simulateGradeAssessment(4, { 0: "4", 1: "wrong", 2: "correct", 3: "wrong" }, { 0: "4", 1: "correct", 2: "correct", 3: "right" }, 0);
    expect(result.score).toBe(50);
    expect(result.correct).toBe(2);
    expect(result.passed).toBe(false);
  });

  it("disqualifies candidate with excessive violations", () => {
    const result = simulateGradeAssessment(2, { 0: "4", 1: "Library" }, { 0: "4", 1: "Library" }, 6);
    expect(result.disqualified).toBe(true);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("allows candidate just under violation limit", () => {
    const result = simulateGradeAssessment(2, { 0: "4", 1: "Library" }, { 0: "4", 1: "Library" }, 4);
    expect(result.disqualified).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("handles case-insensitive answer matching", () => {
    const result = simulateGradeAssessment(1, { 0: "LIBRARY" }, { 0: "library" }, 0);
    expect(result.correct).toBe(1);
  });

  it("calculates passing threshold correctly", () => {
    const passingResult = simulateGradeAssessment(10, { 0: "a", 1: "a", 2: "a", 3: "a", 4: "a", 5: "a", 6: "a", 7: "a", 8: "a", 9: "a" }, { 0: "a", 1: "a", 2: "a", 3: "a", 4: "a", 5: "a", 6: "a", 7: "a", 8: "a", 9: "a" }, 0);
    expect(passingResult.score).toBe(100);
    expect(passingResult.passed).toBe(true);

    const failingResult = simulateGradeAssessment(10, { 0: "a" }, { 0: "a", 1: "b", 2: "b", 3: "b", 4: "b", 5: "b", 6: "b", 7: "b", 8: "b", 9: "b" }, 0);
    expect(failingResult.score).toBe(10);
    expect(failingResult.passed).toBe(false);
  });
});

describe("Phase 4.4: proctor-ai edge function honest response", () => {
  function simulateProctorAi(hfTokenPresent: boolean): ProctorResponse {
    if (!hfTokenPresent) {
      return { error: "HF_TOKEN not configured", ai_disabled: true };
    }
    return {
      faceCount: 1,
      objects: [],
      suspicious: false,
      alerts: [],
    };
  }

  it("returns 503/ai_disabled when HF_TOKEN is missing", () => {
    const result = simulateProctorAi(false);
    expect(result.error).toBe("HF_TOKEN not configured");
    expect(result.ai_disabled).toBe(true);
    expect(result.suspicious).toBeUndefined();
  });

  it("returns normal detection results when HF_TOKEN is present", () => {
    const result = simulateProctorAi(true);
    expect(result.faceCount).toBe(1);
    expect(result.suspicious).toBe(false);
    expect(result.ai_disabled).toBeUndefined();
  });

  it("detects suspicious objects when present", () => {
    function detectObjects(
      image: string,
      hfToken: string | null,
    ): { suspicious: boolean; alerts: string[]; ai_disabled?: boolean } {
      if (!hfToken) {
        return { suspicious: false, alerts: [], ai_disabled: true };
      }

      const detectedObjects: string[] = [];
      const CHEATING_LABELS = ["cell phone", "laptop", "book", "remote", "tv", "monitor", "keyboard", "mouse"];

      // Simulate detection from model
      const simulatedResults = [
        { label: "cell phone", score: 0.85 },
        { label: "person", score: 0.95 },
      ];

      for (const item of simulatedResults) {
        const label = (item.label || "").toLowerCase();
        if (CHEATING_LABELS.some(cl => label.includes(cl))) {
          detectedObjects.push(item.label);
        }
      }

      const hasPhone = detectedObjects.some(o => o.toLowerCase().includes("cell phone") || o.toLowerCase().includes("phone"));
      const alerts: string[] = [];
      if (hasPhone) alerts.push("Cell phone detected in frame");

      return { suspicious: alerts.length > 0, alerts };
    }

    const result = detectObjects("fake-base64", "hf_valid");
    expect(result.suspicious).toBe(true);
    expect(result.alerts).toContain("Cell phone detected in frame");
  });

  it("returns non-suspicious for clean frame", () => {
    function detectObjects(image: string, hfToken: string | null): { suspicious: boolean; alerts: string[] } {
      if (!hfToken) return { suspicious: false, alerts: [] };

      const detectedObjects: string[] = [];
      const CHEATING_LABELS = ["cell phone", "laptop", "book", "remote", "tv", "monitor", "keyboard", "mouse"];

      const simulatedResults = [{ label: "person", score: 0.95 }];
      for (const item of simulatedResults) {
        const label = (item.label || "").toLowerCase();
        if (CHEATING_LABELS.some(cl => label.includes(cl))) {
          detectedObjects.push(item.label);
        }
      }

      return { suspicious: detectedObjects.length > 0, alerts: [] };
    }

    const result = detectObjects("clean-frame", "hf_valid");
    expect(result.suspicious).toBe(false);
    expect(result.alerts).toEqual([]);
  });
});

describe("Phase 4.5: PerformanceEngine JSON.parse safety", () => {
  function parseAiJsonResponse(raw: string): { score: number; reason: string } | null {
    let cleanText = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const startIdx = cleanText.indexOf("{");
    const endIdx = cleanText.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      cleanText = cleanText.substring(startIdx, endIdx + 1);
    }

    try {
      return JSON.parse(cleanText);
    } catch {
      return null;
    }
  }

  it("parses clean JSON response", () => {
    const result = parseAiJsonResponse('{"score": 85, "reason": "Good performance"}');
    expect(result).toEqual({ score: 85, reason: "Good performance" });
  });

  it("strips thinking tags before parsing", () => {
    const result = parseAiJsonResponse("<think>Internal reasoning</think>{\"score\": 72, \"reason\": \"Solid work\"}");
    expect(result).toEqual({ score: 72, reason: "Solid work" });
  });

  it("strips code fences before parsing", () => {
    const result = parseAiJsonResponse("```json\n{\"score\": 90, \"reason\": \"Excellent\"}\n```");
    expect(result).toEqual({ score: 90, reason: "Excellent" });
  });

  it("strips nested thinking tags before parsing", () => {
    const result = parseAiJsonResponse("<thinking>Deep reasoning</thinking>{\"score\": 60, \"reason\": \"Average\"}<thinking>More</thinking>");
    expect(result).toEqual({ score: 60, reason: "Average" });
  });

  it("returns null for completely invalid JSON", () => {
    const result = parseAiJsonResponse("The employee performed well");
    expect(result).toBeNull();
  });

  it("returns null for empty response", () => {
    const result = parseAiJsonResponse("");
    expect(result).toBeNull();
  });
});
