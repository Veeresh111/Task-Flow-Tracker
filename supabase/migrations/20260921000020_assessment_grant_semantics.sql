-- ============================================================================
-- Migration: 20260921000020_assessment_grant_semantics.sql
-- Purpose: corrective capture of the WORKING grant fix (applied and
--   wire-verified during the S4 probe session after migrations 18/19 proved
--   insufficient).
--
--   ROOT CAUSE of the 18/19 failure: column-level REVOKEs are nullified
--   when the role also holds TABLE-level SELECT (Postgres grants table
--   SELECT over all columns). assessments carried table-level
--   authenticated=arwdDxtm and anon=r from blanket grants.
--
--   CORRECT SEMANTICS (applied live + verified over the REST wire):
--     anon:  no table SELECT; column-level SELECT on safe metadata only.
--            Explicit questions SELECT → 401. Full-row SELECT → 401.
--            Metadata SELECT → 200.
--     authenticated: same surface (candidates receive exam content through
--            the sanitized get_assessment_by_token RPC, never the raw key).
-- ============================================================================

BEGIN;

-- anon: replace table-level SELECT with column-level SELECT.
REVOKE SELECT ON public.assessments FROM anon;
GRANT SELECT (id, title, difficulty, status, duration_minutes, passing_score,
              question_count, created_at, job_form_id, job_posting_id, max_attempts)
  ON public.assessments TO anon;

-- authenticated: same treatment (candidates must not read the answer key).
REVOKE SELECT ON public.assessments FROM authenticated;
GRANT SELECT (id, title, difficulty, status, duration_minutes, passing_score,
              question_count, created_at, job_form_id, job_posting_id, max_attempts)
  ON public.assessments TO authenticated;

-- Keep write surface consistent with the RLS policy matrix (HR/admin only).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.assessments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.assessments FROM authenticated;

-- service_role retains full access for edge/worker contexts.
GRANT ALL ON public.assessments TO service_role;

COMMIT;
