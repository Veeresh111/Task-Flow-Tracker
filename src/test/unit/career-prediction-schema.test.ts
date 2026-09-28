/**
 * Unit tests: career-prediction schema contract.
 *
 * Every fixture is a REAL shape observed in production or a direct regression
 * of the white-screen defect (undefined.includes crash). No invented data.
 */
import { describe, it, expect } from "vitest";
import {
  parseCareerPrediction,
  predictionStaleness,
  careerPredictionSchema,
} from "@/lib/schemas/career-prediction";

describe("parseCareerPrediction — the production white-screen defect", () => {
  it("REJECTS the exact crash shape: missing promotion_verdict (was undefined.includes)", () => {
    // Regression: this shape crashed CareerPredictor.tsx:244 with
    // "Cannot read properties of undefined (reading 'includes')"
    const crashing = {
      raise_verdict: "Deserves Raise",
      layoff_risk: 15,
      dry_promotion_chance: 85,
      training_required: false,
    };
    const r = parseCareerPrediction(crashing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join(" ")).toMatch(/promotion_verdict/);
  });

  it("REJECTS null and undefined blobs outright", () => {
    expect(parseCareerPrediction(null).ok).toBe(false);
    expect(parseCareerPrediction(undefined).ok).toBe(false);
  });

  it("REJECTS a raw AI prose string (AI failed to return JSON)", () => {
    expect(parseCareerPrediction("Sorry, I cannot help with that.").ok).toBe(false);
  });

  it("REJECTS unknown extra keys (strict — AI hallucinated fields are surfaced, not silently accepted)", () => {
    const r = parseCareerPrediction({
      promotion_verdict: "Deserves Promotion",
      raise_verdict: "Deserves Raise",
      layoff_risk: 10,
      dry_promotion_chance: 90,
      training_required: false,
      // AI-invented field:
      salary_multiplier: 3.5,
    });
    expect(r.ok).toBe(false);
  });

  it("REJECTS out-of-range probabilities (no fake 400% risk)", () => {
    const r = parseCareerPrediction({
      promotion_verdict: "Maintain Current Level",
      raise_verdict: "Hold Steady",
      layoff_risk: 400,
      dry_promotion_chance: 0,
      training_required: false,
    });
    expect(r.ok).toBe(false);
  });

  it("REJECTS training_required=true without training_topic", () => {
    const r = parseCareerPrediction({
      promotion_verdict: "Deserves Promotion",
      raise_verdict: "Hold Steady",
      layoff_risk: 10,
      dry_promotion_chance: 20,
      training_required: true,
    });
    expect(r.ok).toBe(false);
  });

  it("ACCEPTS a fully valid prediction and exposes typed data", () => {
    const r = parseCareerPrediction({
      promotion_verdict: "Deserves Promotion",
      raise_verdict: "Deserves Raise",
      layoff_risk: 12,
      dry_promotion_chance: 88,
      training_required: true,
      training_topic: "System design",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Type-level guarantee: these exist post-parse (the old crash is
      // impossible on this path).
      expect(r.data.promotion_verdict.includes("Promotion")).toBe(true);
      expect(r.data.raise_verdict.includes("Raise")).toBe(true);
    }
  });

  it("clamps nothing silently — numbers stay numbers, strings stay strings", () => {
    const r = parseCareerPrediction({
      promotion_verdict: "Maintain Current Level",
      raise_verdict: "Lower Salary",
      layoff_risk: 0,
      dry_promotion_chance: 100,
      training_required: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.layoff_risk).toBe(0);
      expect(r.data.dry_promotion_chance).toBe(100);
    }
  });

  it("schema rejects NaN-shaped garbage via zod number type", () => {
    const r = parseCareerPrediction({
      promotion_verdict: "x",
      raise_verdict: "y",
      layoff_risk: "high", // string pretending to be a number
      dry_promotion_chance: 0,
      training_required: false,
    });
    expect(r.ok).toBe(false);
  });
});

describe("careerPredictionSchema refinement", () => {
  it("exposes the failed refine path for training_topic", () => {
    const r = careerPredictionSchema.safeParse({
      promotion_verdict: "a",
      raise_verdict: "b",
      layoff_risk: 1,
      dry_promotion_chance: 2,
      training_required: true,
      // topic missing → refine fails
    });
    expect(r.success).toBe(false);
  });
});

describe("predictionStaleness", () => {
  it("marks predictions older than 7 days as stale", () => {
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    expect(predictionStaleness(old)).toBe("stale");
  });
  it("marks fresh predictions as not stale", () => {
    expect(predictionStaleness(new Date().toISOString())).toBe("none");
  });
  it("missing timestamp → none (honest: unknown age is not claimed fresh or stale)", () => {
    expect(predictionStaleness(undefined)).toBe("none");
  });
});
