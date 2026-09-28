-- ============================================================================
-- 20260927000003 — Grading persistence columns on assessment_attempts
-- ============================================================================
-- LIVE-PROVEN (session 9, full-lifecycle probe LC-06c):
--   The grade-assessment edge function 500s writing a graded attempt:
--     "Could not find the 'ai_feedback' column of 'assessment_attempts'"
--   Live table only carries: id, assessment_id, candidate_id, score,
--   total_questions, correct_answers, percentage, passed, started_at,
--   completed_at, created_at — the grader (deployed AND local source) persists
--   the full authoritative evidence set: per-answer selections, server-side
--   violation count, AI feedback label, token and application linkage.
--
-- Fix: additive nullable columns — no backfill needed, existing graded
-- history (currently zero rows live) stays untouched. nullable by design:
-- handshake-created in-flight attempts have no grading fields yet.
-- ============================================================================

ALTER TABLE public.assessment_attempts
  ADD COLUMN IF NOT EXISTS violations int,
  ADD COLUMN IF NOT EXISTS selections jsonb,
  ADD COLUMN IF NOT EXISTS ai_feedback text,
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.job_applications(id),
  ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES public.assessment_tokens(id);
