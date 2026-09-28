/**
 * Authoritative runtime contract for `profiles.ai_career_prediction`.
 *
 * WHY THIS EXISTS (evidence): the dashboard white-screened because this column
 * was read as an unvalidated JSONB blob — one missing string field produced
 * `undefined.includes()` and killed the entire route. Data crossing the
 * network/DB boundary is UNTRUSTED until it parses against this schema.
 *
 * AI output policy: the provider's text is parsed by `callCorporateAI` and
 * MUST be validated here before it can reach the UI or be persisted. A failed
 * validation NEVER becomes fake success — it becomes an explicit degraded
 * state the UI renders honestly.
 */
import { z } from "zod";

export const careerPredictionSchema = z.object({
  promotion_verdict: z.string().min(1),
  raise_verdict: z.string().min(1),
  /** 0–100 probability, clamped to the documented range. */
  layoff_risk: z.number().min(0).max(100),
  /** 0–100 probability, clamped to the documented range. */
  dry_promotion_chance: z.number().min(0).max(100),
  training_required: z.boolean(),
  /** Required only when training_required is true (enforced below). */
  training_topic: z.string().min(1).optional(),
  /** ISO timestamp of prediction generation — informational. */
  generated_at: z.string().datetime().optional(),
}).strict()
  .refine(
    (p) => !p.training_required || !!p.training_topic,
    { message: "training_topic is required when training_required is true" },
  );

export type CareerPrediction = z.infer<typeof careerPredictionSchema>;

/** Result of a validation attempt — never throws, always explicit. */
export type PredictionParseResult =
  | { ok: true; data: CareerPrediction }
  | { ok: false; reason: string; issues: string[] };

/**
 * Parse untrusted JSONB into a validated prediction.
 * Returns a discriminated union; callers must render the failure honestly.
 */
export function parseCareerPrediction(raw: unknown): PredictionParseResult {
  const r = careerPredictionSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    reason: "INVALID_PREDICTION_SHAPE",
    issues: r.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/**
 * Classify the previous risk level of a stored prediction so the UI can show
 * "stale data" honestly instead of presenting it as current.
 */
export function predictionStaleness(generatedAt: string | undefined): "none" | "stale" {
  if (!generatedAt) return "none";
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return "none";
  return Date.now() - t > 7 * 24 * 3600 * 1000 ? "stale" : "none";
}
