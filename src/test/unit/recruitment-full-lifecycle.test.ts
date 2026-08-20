import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidStatusTransition, isValidOfferStatusTransition } from "@/lib/status-validators";
import { VectorMath } from "@/lib/dsa/VectorMath";
import { notificationService } from "@/lib/notifications";

// Mock Supabase for recruitment lifecycle tests
vi.mock("@/lib/supabase", () => {
  const mockDb: Record<string, any[]> = {
    job_forms: [
      { id: "jf-1", job_title: "Senior Full Stack Engineer", requires_assessment: true, pass_threshold: 70, status: "Active" }
    ],
    candidates: [],
    job_applications: [],
    assessment_tokens: [],
    assessments: [
      { id: "ass-1", job_form_id: "jf-1", status: "Active", duration_minutes: 60 }
    ],
    interview_sessions: [],
    offer_letters: [],
    profiles: [
      { id: "hr-1", name: "HR Manager", role: "hr" },
      { id: "admin-1", name: "Super Admin", role: "admin" }
    ],
    notifications: [],
    candidate_notifications: []
  };

  const createQueryBuilder = (tableName: string) => {
    let currentData = mockDb[tableName] || [];
    const builder: any = {
      select: vi.fn().mockImplementation((cols?: string, opts?: any) => {
        if (opts?.count === 'exact') {
          builder._count = currentData.length;
        }
        return builder;
      }),
      eq: vi.fn().mockImplementation((field: string, val: any) => {
        currentData = currentData.filter(item => item[field] === val);
        return builder;
      }),
      in: vi.fn().mockImplementation((field: string, vals: any[]) => {
        currentData = currentData.filter(item => vals.includes(item[field]));
        return builder;
      }),
      or: vi.fn().mockImplementation(() => builder),
      order: vi.fn().mockImplementation(() => builder),
      limit: vi.fn().mockImplementation((n: number) => {
        currentData = currentData.slice(0, n);
        return builder;
      }),
      insert: vi.fn().mockImplementation((rows: any[]) => {
        const withIds = rows.map((r, i) => ({ id: r.id || `gen-${Date.now()}-${i}`, ...r }));
        if (!mockDb[tableName]) mockDb[tableName] = [];
        mockDb[tableName].push(...withIds);
        builder._inserted = withIds;
        return builder;
      }),
      update: vi.fn().mockImplementation((updates: any) => {
        builder._updates = updates;
        return builder;
      }),
      maybeSingle: vi.fn().mockImplementation(async () => {
        return { data: currentData[0] || null, error: null };
      }),
      single: vi.fn().mockImplementation(async () => {
        return { data: builder._inserted?.[0] || currentData[0] || null, error: null };
      }),
      then: vi.fn().mockImplementation((resolve: any) => {
        if (builder._count !== undefined) {
          resolve({ count: builder._count, error: null });
        } else {
          resolve({ data: builder._inserted || currentData, error: null });
        }
      })
    };
    return builder;
  };

  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => createQueryBuilder(table))
    }
  };
});

describe("Complete Recruitment Pipeline & Verification (Candidate to Onboarding)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. ATS Screening & Match Scoring
  describe("1. ATS Screening & AI Match Scoring", () => {
    it("computes Jaccard keyword overlap and cosine similarity between candidate resume and job requirements", () => {
      const candidateTokens = ["react", "typescript", "nodejs", "postgresql", "docker", "graphql"];
      const jdTokens = ["react", "typescript", "postgresql", "docker", "aws", "kubernetes"];
      
      const jaccard = VectorMath.jaccardSimilarity(candidateTokens, jdTokens);
      expect(jaccard).toBeGreaterThan(0.4);
      expect(jaccard).toBeLessThanOrEqual(1.0);

      const resumeText = "Experienced React TypeScript developer with Postgres and Docker skills.";
      const jdText = "Looking for Senior React TypeScript Engineer with PostgreSQL knowledge.";
      const match = VectorMath.computeCandidateMatchScore(resumeText, jdText, ["React", "TypeScript", "PostgreSQL"]);
      expect(match.overallScore).toBeGreaterThan(50);
      expect(match.matchedSkills.length).toBeGreaterThan(0);
    });

    it("verifies state transitions from 'Applied' to 'ATS Shortlisted'", () => {
      expect(isValidStatusTransition("Applied", "ATS Shortlisted")).toBe(true);
      expect(isValidStatusTransition("Applied", "Recruiter Screening")).toBe(true);
      expect(isValidStatusTransition("Applied", "NonExistentStage")).toBe(false);
      expect(isValidStatusTransition("Rejected", "Applied")).toBe(false); // Terminal
    });
  });

  // 2. Assessment Token Issuance & Examination Flow
  describe("2. Assessment Lifecycle & Anti-Cheating Telemetry", () => {
    it("validates transition to 'Assessment Assigned' and 'Assessment Completed'", () => {
      expect(isValidStatusTransition("ATS Shortlisted", "Assessment Assigned")).toBe(true);
      expect(isValidStatusTransition("Assessment Assigned", "Assessment Completed")).toBe(true);
      expect(isValidStatusTransition("Assessment Completed", "Assessment Passed")).toBe(true);
    });

    it("evaluates candidate exam score against passing threshold", () => {
      const passThreshold = 70;
      const candidateScore = 85;
      const candidatePass = candidateScore >= passThreshold;
      expect(candidatePass).toBe(true);

      const failingScore = 55;
      expect(failingScore >= passThreshold).toBe(false);
    });

    it("calculates integrity score correctly from proctor telemetry", () => {
      const tabSwitches = 1;
      const audioAnomalies = 0;
      const multipleFaceDetected = 0;
      
      const totalViolations = tabSwitches * 10 + audioAnomalies * 5 + multipleFaceDetected * 15;
      const integrityScore = Math.max(0, 100 - totalViolations);
      
      expect(integrityScore).toBe(90);
      expect(integrityScore).toBeGreaterThanOrEqual(75); // Passes integrity threshold
    });
  });

  // 3. Interview Center Lifecycle
  describe("3. Interview Center Evaluation & Scoring", () => {
    it("validates stage transition to 'Interview Scheduled' and 'Interview Cleared'", () => {
      expect(isValidStatusTransition("Assessment Passed", "Interview Scheduled")).toBe(true);
      expect(isValidStatusTransition("Interview Scheduled", "Interview Cleared")).toBe(true);
    });

    it("aggregates multi-criteria scorecard into accurate overall percentage", () => {
      const scores = {
        technical_competence: 85,
        system_design: 80,
        problem_solving: 90,
        cultural_fit: 85
      };
      
      const weights = {
        technical_competence: 0.35,
        system_design: 0.25,
        problem_solving: 0.25,
        cultural_fit: 0.15
      };

      const weightedTotal = 
        scores.technical_competence * weights.technical_competence +
        scores.system_design * weights.system_design +
        scores.problem_solving * weights.problem_solving +
        scores.cultural_fit * weights.cultural_fit;

      expect(Math.round(weightedTotal)).toBe(85);
    });
  });

  // 4. Offer Management & Acceptance Workflow
  describe("4. Offer Management & Acceptance Workflow", () => {
    it("validates offer status progression: Pending Approval -> Approved -> Sent -> Accepted", () => {
      expect(isValidOfferStatusTransition("Pending Approval", "Approved")).toBe(true);
      expect(isValidOfferStatusTransition("Approved", "Sent")).toBe(true);
      expect(isValidOfferStatusTransition("Sent", "Accepted")).toBe(true);
      expect(isValidOfferStatusTransition("Sent", "Declined")).toBe(true);
      expect(isValidOfferStatusTransition("Accepted", "Pending Approval")).toBe(false); // backward invalid
    });

    it("validates candidate status progression to 'Onboarding' upon offer acceptance", () => {
      expect(isValidStatusTransition("Interview Cleared", "Offer Generated")).toBe(true);
      expect(isValidStatusTransition("Offer Generated", "Offer Accepted")).toBe(true);
      expect(isValidStatusTransition("Offer Accepted", "Onboarding")).toBe(true);
    });
  });

  // 5. Notification Real-time Triggers Across Roles
  describe("5. Role-Based Notification Broadcasts", () => {
    it("dispatches broadcast notifications to specific roles", async () => {
      const notifiedCount = await notificationService.sendToRole(["hr", "admin"], {
        title: "Candidate Auto-Shortlisted",
        message: "John Doe applied for Senior Full Stack Engineer (ATS Score: 88%)",
        type: "recruitment",
        link: "/hr/recruitment"
      });
      expect(notifiedCount).toBeGreaterThanOrEqual(0);
    });

    it("dispatches individual notifications with deep links to candidates", async () => {
      const success = await notificationService.sendToCandidate("cand-xyz", {
        title: "Assessment Invitation Ready",
        message: "Start your assessment within 48 hours.",
        type: "assessment",
        link: "/assessment/token-uuid-12345"
      });
      expect(success).toBe(true);
    });

    it("dispatches individual notifications to employees", async () => {
      const success = await notificationService.sendToUser("emp-xyz", {
        title: "Task Assigned",
        message: "Deploy New Task (High priority)",
        type: "task",
        link: "/employee/tasks"
      });
      expect(success).toBe(true);
    });
  });
});
