-- ============================================================
-- Phase 1.5: Clean up orphaned tables after data consolidation
--
-- What this does:
--   1. DROP `applications` table (0 rows, FK removed in phase1, 0 app code references)
--   2. DROP `recruitment_posts` table (data migrated to job_forms, 0 frontend references)
--   3. Clean up stale RLS policies on dropped tables
-- ============================================================

-- ============================================================
-- 1. DROP `applications` table (orphaned, never populated)
-- ============================================================
--    This table was created in 20260619231324_security_migration.sql
--    as a unified applications table. Zero rows were ever inserted.
--    The only FK referencing it (assessment_tokens.application_id)
--    was redirected to job_applications(id) in the phase1 migration.
-- ============================================================
DROP POLICY IF EXISTS "applications_select_hr" ON public.applications;
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
DROP POLICY IF EXISTS "applications_update_hr" ON public.applications;

DROP TRIGGER IF EXISTS trg_applications_updated_at ON public.applications;

ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS fk_applications_candidate;

DROP INDEX IF EXISTS idx_applications_candidate_job;

DROP TABLE IF EXISTS public.applications;

-- ============================================================
-- 2. DROP `recruitment_posts` table (data migrated to job_forms)
-- ============================================================
--    All data from recruitment_posts was migrated to job_forms
--    in 20260620010000_data_consolidation_phase1.sql (Part A3).
--    All frontend code has been updated to read/write job_forms.
--    The job_forms table has matching RLS policies already.
-- ============================================================
DROP POLICY IF EXISTS "recruitment_posts_select_all" ON public.recruitment_posts;
DROP POLICY IF EXISTS "recruitment_posts_insert_update" ON public.recruitment_posts;

DROP TABLE IF EXISTS public.recruitment_posts;

-- ============================================================
-- 3. ADD MISSING RLS POLICY: candidate self-select on job_applications
-- ============================================================
--    The Interviews page (candidate-facing) reads job_applications
--    to find interview sessions. Candidates need to SELECT their
--    own applications. The existing policies only cover admin/hr.
--    This policy allows candidates to see applications linked to
--    their profile via candidates.profile_id → profiles.id.
-- ============================================================
DROP POLICY IF EXISTS "applications_select_candidate" ON public.job_applications;
CREATE POLICY "applications_select_candidate" ON public.job_applications
  FOR SELECT
  USING (
    candidate_id IN (
      SELECT c.id FROM public.candidates c
      JOIN public.profiles p ON c.profile_id = p.id
      WHERE p.id = auth.uid()
    )
    OR
    candidate_id IN (
      SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL
    )
  );
