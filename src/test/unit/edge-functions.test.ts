import { describe, it, expect, vi, beforeEach } from "vitest";

// Simulate the grade-assessment edge function logic
// Tests the core grading algorithm

function gradeAssessment(
  questions: { question: string; options: string[]; correctAnswer?: string; correct_option?: string; answer?: string }[],
  candidateAnswers: Record<number, string>,
  violationCount: number,
  maxViolations: number,
  passingScore: number,
): {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  disqualified: boolean;
} {
  if (violationCount >= maxViolations) {
    return { score: 0, correct: 0, total: questions.length, passed: false, disqualified: true };
  }

  if (questions.length === 0) {
    return { score: 0, correct: 0, total: 0, passed: false, disqualified: false };
  }

  let correctCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const userAnswer = String(candidateAnswers[i] || "").trim().toLowerCase();
    const correctAnswer = String(q.correctAnswer || q.correct_option || q.answer || "").trim().toLowerCase();
    const answerIndex = q.options?.indexOf(candidateAnswers[i]);

    if (correctAnswer && (userAnswer === correctAnswer || String(answerIndex + 1) === correctAnswer)) {
      correctCount++;
    }
  }

  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  const passed = score >= passingScore && !(violationCount >= maxViolations);

  return { score, correct: correctCount, total: questions.length, passed, disqualified: false };
}

function detectProctoringViolations(
  proctorLog: { type: string; timestamp: string }[],
  maxViolations: number,
): { violationCount: number; shouldDisqualify: boolean } {
  const actualViolations = proctorLog.filter(l => !l.type.startsWith("[WARNING]") && !l.type.includes("No action taken")).length;
  return {
    violationCount: actualViolations,
    shouldDisqualify: actualViolations >= maxViolations,
  };
}

function resolveCandidateId(
  profile: { candidate_id?: string; id: string } | null,
  candidateByEmail: { id: string } | null,
  userId: string,
): string {
  if (profile?.candidate_id) return profile.candidate_id;
  if (candidateByEmail?.id) return candidateByEmail.id;
  return userId;
}

describe("Grade Assessment Edge Function Logic", () => {
  const sampleQuestions = [
    { question: "What is 2+2?", options: ["3", "4", "5"], correctAnswer: "4" },
    { question: "What is React?", options: ["Library", "Framework", "Language"], correctAnswer: "Library" },
    { question: "What is CI/CD?", options: ["Integration", "Deployment", "Both"], correctAnswer: "Both" },
  ];

  describe("Scoring", () => {
    it("awards 100% for all correct answers", () => {
      const result = gradeAssessment(sampleQuestions, { 0: "4", 1: "Library", 2: "Both" }, 0, 5, 70);
      expect(result.score).toBe(100);
      expect(result.correct).toBe(3);
      expect(result.passed).toBe(true);
      expect(result.disqualified).toBe(false);
    });

    it("awards 0% for all incorrect", () => {
      const result = gradeAssessment(sampleQuestions, { 0: "3", 1: "Language", 2: "Integration" }, 0, 5, 70);
      expect(result.score).toBe(0);
      expect(result.correct).toBe(0);
      expect(result.passed).toBe(false);
    });

    it("calculates partial scores correctly", () => {
      const result = gradeAssessment(sampleQuestions, { 0: "4", 1: "Wrong", 2: "Both" }, 0, 5, 70);
      expect(result.score).toBe(67); // 2/3 = 66.66 -> rounds to 67
      expect(result.correct).toBe(2);
      expect(result.passed).toBe(false); // 67 < 70
    });

    it("handles passing score threshold", () => {
      const result = gradeAssessment(sampleQuestions, { 0: "4", 1: "Library", 2: "Both" }, 0, 5, 100);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it("returns 0 for empty questions", () => {
      const result = gradeAssessment([], {}, 0, 5, 70);
      expect(result.score).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe("Answer matching flexibility", () => {
    const mixedQ = [
      { question: "Q1", options: ["A", "B", "C"], correctAnswer: "A" },
      { question: "Q2", options: ["X", "Y", "Z"], correctAnswer: "Y" },
    ];

    it("matches by option text (case-insensitive)", () => {
      const result = gradeAssessment(mixedQ, { 0: "a", 1: "y" }, 0, 5, 50);
      expect(result.correct).toBe(2);
    });

    it("matches by option index", () => {
      const correctByIndex = [
        { question: "Q1", options: ["A", "B", "C"], correctAnswer: "1" },
        { question: "Q2", options: ["X", "Y", "Z"], correctAnswer: "2" },
      ];
      const result = gradeAssessment(correctByIndex, { 0: "A", 1: "Y" }, 0, 5, 50);
      expect(result.correct).toBe(2);
    });
  });

  describe("Violation disqualification", () => {
    it("disqualifies at max violations", () => {
      const result = gradeAssessment(sampleQuestions, {}, 5, 5, 70);
      expect(result.disqualified).toBe(true);
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it("passes with violations under the limit", () => {
      const result = gradeAssessment(sampleQuestions, { 0: "4", 1: "Library", 2: "Both" }, 3, 5, 70);
      expect(result.disqualified).toBe(false);
      expect(result.passed).toBe(true);
    });

    it("allows clean submission with zero violations", () => {
      const result = gradeAssessment(sampleQuestions, { 0: "4", 1: "Library", 2: "Both" }, 0, 5, 70);
      expect(result.disqualified).toBe(false);
    });
  });

  describe("Proctor log analysis", () => {
    it("counts actual violations excluding warnings", () => {
      const log = [
        { type: "[WARNING] Tab Switch / Window Focus Lost", timestamp: "2026-01-01T00:00:00Z" },
        { type: "Cell phone detected in frame", timestamp: "2026-01-01T00:01:00Z" },
        { type: "Tab Switch / Window Focus Lost", timestamp: "2026-01-01T00:02:00Z" },
      ];
      const result = detectProctoringViolations(log, 5);
      expect(result.violationCount).toBe(2);
      expect(result.shouldDisqualify).toBe(false);
    });

    it("triggers disqualification at threshold", () => {
      const log = [
        { type: "No face detected", timestamp: "2026-01-01T00:00:00Z" },
        { type: "No face detected", timestamp: "2026-01-01T00:01:00Z" },
        { type: "No face detected", timestamp: "2026-01-01T00:02:00Z" },
        { type: "No face detected", timestamp: "2026-01-01T00:03:00Z" },
        { type: "No face detected", timestamp: "2026-01-01T00:04:00Z" },
      ];
      const result = detectProctoringViolations(log, 5);
      expect(result.shouldDisqualify).toBe(true);
    });
  });
});

describe("Candidate ID Resolution Logic", () => {
  it("returns profile.candidate_id when set", () => {
    const profile = { candidate_id: "cand-123", id: "auth-456" };
    const result = resolveCandidateId(profile, null, "auth-456");
    expect(result).toBe("cand-123");
  });

  it("falls back to candidate by email", () => {
    const profile = { id: "auth-456" };
    const candidate = { id: "cand-789" };
    const result = resolveCandidateId(profile, candidate, "auth-456");
    expect(result).toBe("cand-789");
  });

  it("falls back to user ID as last resort", () => {
    const result = resolveCandidateId(null, null, "auth-000");
    expect(result).toBe("auth-000");
  });

  it("prefers profile.candidate_id over candidate by email", () => {
    const profile = { candidate_id: "cand-123", id: "auth-456" };
    const candidate = { id: "cand-789" };
    const result = resolveCandidateId(profile, candidate, "auth-456");
    expect(result).toBe("cand-123");
  });
});
