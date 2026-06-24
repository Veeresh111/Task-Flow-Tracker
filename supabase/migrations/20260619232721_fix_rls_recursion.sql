-- Fix RLS infinite recursion by using SECURITY DEFINER helper function
-- Policies on profiles that query profiles cause infinite recursion

-- 1. Create helper function to get user role (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Create helper to get user department (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_department()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid();
$$;

-- 3. Create helper to check if user has any of the given roles
CREATE OR REPLACE FUNCTION public.user_has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(public.get_user_role() = ANY(roles), false);
$$;

-- 3. Drop existing recursive policies on profiles
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "team_lead_read_team" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON public.profiles;

-- 4. Recreate all profile policies without recursion
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));

CREATE POLICY "team_lead_read_team" ON public.profiles
  FOR SELECT USING (
    public.user_has_role(ARRAY['team_lead', 'tl'])
    AND (
      department = public.get_user_department()
      OR team_lead_id = auth.uid()
      OR id = auth.uid()
    )
  );

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (role IS NOT DISTINCT FROM public.get_user_role())
  );

CREATE POLICY "admin_update_all_profiles" ON public.profiles
  FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr']));

CREATE POLICY "admin_insert_profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin']) OR auth.uid() = id);

CREATE POLICY "admin_delete_profiles" ON public.profiles
  FOR DELETE USING (public.user_has_role(ARRAY['admin']));

-- 5. Fix all other tables' policies that query profiles (fix recursion risk)
-- Candidates
DROP POLICY IF EXISTS "candidates_select_all" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_all" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_all" ON public.candidates;
CREATE POLICY "candidates_select_all" ON public.candidates FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "candidates_insert_all" ON public.candidates FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "candidates_update_all" ON public.candidates FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Job Forms
DROP POLICY IF EXISTS "job_forms_select_all" ON public.job_forms;
DROP POLICY IF EXISTS "job_forms_insert_update" ON public.job_forms;
CREATE POLICY "job_forms_select_all" ON public.job_forms FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "job_forms_insert_update" ON public.job_forms FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Recruitment Posts
DROP POLICY IF EXISTS "recruitment_posts_select_all" ON public.recruitment_posts;
DROP POLICY IF EXISTS "recruitment_posts_insert_update" ON public.recruitment_posts;
CREATE POLICY "recruitment_posts_select_all" ON public.recruitment_posts FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "recruitment_posts_insert_update" ON public.recruitment_posts FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Job Applications
DROP POLICY IF EXISTS "applications_select_hr" ON public.job_applications;
DROP POLICY IF EXISTS "applications_insert" ON public.job_applications;
DROP POLICY IF EXISTS "applications_update_hr" ON public.job_applications;
CREATE POLICY "applications_select_hr" ON public.job_applications FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "applications_insert" ON public.job_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "applications_update_hr" ON public.job_applications FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Candidate Applications
DROP POLICY IF EXISTS "candidate_applications_select_hr" ON public.candidate_applications;
DROP POLICY IF EXISTS "candidate_applications_update_hr" ON public.candidate_applications;
CREATE POLICY "candidate_applications_select_hr" ON public.candidate_applications FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "candidate_applications_update_hr" ON public.candidate_applications FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Assessments
DROP POLICY IF EXISTS "assessments_select_hr" ON public.assessments;
DROP POLICY IF EXISTS "assessments_insert_update_hr" ON public.assessments;
CREATE POLICY "assessments_select_hr" ON public.assessments FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "assessments_insert_update_hr" ON public.assessments FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Assessment Tokens
DROP POLICY IF EXISTS "tokens_select_hr" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_select_candidate_own" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_insert_update_hr" ON public.assessment_tokens;
CREATE POLICY "tokens_select_hr" ON public.assessment_tokens FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "tokens_select_candidate_own" ON public.assessment_tokens FOR SELECT USING (candidate_id = auth.uid());
CREATE POLICY "tokens_insert_update_hr" ON public.assessment_tokens FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Interview Sessions
DROP POLICY IF EXISTS "interviews_select_hr" ON public.interview_sessions;
DROP POLICY IF EXISTS "interviews_insert_update_hr" ON public.interview_sessions;
CREATE POLICY "interviews_select_hr" ON public.interview_sessions FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "interviews_insert_update_hr" ON public.interview_sessions FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Work Logs
DROP POLICY IF EXISTS "work_logs_select_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_select_team_lead" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_insert_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_update_own" ON public.work_logs;
CREATE POLICY "work_logs_select_own" ON public.work_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "work_logs_select_team_lead" ON public.work_logs FOR SELECT USING (public.user_has_role(ARRAY['team_lead', 'tl', 'admin', 'hr']));
CREATE POLICY "work_logs_insert_own" ON public.work_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "work_logs_update_own" ON public.work_logs FOR UPDATE USING (user_id = auth.uid());

-- Tasks
DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_team" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_update" ON public.tasks;
CREATE POLICY "tasks_select_own" ON public.tasks FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "tasks_select_team" ON public.tasks FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']));
CREATE POLICY "tasks_insert_update" ON public.tasks FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']));

-- Projects
DROP POLICY IF EXISTS "projects_select_all" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_update" ON public.projects;
CREATE POLICY "projects_select_all" ON public.projects FOR SELECT USING (true);
CREATE POLICY "projects_insert_update" ON public.projects FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']));

-- Leaves
DROP POLICY IF EXISTS "leaves_select_own" ON public.leaves;
DROP POLICY IF EXISTS "leaves_select_admin" ON public.leaves;
DROP POLICY IF EXISTS "leaves_insert_own" ON public.leaves;
DROP POLICY IF EXISTS "leaves_update_admin" ON public.leaves;
CREATE POLICY "leaves_select_own" ON public.leaves FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "leaves_select_admin" ON public.leaves FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']));
CREATE POLICY "leaves_insert_own" ON public.leaves FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "leaves_update_admin" ON public.leaves FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']));

-- Complaints
DROP POLICY IF EXISTS "complaints_select_own" ON public.complaints;
DROP POLICY IF EXISTS "complaints_select_admin" ON public.complaints;
DROP POLICY IF EXISTS "complaints_insert" ON public.complaints;
CREATE POLICY "complaints_select_own" ON public.complaints FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "complaints_select_admin" ON public.complaints FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "complaints_insert" ON public.complaints FOR INSERT WITH CHECK (user_id = auth.uid());

-- Notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (public.user_has_role(ARRAY['admin', 'hr']));

-- Candidate Onboarding
DROP POLICY IF EXISTS "onboarding_select_hr" ON public.candidate_onboarding;
CREATE POLICY "onboarding_select_hr" ON public.candidate_onboarding FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Background Verifications
DROP POLICY IF EXISTS "background_verifications_select_hr" ON public.background_verifications;
CREATE POLICY "background_verifications_select_hr" ON public.background_verifications FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Payroll Tables (wrapped with table existence checks)
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payroll_ledger' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "payroll_select_hr" ON public.payroll_ledger;
  CREATE POLICY "payroll_select_hr" ON public.payroll_ledger FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payroll_history_records' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "payroll_history_select_own" ON public.payroll_history_records;
  DROP POLICY IF EXISTS "payroll_history_select_hr" ON public.payroll_history_records;
  CREATE POLICY "payroll_history_select_own" ON public.payroll_history_records FOR SELECT USING (employee_id = auth.uid());
  CREATE POLICY "payroll_history_select_hr" ON public.payroll_history_records FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='salary_revision_history' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "salary_revision_select_hr" ON public.salary_revision_history;
  CREATE POLICY "salary_revision_select_hr" ON public.salary_revision_history FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
END IF; END $$;

-- New applications table
DROP POLICY IF EXISTS "applications_select_hr" ON public.applications;
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
DROP POLICY IF EXISTS "applications_update_hr" ON public.applications;
CREATE POLICY "applications_select_hr" ON public.applications FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "applications_insert" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "applications_update_hr" ON public.applications FOR UPDATE USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Assessment attempts
DROP POLICY IF EXISTS "attempts_select_hr" ON public.assessment_attempts;
DROP POLICY IF EXISTS "attempts_select_own" ON public.assessment_attempts;
CREATE POLICY "attempts_select_hr" ON public.assessment_attempts FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "attempts_select_own" ON public.assessment_attempts FOR SELECT USING (candidate_id = auth.uid());

-- Offer letters
DROP POLICY IF EXISTS "offer_letters_select_hr" ON public.offer_letters;
DROP POLICY IF EXISTS "offer_letters_insert_update_hr" ON public.offer_letters;
CREATE POLICY "offer_letters_select_hr" ON public.offer_letters FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "offer_letters_insert_update_hr" ON public.offer_letters FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));

-- Offer approvals
DROP POLICY IF EXISTS "offer_approvals_select" ON public.offer_approvals;
DROP POLICY IF EXISTS "offer_approvals_insert_update" ON public.offer_approvals;
CREATE POLICY "offer_approvals_select" ON public.offer_approvals FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']) OR approver_id = auth.uid());
CREATE POLICY "offer_approvals_insert_update" ON public.offer_approvals FOR ALL USING (approver_id = auth.uid() OR public.user_has_role(ARRAY['admin']));

-- Assessment answers
DROP POLICY IF EXISTS "answers_select_hr" ON public.assessment_answers;
DROP POLICY IF EXISTS "answers_insert_update_hr" ON public.assessment_answers;
CREATE POLICY "answers_select_hr" ON public.assessment_answers FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));
CREATE POLICY "answers_insert_update_hr" ON public.assessment_answers FOR ALL USING (public.user_has_role(ARRAY['admin', 'hr']));
