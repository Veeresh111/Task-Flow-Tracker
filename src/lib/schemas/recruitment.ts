/**
 * Authoritative runtime contracts for AI/ATS-derived JSONB in recruitment.
 *
 * WHY (evidence): CareerPredictor white-screened on an unvalidated AI JSONB
 * blob. The same untrusted-input pattern exists on recruitment tables
 * (job_applications.ai_verdict / missing_skills, ATS parse results from the
 * AI provider). Every blob crossing the DB/AI boundary is parsed here before
 * any UI renders it. Invalid data degrades honestly — never faked.
 */
import { z } from "zod";

/** ATS scan result persisted on job_applications (ATSScanner.tsx). */
export const atsResultSchema = z.object({
  /** 0–100 JD-match score. */
  score: z.number().min(0).max(100),
  /** Name extracted from the resume by the AI. */
  name: z.string().min(1).optional(),
  /** Coarse hiring recommendation. */
  recommendation: z.enum(["Hire", "Consider", "Review"]).or(z.string().min(1)),
  /** Comma/space-separated missing-skills text as produced by the prompt. */
  missing: z.string().optional(),
  /** Per-skill breakdown (AI may omit). */
  skills: z
    .array(
      z.object({
        name: z.string().min(1),
        value: z.number().min(0).max(100),
      }),
    )
    .optional(),
});

export type AtsResult = z.infer<typeof atsResultSchema>;

export type AtsParseResult =
  | { ok: true; data: AtsResult }
  | { ok: false; reason: string; issues: string[] };

export function parseAtsResult(raw: unknown): AtsParseResult {
  const r = atsResultSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    reason: "INVALID_ATS_SHAPE",
    issues: r.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/**
 * ai_verdict column shape. The AI was prompted (InterviewCenter/ATSScanner)
 * for a free-text verdict; stored values have been observed as plain strings
 * AND as { verdict, reason } objects. Accept both, expose one shape.
 */
const aiVerdictObject = z.object({
  verdict: z.string().min(1).optional(),
  reason: z.string().optional(),
  /** Any other AI-added keys are surfaced as a validation failure upstream. */
}).passthrough();

export const aiVerdictSchema = z.union([z.string().min(1), aiVerdictObject]);

export type AiVerdict = z.infer<typeof aiVerdictSchema>;

export type VerdictParseResult =
  | { ok: true; data: AiVerdict }
  | { ok: false; reason: string; issues: string[] };

export function parseAiVerdict(raw: unknown): VerdictParseResult {
  // null/undefined is a LEGITIMATE state (candidate not yet screened) —
  // represented as ok:false so callers must render "Pending" explicitly.
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "NO_VERDICT", issues: [] };
  }
  const r = aiVerdictSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    reason: "INVALID_VERDICT_SHAPE",
    issues: r.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Render helper: verdict text for UI, or null when pending/invalid. */
export function verdictText(v: AiVerdict | null): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : (v.verdict ?? null);
}
