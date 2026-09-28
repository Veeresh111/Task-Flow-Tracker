-- ============================================================================
-- Migration: 20260921000018_anon_assessment_select_scoping.sql
-- Purpose (REST-faithful probe finding — S4 security):
--   The policy "Public Read Active Assessments" grants anon SELECT on
--   assessments. Verified live over the real PostgREST endpoint: the
--   response includes the `questions` jsonb WITH `correctAnswer` values
--   (e.g. the literal correct option for every question) for all 64
--   assessments. Candidates never need this path — the exam page resolves
--   assessment content through get_assessment_by_token (sanitized RPC).
--
--   Postgres RLS cannot mask individual columns. Options were:
--     (a) revoke table SELECT from anon entirely — breaks nothing? The only
--         anon-facing consumer of assessment content is the token flow (RPC).
--         Candidate Dashboard reads assessments but is AUTHENTICATED.
--     (b) column-level GRANT restrictions for anon (revoke SELECT on
--         questions from anon) — surgical, keeps anon metadata access if any
--         future public page needs it, and crucially removes the answer key
--         from the wire.
--   Chosen: (b) column-level grants + (c) tighten the anon policy to only
--   expose assessments that belong to an ACTIVE job form lifecycle.
-- ============================================================================

BEGIN;

-- (b) Column-level grant surgery for anon:
REVOKE SELECT (questions) ON public.assessments FROM anon;
-- Ensure anon keeps SELECT on the non-sensitive columns it may need.
GRANT SELECT (id, title, difficulty, status, duration_minutes, passing_score,
              question_count, created_at, job_form_id, job_posting_id, max_attempts)
  ON public.assessments TO anon;

-- (c) Replace the blanket public-read policy with a lifecycle-scoped one.
DROP POLICY IF EXISTS "Public Read Active Assessments" ON public.assessments;
DROP POLICY IF EXISTS "Public Read Active Assessments Scoped" ON public.assessments;
CREATE POLICY "Public Read Active Assessments Scoped"
  ON public.assessments FOR SELECT TO public
  USING (
    status = 'Active'
    AND job_form_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.job_forms jf
      WHERE jf.id = assessments.job_form_id
        AND jf.status IN ('Active', 'Published', 'Open')
    )
  );

COMMIT;
