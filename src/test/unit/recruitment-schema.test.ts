/**
 * Unit tests: recruitment AI-data contracts (ATS results, ai_verdict).
 * Fixtures are real observed shapes / direct regressions of the white-screen
 * bug class ("Objects are not valid as a React child" from an object verdict).
 */
import { describe, it, expect } from "vitest";
import {
  parseAtsResult,
  parseAiVerdict,
  verdictText,
} from "@/lib/schemas/recruitment";

describe("parseAtsResult", () => {
  const valid = {
    score: 82,
    name: "Test Candidate",
    recommendation: "Hire",
    missing: "Kubernetes, Terraform",
    skills: [{ name: "React", value: 90 }],
  };

  it("accepts a complete AI ATS result", () => {
    const r = parseAtsResult(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.score).toBe(82);
  });

  it("accepts a minimal result (AI omitted optional keys)", () => {
    const r = parseAtsResult({ score: 40, recommendation: "Review" });
    expect(r.ok).toBe(true);
  });

  it("rejects missing score (the field every render site depends on)", () => {
    const r = parseAtsResult({ recommendation: "Hire" });
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range score (AI said 130)", () => {
    const r = parseAtsResult({ score: 130, recommendation: "Hire" });
    expect(r.ok).toBe(false);
  });

  it("rejects a prose string instead of JSON (AI failure mode)", () => {
    expect(parseAtsResult("I cannot analyze this resume.").ok).toBe(false);
  });

  it("rejects skills with non-numeric values", () => {
    const r = parseAtsResult({
      score: 50,
      recommendation: "Consider",
      skills: [{ name: "React", value: "expert" }],
    });
    expect(r.ok).toBe(false);
  });

  it("reports the failing path in issues (actionable diagnostics)", () => {
    const r = parseAtsResult({ score: -5, recommendation: "Hire" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join(" ")).toMatch(/score/);
  });
});

describe("parseAiVerdict — the React-child white-screen regression", () => {
  it("accepts the string form", () => {
    const r = parseAiVerdict("Hire");
    expect(r.ok).toBe(true);
    if (r.ok) expect(verdictText(r.data)).toBe("Hire");
  });

  it("accepts the object form WITHOUT crashing and extracts verdict text", () => {
    // Regression: rendering this object directly threw
    // "Objects are not valid as a React child" → white screen.
    const r = parseAiVerdict({ verdict: "Hire", reason: "Strong match" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(verdictText(r.data)).toBe("Hire");
  });

  it("object without verdict key → verdictText null (caller renders Pending)", () => {
    const r = parseAiVerdict({ reason: "only a reason" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(verdictText(r.data)).toBeNull();
  });

  it("null/undefined is NO_VERDICT — the legitimate not-yet-screened state", () => {
    expect(parseAiVerdict(null).ok).toBe(false);
    expect(parseAiVerdict(undefined).ok).toBe(false);
    // And the UI contract: pending must come from the CALLER, not fabricated:
    expect(verdictText(null)).toBeNull();
  });

  it("rejects a numeric verdict (neither string nor object)", () => {
    expect(parseAiVerdict(42).ok).toBe(false);
  });

  it("rejects an empty-string verdict", () => {
    expect(parseAiVerdict("").ok).toBe(false);
  });
});
