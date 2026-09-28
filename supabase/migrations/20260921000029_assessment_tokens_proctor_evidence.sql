-- ============================================================================
-- Migration: 20260921000029_assessment_tokens_proctor_evidence.sql
-- Purpose (Session 5, P12 submission gate):
--   The grade-assessment Edge Function and the HR ProctoringDashboard both
--   reference assessment_tokens.proctor_log — a column that NEVER existed.
--   Consequence: the grader's token status update silently failed (no error
--   check on the update) and the dashboard's token query silently returned
--   nothing. Add the real evidence columns:
--     proctor_log            — server-fetched incident snapshot persisted by
--                              the grader (from proctoring_logs, not the
--                              client body)
--     server_violation_count — authoritative persisted incident count used
--                              for the disqualification decision
--   Backfill is an honest approximation for historical rows (proctoring_logs
--   has no token_id linkage; match per candidate/attempt where possible).
-- ============================================================================

BEGIN;

ALTER TABLE public.assessment_tokens
  ADD COLUMN IF NOT EXISTS proctor_log JSONB,
  ADD COLUMN IF NOT EXISTS server_violation_count INT NOT NULL DEFAULT 0;

-- Historical backfill (approximate; no token_id on proctoring_logs):
-- prefer attempt-scoped counts, fall back to candidate-scoped.
UPDATE public.assessment_tokens t
SET server_violation_count = GREATEST(t.server_violation_count, COALESCE(agg.cnt, 0))
FROM (
  SELECT l.attempt_id, count(*)::int AS cnt
  FROM public.proctoring_logs l
  GROUP BY l.attempt_id
) agg
WHERE t.attempt_id = agg.attempt_id;

UPDATE public.assessment_tokens t
SET server_violation_count = GREATEST(t.server_violation_count, COALESCE(agg.cnt, 0))
FROM (
  SELECT l.candidate_id, count(*)::int AS cnt
  FROM public.proctoring_logs l
  GROUP BY l.candidate_id
) agg
WHERE t.attempt_id IS NULL
  AND t.candidate_id = agg.candidate_id;

COMMIT;
