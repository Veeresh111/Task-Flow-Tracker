-- ============================================================
-- Hotfix: Enable RLS + correct policies on job_applications
--          and assessment_tokens
--
-- Live DB schema confirmed:
--   profiles has: id, email, role, candidate_id
--   candidates has: id, email (NO profile_id)
--   assessment_tokens has: id, candidate_id, assessment_id, token
--   job_applications has: id, candidate_id, form_id, status
--
-- The link between auth.uid() and candidates:
--   profiles.candidate_id -> candidates.id
-- ============================================================

-- ============================================================
-- STEP 0: Drop ALL existing policies (both dashboard-generated
--          and migration-style names)
-- ============================================================

-- job_applications: dashboard-generated names
DROP POLICY IF EXISTS "job_applications_select" ON public.job_applications;
DROP POLICY IF EXISTS "job_applications_insert" ON public.job_applications;
DROP POLICY IF EXISTS "job_applications_update" ON public.job_applications;
DROP POLICY IF EXISTS "job_applications_delete" ON public.job_applications;
DROP POLICY IF EXISTS "Allow HR to view applications" ON public.job_applications;
DROP POLICY IF EXISTS "hr_read_all_job_applications" ON public.job_applications;
DROP POLICY IF EXISTS "Enable read for users based on user ID" ON public.job_applications;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.job_applications;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.job_applications;

-- job_applications: migration-style names
DROP POLICY IF EXISTS "applications_select_hr" ON public.job_applications;
DROP POLICY IF EXISTS "applications_select_candidate" ON public.job_applications;
DROP POLICY IF EXISTS "applications_insert" ON public.job_applications;
DROP POLICY IF EXISTS "applications_update_hr" ON public.job_applications;

-- assessment_tokens: dashboard-generated names
DROP POLICY IF EXISTS "assessment_tokens_select" ON public.assessment_tokens;
DROP POLICY IF EXISTS "assessment_tokens_insert" ON public.assessment_tokens;
DROP POLICY IF EXISTS "assessment_tokens_update" ON public.assessment_tokens;
DROP POLICY IF EXISTS "assessment_tokens_delete" ON public.assessment_tokens;
DROP POLICY IF EXISTS "Allow authenticated select assessment tokens" ON public.assessment_tokens;
DROP POLICY IF EXISTS "Enable read for users based on user ID" ON public.assessment_tokens;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.assessment_tokens;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.assessment_tokens;

-- assessment_tokens: migration-style names
DROP POLICY IF EXISTS "tokens_select_hr" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_select_candidate_own" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_insert_update_hr" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_update_candidate_own" ON public.assessment_tokens;

-- ============================================================
-- STEP 1: Enable RLS on both tables
-- ============================================================
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: job_applications policies
-- ============================================================

-- 2a. HR/Admin can SELECT all applications
CREATE POLICY "applications_select_hr" ON public.job_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- 2b. Candidates can SELECT their own applications
-- Matches via:
--   candidate_id = auth.uid() (direct match) OR
--   candidate_id = profiles.candidate_id (mapped to candidates.id)
CREATE POLICY "applications_select_candidate" ON public.job_applications
  FOR SELECT
  USING (
    candidate_id = auth.uid()
    OR
    candidate_id = (
      SELECT candidate_id FROM public.profiles
      WHERE id = auth.uid() AND candidate_id IS NOT NULL
    )
  );

-- 2c. Anyone authenticated can INSERT (open application submission)
CREATE POLICY "applications_insert" ON public.job_applications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 2d. Only HR/Admin can UPDATE applications (candidates CANNOT)
CREATE POLICY "applications_update_hr" ON public.job_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- ============================================================
-- STEP 3: assessment_tokens policies
-- ============================================================

-- 3a. HR/Admin can SELECT all tokens
CREATE POLICY "tokens_select_hr" ON public.assessment_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- 3b. Candidates can SELECT their own tokens
CREATE POLICY "tokens_select_candidate_own" ON public.assessment_tokens
  FOR SELECT
  USING (
    candidate_id = auth.uid()
    OR
    candidate_id = (
      SELECT candidate_id FROM public.profiles
      WHERE id = auth.uid() AND candidate_id IS NOT NULL
    )
  );

-- 3c. HR/Admin can INSERT/UPDATE/DELETE tokens
CREATE POLICY "tokens_insert_update_hr" ON public.assessment_tokens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- 3d. Candidates can UPDATE their own tokens (for assessment submission)
CREATE POLICY "tokens_update_candidate_own" ON public.assessment_tokens
  FOR UPDATE
  USING (
    candidate_id = auth.uid()
    OR
    candidate_id = (
      SELECT candidate_id FROM public.profiles
      WHERE id = auth.uid() AND candidate_id IS NOT NULL
    )
  );

-- ============================================================
-- Verification queries (run after in SQL Editor)
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('job_applications', 'assessment_tokens');
--
-- SELECT tablename, policyname, permissive, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- AND tablename IN ('job_applications', 'assessment_tokens')
-- ORDER BY tablename, policyname;
