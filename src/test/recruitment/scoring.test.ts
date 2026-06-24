import { describe, it, expect } from "vitest";

interface AssessmentQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

interface Assessment {
  id: string;
  title: string;
  questions: AssessmentQuestion[];
  passing_score: number;
  duration_minutes: number;
}

interface AssessmentResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  disqualified: boolean;
  interviewStatus: string;
  workflowStatus: string;
}

interface GradingInput {
  questions: AssessmentQuestion[];
  selectedAnswers: Record<number, string>;
  passingScore: number;
  violationCount: number;
  maxViolations: number;
}

const VIOLATION_MAX_THRESHOLD = 5;

function normalizeAnswer(raw: string): string {
  return String(raw).trim().toLowerCase();
}

function normalizeOptionIndex(raw: string): string {
  const n = parseInt(raw, 10);
  if (!isNaN(n) && n >= 1) return String(n);
  return raw;
}

function gradeAssessment(input: GradingInput): AssessmentResult {
  const { questions, selectedAnswers, passingScore, violationCount, maxViolations } = input;
  const totalQuestions = questions.length;
  let correctCount = 0;

  for (let i = 0; i < totalQuestions; i++) {
    const q = questions[i];
    const userRaw = selectedAnswers[i];
    if (!userRaw) continue;

    const master = normalizeAnswer(String(q.correctAnswer || q.options[0] || ""));
    const candidate = normalizeAnswer(userRaw);

    if (master === candidate) {
      correctCount++;
      continue;
    }

    const masterIdx = normalizeOptionIndex(master);
    const candidateIdx = q.options.indexOf(userRaw) + 1;
    if (masterIdx === String(candidateIdx)) {
      correctCount++;
    }
  }

  const rawPercentage = (correctCount / totalQuestions) * 100;
  const score = parseFloat(rawPercentage.toFixed(2));
  const roundedScore = Math.round(score);

  const wasDisqualified = violationCount >= maxViolations;
  const isPassingGrade = !wasDisqualified && (score >= (passingScore || 70));

  return {
    score: roundedScore,
    correctCount,
    totalQuestions,
    passed: isPassingGrade,
    disqualified: wasDisqualified,
    interviewStatus: isPassingGrade ? "Pending Scheduling" : "Pending",
    workflowStatus: isPassingGrade ? "Assessment Passed" : "Rejected",
  };
}

function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function computeATSStatus(score: number, threshold: number = 75): string {
  return score >= threshold ? "Shortlisted" : "Screening";
}

function computeMatchPercentage(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

describe("Assessment Scoring", () => {
  const sampleQuestions: AssessmentQuestion[] = [
    { question: "What is 2+2?", options: ["3", "4", "5", "6"], correctAnswer: "4" },
    { question: "What is React?", options: ["Library", "Framework", "Language", "Database"], correctAnswer: "Library" },
    { question: "Capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correctAnswer: "Paris" },
  ];

  describe("gradeAssessment", () => {
    it("returns perfect score for all correct answers", () => {
      const result = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: { 0: "4", 1: "Library", 2: "Paris" },
        passingScore: 70,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });

      expect(result.score).toBe(100);
      expect(result.correctCount).toBe(3);
      expect(result.totalQuestions).toBe(3);
      expect(result.passed).toBe(true);
      expect(result.disqualified).toBe(false);
      expect(result.workflowStatus).toBe("Assessment Passed");
      expect(result.interviewStatus).toBe("Pending Scheduling");
    });

    it("returns partial score for mixed answers", () => {
      const result = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: { 0: "4", 1: "Library", 2: "London" },
        passingScore: 70,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });

      expect(result.score).toBe(67);
      expect(result.correctCount).toBe(2);
      expect(result.passed).toBe(false);
      expect(result.workflowStatus).toBe("Rejected");
    });

    it("returns zero for all wrong answers", () => {
      const result = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: { 0: "3", 1: "Database", 2: "London" },
        passingScore: 70,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });

      expect(result.score).toBe(0);
      expect(result.correctCount).toBe(0);
      expect(result.passed).toBe(false);
    });

    it("disqualifies when violations exceed threshold", () => {
      const result = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: { 0: "4", 1: "Library", 2: "Paris" },
        passingScore: 70,
        violationCount: 6,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });

      expect(result.disqualified).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.workflowStatus).toBe("Rejected");
    });

    it("handles empty answers gracefully", () => {
      const result = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: {},
        passingScore: 70,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });

      expect(result.score).toBe(0);
      expect(result.correctCount).toBe(0);
      expect(result.passed).toBe(false);
    });

    it("handles single question assessment", () => {
      const result = gradeAssessment({
        questions: [sampleQuestions[0]],
        selectedAnswers: { 0: "4" },
        passingScore: 50,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it("uses custom passing score threshold", () => {
      const allCorrect = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: { 0: "4", 1: "Library", 2: "Paris" },
        passingScore: 90,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });
      expect(allCorrect.passed).toBe(true);

      const lowScore = gradeAssessment({
        questions: sampleQuestions,
        selectedAnswers: { 0: "4", 1: "Library", 2: "London" },
        passingScore: 90,
        violationCount: 0,
        maxViolations: VIOLATION_MAX_THRESHOLD,
      });
      expect(lowScore.passed).toBe(false);
    });
  });

  describe("formatTimer", () => {
    it("formats zero", () => {
      expect(formatTimer(0)).toBe("00:00:00");
    });

    it("formats seconds only", () => {
      expect(formatTimer(45)).toBe("00:00:45");
    });

    it("formats minutes and seconds", () => {
      expect(formatTimer(125)).toBe("00:02:05");
    });

    it("formats hours, minutes, seconds", () => {
      expect(formatTimer(3661)).toBe("01:01:01");
    });

    it("handles large values", () => {
      expect(formatTimer(86399)).toBe("23:59:59");
    });
  });

  describe("computeATSStatus", () => {
    it("Shortlists candidates with score at or above threshold", () => {
      expect(computeATSStatus(75)).toBe("Shortlisted");
      expect(computeATSStatus(100)).toBe("Shortlisted");
    });

    it("puts below-threshold candidates in Screening", () => {
      expect(computeATSStatus(74)).toBe("Screening");
      expect(computeATSStatus(0)).toBe("Screening");
    });

    it("uses custom threshold", () => {
      expect(computeATSStatus(80, 80)).toBe("Shortlisted");
      expect(computeATSStatus(79, 80)).toBe("Screening");
    });
  });

  describe("computeMatchPercentage", () => {
    it("computes percentage correctly", () => {
      expect(computeMatchPercentage(3, 4)).toBe(75);
      expect(computeMatchPercentage(1, 3)).toBe(33);
      expect(computeMatchPercentage(5, 10)).toBe(50);
    });

    it("returns 0 for zero total", () => {
      expect(computeMatchPercentage(0, 0)).toBe(0);
    });

    it("rounds to nearest integer", () => {
      expect(computeMatchPercentage(1, 3)).toBe(33);
      expect(computeMatchPercentage(2, 3)).toBe(67);
    });
  });
});
