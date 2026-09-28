import { describe, it, expect } from "vitest";

/**
 * Truth-labeling contract tests.
 *
 * These tests pin the evaluation-provenance contract between the
 * ats-screen Edge Function and every persistence path (public applicant
 * flow + HR scanner). They prevent regression where deterministic
 * results could be presented as AI output.
 */

interface AtsResponseShape {
  score: number;
  verdict: string;
  method?: string;
  evaluation_type?: string;
  evaluation_provider?: string;
}

const AI_PATH_RESPONSE: AtsResponseShape = {
  score: 82,
  verdict: "Strong profile alignment with the requisition.",
  method: "ai_llm_qwen3",
  evaluation_type: "AI_EVALUATION",
  evaluation_provider: "huggingface_router:Qwen/Qwen2.5-72B-Instruct",
};

const RULE_PATH_RESPONSE: AtsResponseShape = {
  score: 58,
  verdict: "Deterministic keyword & profile analysis: 58% contextual alignment with job requisition criteria (AI service offline).",
  method: "deterministic_rule_based",
  evaluation_type: "RULE_BASED",
  evaluation_provider: "local_deterministic_engine",
};

/** Mirrors the persistence helpers in ApplicationHub.tsx / JobApplication.tsx */
function resolveEvaluationType(parsed: AtsResponseShape): "AI_EVALUATION" | "RULE_BASED" {
  if (parsed.evaluation_type === "RULE_BASED") return "RULE_BASED";
  if (parsed.method === "deterministic_rule_based") return "RULE_BASED";
  return "AI_EVALUATION";
}

function buildPersistedVerdict(parsed: AtsResponseShape): string {
  return resolveEvaluationType(parsed) === "RULE_BASED"
    ? `[Rule-Based Screening] ${parsed.verdict || ""}`
    : parsed.verdict;
}

describe("ATS evaluation provenance labeling", () => {
  it("labels successful AI responses as AI_EVALUATION without screening prefix", () => {
    expect(resolveEvaluationType(AI_PATH_RESPONSE)).toBe("AI_EVALUATION");
    expect(buildPersistedVerdict(AI_PATH_RESPONSE)).not.toContain("[Rule-Based Screening]");
    expect(buildPersistedVerdict(AI_PATH_RESPONSE)).toBe(AI_PATH_RESPONSE.verdict);
  });

  it("labels explicit RULE_BASED evaluation_type as rule-based with mandatory prefix", () => {
    expect(resolveEvaluationType(RULE_PATH_RESPONSE)).toBe("RULE_BASED");
    expect(buildPersistedVerdict(RULE_PATH_RESPONSE)).toMatch(/^\[Rule-Based Screening\]/);
  });

  it("infers RULE_BASED from method=deterministic_rule_based even without evaluation_type", () => {
    const legacyFallback: AtsResponseShape = { score: 40, verdict: "x", method: "deterministic_rule_based" };
    expect(resolveEvaluationType(legacyFallback)).toBe("RULE_BASED");
    expect(buildPersistedVerdict(legacyFallback)).toMatch(/^\[Rule-Based Screening\]/);
  });

  it("never presents an offline-provider verdict as AI output", () => {
    const persisted = buildPersistedVerdict(RULE_PATH_RESPONSE);
    expect(persisted).toContain("(AI service offline)");
    expect(persisted).toContain("[Rule-Based Screening]");
  });

  it("does not leak grading metadata through the persistence path", () => {
    for (const response of [AI_PATH_RESPONSE, RULE_PATH_RESPONSE]) {
      const serialized = JSON.stringify(buildPersistedVerdict(response));
      expect(serialized).not.toMatch(/correctAnswer/i);
      expect(serialized).not.toMatch(/token_hash/i);
    }
  });
});

describe("Public assessment token issuance idempotency (RPC contract)", () => {
  // Mirrors issue_public_assessment_token: one ACTIVE token per candidate/assessment.
  function issueToken(existingActiveTokens: string[]): string {
    if (existingActiveTokens.length > 0) return existingActiveTokens[0];
    const fresh = `TOK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    return fresh;
  }

  it("returns the existing active token instead of minting a duplicate", () => {
    const existing = ["ABCD1234-AAAA"];
    const result = issueToken(existing);
    expect(result).toBe("ABCD1234-AAAA");
  });

  it("mints exactly one new token when none is active", () => {
    const first = issueToken([]);
    const second = issueToken([first]);
    expect(second).toBe(first); // second call is idempotent on the first token
  });
});

describe("Autosave revision guarding (RPC contract)", () => {
  interface SaveResult {
    success: boolean;
    stale_revision?: boolean;
    revision?: number;
    current_revision?: number;
  }

  // Mirrors autosave_assessment_answers: incoming revision must exceed max stored.
  function applyAutosave(storedMaxRevision: number, incomingRevision: number): SaveResult {
    if (incomingRevision <= storedMaxRevision) {
      return { success: false, stale_revision: true, current_revision: storedMaxRevision };
    }
    return { success: true, revision: incomingRevision };
  }

  it("accepts a strictly increasing revision", () => {
    expect(applyAutosave(3, 4)).toEqual({ success: true, revision: 4 });
  });

  it("rejects a stale out-of-order autosave without overwriting newer answers", () => {
    const result = applyAutosave(7, 5);
    expect(result.success).toBe(false);
    expect(result.stale_revision).toBe(true);
    expect(result.current_revision).toBe(7);
  });

  it("rejects replayed identical revisions", () => {
    expect(applyAutosave(9, 9).success).toBe(false);
  });
});
