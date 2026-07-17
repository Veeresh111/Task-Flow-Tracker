import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockDatabaseRow {
  table: string;
  data: Record<string, any>;
}

interface MockSyncTrigger {
  inserts: MockDatabaseRow[];
  updates: MockDatabaseRow[];
}

type SyncDirection = "job_applications" | "candidate_applications";

interface SyncRule {
  onInsert: boolean;
  onUpdate: boolean;
  mapInsert(source: Record<string, any>): Record<string, any>;
  mapUpdate(source: Record<string, any>, existing: Record<string, any> | null): Record<string, any>;
}

const JOB_APP_TO_CANDIDATE_APP_SYNC: SyncRule = {
  onInsert: true,
  onUpdate: true,
  mapInsert(source: Record<string, any>): Record<string, any> {
    return {
      candidate_id: source.candidate_id,
      job_form_id: source.form_id,
      job_application_id: source.id,
      status: source.status || "Applied",
      ai_score: source.match_score ?? null,
      interview_status: source.interview_status || "Pending",
      offer_status: source.offer_status ?? null,
      assessment_score: source.assessment_score ?? null,
      interview_score: source.interview_score ?? null,
      parsed_resume_text: source.parsed_resume_text ?? null,
      recruiter_notes: source.recruiter_notes ?? null,
      assigned_recruiter: source.assigned_recruiter ?? null,
    };
  },
  mapUpdate(source: Record<string, any>, _existing: Record<string, any> | null): Record<string, any> {
    const update: Record<string, any> = {};
    if (source.status !== undefined) update.status = source.status;
    if (source.match_score !== undefined) update.ai_score = source.match_score;
    if (source.interview_status !== undefined) update.interview_status = source.interview_status;
    if (source.offer_status !== undefined) update.offer_status = source.offer_status;
    if (source.assessment_score !== undefined) update.assessment_score = source.assessment_score;
    if (source.interview_score !== undefined) update.interview_score = source.interview_score;
    if (source.parsed_resume_text !== undefined) update.parsed_resume_text = source.parsed_resume_text;
    if (source.recruiter_notes !== undefined) update.recruiter_notes = source.recruiter_notes;
    if (source.assigned_recruiter !== undefined) update.assigned_recruiter = source.assigned_recruiter;
    update.updated_at = new Date().toISOString();
    return update;
  },
};

class SyncEngine {
  private candidateApps: Map<string, Record<string, any>> = new Map();
  private syncLog: string[] = [];

  constructor(
    private direction: SyncDirection,
    private rule: SyncRule,
    initialCAs: Record<string, any>[] = [],
  ) {
    for (const ca of initialCAs) {
      this.candidateApps.set(ca.id || ca.job_application_id || crypto.randomUUID(), { ...ca });
    }
  }

  get log(): readonly string[] {
    return this.syncLog;
  }

  get store(): Record<string, any>[] {
    return Array.from(this.candidateApps.values());
  }

  onInsertJobApp(jobApp: Record<string, any>): void {
    if (!this.rule.onInsert) return;
    const synced = this.rule.mapInsert(jobApp);
    const key = jobApp.id;
    this.candidateApps.set(key, { ...synced, id: crypto.randomUUID() });
    this.syncLog.push(`INSERT candidate_applications for job_applications.${key}`);
  }

  onUpdateJobApp(jobApp: Record<string, any>): void {
    if (!this.rule.onUpdate) return;
    const existing = this.findByJobAppId(jobApp.id) || this.findByCandidateAndForm(jobApp.candidate_id, jobApp.form_id);
    const updates = this.rule.mapUpdate(jobApp, existing);
    if (existing) {
      Object.assign(existing, updates);
    }
    this.syncLog.push(`UPDATE candidate_applications for job_applications.${jobApp.id}`);
  }

  private findByJobAppId(jobAppId: string): Record<string, any> | undefined {
    for (const ca of this.candidateApps.values()) {
      if (ca.job_application_id === jobAppId) return ca;
    }
    return undefined;
  }

  private findByCandidateAndForm(candidateId: string, formId: string): Record<string, any> | undefined {
    for (const ca of this.candidateApps.values()) {
      if (ca.candidate_id === candidateId && ca.job_form_id === formId) return ca;
    }
    return undefined;
  }

  findCandidateApp(predicate: (ca: Record<string, any>) => boolean): Record<string, any> | undefined {
    for (const ca of this.candidateApps.values()) {
      if (predicate(ca)) return ca;
    }
    return undefined;
  }
}

describe("Sync Trigger: job_applications → candidate_applications", () => {
  let engine: SyncEngine;

  beforeEach(() => {
    engine = new SyncEngine("job_applications", JOB_APP_TO_CANDIDATE_APP_SYNC);
  });

  describe("AFTER INSERT trigger", () => {
    it("creates candidate_applications row on job_applications insert", () => {
      engine.onInsertJobApp({
        id: "ja-1",
        candidate_id: "cand-1",
        form_id: "form-1",
        status: "Applied",
        match_score: null,
        interview_status: null,
      });

      expect(engine.log).toContain("INSERT candidate_applications for job_applications.ja-1");
      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-1");
      expect(synced).toBeDefined();
      expect(synced?.candidate_id).toBe("cand-1");
      expect(synced?.job_form_id).toBe("form-1");
      expect(synced?.status).toBe("Applied");
    });

    it("maps match_score to ai_score", () => {
      engine.onInsertJobApp({
        id: "ja-2",
        candidate_id: "cand-1",
        form_id: "form-1",
        status: "Shortlisted",
        match_score: 92,
      });

      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-2");
      expect(synced?.ai_score).toBe(92);
    });

    it("carries interview_status forward with default", () => {
      engine.onInsertJobApp({
        id: "ja-3",
        candidate_id: "cand-1",
        form_id: "form-1",
        status: "Applied",
      });

      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-3");
      expect(synced?.interview_status).toBe("Pending");
    });
  });

  describe("AFTER UPDATE trigger", () => {
    it("syncs status change to candidate_applications", () => {
      engine.onInsertJobApp({
        id: "ja-10",
        candidate_id: "cand-1",
        form_id: "form-1",
        status: "Applied",
        match_score: 60,
      });

      engine.onUpdateJobApp({
        id: "ja-10",
        candidate_id: "cand-1",
        form_id: "form-1",
        status: "Shortlisted",
        match_score: 85,
      });

      expect(engine.log).toContain("UPDATE candidate_applications for job_applications.ja-10");
      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-10");
      expect(synced?.status).toBe("Shortlisted");
      expect(synced?.ai_score).toBe(85);
    });

    it("syncs assessment score to candidate_applications", () => {
      engine.onInsertJobApp({
        id: "ja-20",
        candidate_id: "cand-2",
        form_id: "form-2",
        status: "Assessment Assigned",
      });

      engine.onUpdateJobApp({
        id: "ja-20",
        candidate_id: "cand-2",
        form_id: "form-2",
        status: "Assessment Passed",
        assessment_score: 88,
        interview_status: "Pending Scheduling",
      });

      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-20");
      expect(synced?.status).toBe("Assessment Passed");
      expect(synced?.assessment_score).toBe(88);
      expect(synced?.interview_status).toBe("Pending Scheduling");
    });

    it("syncs interview score and status", () => {
      engine.onInsertJobApp({
        id: "ja-30",
        candidate_id: "cand-3",
        form_id: "form-3",
        status: "Interview Scheduled",
      });

      engine.onUpdateJobApp({
        id: "ja-30",
        candidate_id: "cand-3",
        form_id: "form-3",
        status: "Interview Cleared",
        interview_score: 92,
        interview_status: "Completed",
      });

      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-30");
      expect(synced?.interview_score).toBe(92);
      expect(synced?.interview_status).toBe("Completed");
    });

    it("syncs offer status changes", () => {
      engine.onInsertJobApp({
        id: "ja-40",
        candidate_id: "cand-4",
        form_id: "form-4",
        status: "Interview Cleared",
      });

      engine.onUpdateJobApp({
        id: "ja-40",
        candidate_id: "cand-4",
        form_id: "form-4",
        status: "Offer Generated",
        offer_status: "Generated",
      });

      const synced = engine.findCandidateApp(ca => ca.job_application_id === "ja-40");
      expect(synced?.status).toBe("Offer Generated");
      expect(synced?.offer_status).toBe("Generated");
    });
  });

  describe("Backward compatibility", () => {
    it("finds existing candidate_applications by (candidate_id, job_form_id) for UPDATE sync", () => {
      const preExistingCA: Record<string, any> = {
        id: "ca-existing-1",
        candidate_id: "cand-legacy",
        job_form_id: "form-legacy",
        status: "Applied",
        ai_score: null,
      };

      engine = new SyncEngine("job_applications", JOB_APP_TO_CANDIDATE_APP_SYNC, [preExistingCA]);

      engine.onUpdateJobApp({
        id: "ja-legacy-1",
        candidate_id: "cand-legacy",
        form_id: "form-legacy",
        status: "Shortlisted",
        match_score: 78,
      });

      const legacy = engine.findCandidateApp(ca => ca.candidate_id === "cand-legacy");
      expect(legacy?.status).toBe("Shortlisted");
      expect(legacy?.ai_score).toBe(78);
    });

    it("handles status changes through entire pipeline", () => {
      const jaId = "ja-full";
      engine.onInsertJobApp({
        id: jaId,
        candidate_id: "cand-full",
        form_id: "form-full",
        status: "Applied",
      });

      const transitions = [
        { status: "Shortlisted", match_score: 80 },
        { status: "Assessment Passed", assessment_score: 90, interview_status: "Pending Scheduling" },
        { status: "Interview Scheduled", interview_status: "Scheduled" },
        { status: "Interview Cleared", interview_score: 88, interview_status: "Completed" },
        { status: "Offer Generated", offer_status: "Generated" },
        { status: "Offer Accepted", offer_status: "Accepted" },
      ];

      for (const t of transitions) {
        engine.onUpdateJobApp({ id: jaId, candidate_id: "cand-full", form_id: "form-full", ...t });
      }

      const synced = engine.findCandidateApp(ca => ca.job_application_id === jaId);
      expect(synced?.status).toBe("Offer Accepted");
      expect(synced?.offer_status).toBe("Accepted");
      expect(synced?.assessment_score).toBe(90);
      expect(synced?.interview_score).toBe(88);
      expect(engine.log.length).toBe(7); // 1 INSERT + 6 UPDATEs
    });
  });
});
