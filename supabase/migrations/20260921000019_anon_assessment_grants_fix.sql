-- ============================================================================
-- Migration: 20260921000019_anon_assessment_grants_fix.sql
-- Purpose: migration 18's REVOKE on the questions column did not hold —
--   a later GRANT ALL (post-18 default privileges on the live project)
--   re-granted all columns to anon, and the wire probe still returned
--   correctAnswer values. This migration re-applies grant surgery LAST,
--   revokes anon write privileges entirely (RLS already blocks anon
--   writes; grants should match the policy surface), and re-grants only
--   the safe metadata columns.
-- ============================================================================

BEGIN;

-- 1. Revoke anon write privileges entirely on assessments (RLS policy
--    surface for anon is SELECT-only; grants must match).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.assessments FROM anon;

-- 2. Re-apply the column-level grant surgery.
REVOKE SELECT (questions) ON public.assessments FROM anon;
GRANT SELECT (id, title, difficulty, status, duration_minutes, passing_score,
              question_count, created_at, job_form_id, job_posting_id, max_attempts)
  ON public.assessments TO anon;

-- 3. Same surgery for authenticated (candidates are authenticated; they get
--    exam content via the sanitized RPC, never the raw key).
REVOKE SELECT (questions) ON public.assessments FROM authenticated;
GRANT SELECT (id, title, difficulty, status, duration_minutes, passing_score,
              question_count, created_at, job_form_id, job_posting_id, max_attempts)
  ON public.assessments TO authenticated;

-- 4. Restore full grants for service_role (worker/edge contexts).
GRANT ALL ON public.assessments TO service_role;

COMMIT;
