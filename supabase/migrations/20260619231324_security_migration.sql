-- ============================================================
-- COMPLETE SECURITY + SCHEMA MIGRATION
-- ============================================================

-- 1. Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Create unified applications table FIRST (needed by other FKs)
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL,
  job_posting_id UUID,
  job_form_id UUID,
  status TEXT NOT NULL DEFAULT 'Applied',
  interview_status TEXT DEFAULT 'Not Scheduled',
  interview_score DECIMAL,
  ai_verdict TEXT,
  ai_score DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications' AND table_schema = 'public') THEN ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY; END IF; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_candidate_job
  ON public.applications (candidate_id, COALESCE(job_posting_id, '00000000-0000-0000-0000-000000000000'));

CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2b. Add FK to candidates after table creation if candidates table has id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'candidates' AND table_schema = 'public') THEN
    ALTER TABLE public.applications ADD CONSTRAINT fk_applications_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);
  END IF;
END $$;

-- 3. Create assessment_attempts table
CREATE TABLE IF NOT EXISTS public.assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID,
  assessment_id UUID,
  application_id UUID,
  token_id UUID,
  score INTEGER NOT NULL,
  passed BOOLEAN DEFAULT false,
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  violations INTEGER DEFAULT 0,
  ai_feedback TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assessment_attempts' AND table_schema = 'public') THEN ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY; END IF; END $$;

-- 4. Add missing columns to assessment_tokens (no FK to applications yet)
ALTER TABLE public.assessment_tokens
  ADD COLUMN IF NOT EXISTS assessment_id UUID,
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assessment_tokens_assessments') THEN
    ALTER TABLE public.assessment_tokens ADD CONSTRAINT fk_assessment_tokens_assessments FOREIGN KEY (assessment_id) REFERENCES public.assessments(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assessment_tokens_applications') THEN
    ALTER TABLE public.assessment_tokens ADD CONSTRAINT fk_assessment_tokens_applications FOREIGN KEY (application_id) REFERENCES public.applications(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assessment_tokens_attempts') THEN
    ALTER TABLE public.assessment_tokens ADD CONSTRAINT fk_assessment_tokens_attempts FOREIGN KEY (attempt_id) REFERENCES public.assessment_attempts(id);
  END IF;
END $$;

-- 5. Add candidate_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS candidate_id UUID;

-- 6. Offer letters table
CREATE TABLE IF NOT EXISTS public.offer_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID,
  candidate_id UUID NOT NULL,
  job_form_id UUID,
  offered_ctc DECIMAL NOT NULL,
  offer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  joining_date DATE,
  status TEXT NOT NULL DEFAULT 'Pending Approval' CHECK (status IN ('Pending Approval', 'Approved', 'Sent', 'Accepted', 'Declined', 'Expired')),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_by UUID,
  offer_letter_url TEXT,
  terms TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offer_letters' AND table_schema = 'public') THEN ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY; END IF; END $$;

CREATE TRIGGER trg_offer_letters_updated_at
  BEFORE UPDATE ON public.offer_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Offer approvals table
CREATE TABLE IF NOT EXISTS public.offer_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL,
  approver_id UUID NOT NULL,
  approval_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  comments TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offer_approvals' AND table_schema = 'public') THEN ALTER TABLE public.offer_approvals ENABLE ROW LEVEL SECURITY; END IF; END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_offer_approvals_offer') THEN
    ALTER TABLE public.offer_approvals ADD CONSTRAINT fk_offer_approvals_offer FOREIGN KEY (offer_id) REFERENCES public.offer_letters(id);
  END IF;
END $$;

-- 8. Assessment answers table
CREATE TABLE IF NOT EXISTS public.assessment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL,
  question_index INTEGER NOT NULL,
  correct_answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assessment_id, question_index)
);

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assessment_answers' AND table_schema = 'public') THEN ALTER TABLE public.assessment_answers ENABLE ROW LEVEL SECURITY; END IF; END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assessment_answers_assessment') THEN
    ALTER TABLE public.assessment_answers ADD CONSTRAINT fk_assessment_answers_assessment FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 9. Add FK columns to assessments
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS job_posting_id UUID,
  ADD COLUMN IF NOT EXISTS job_form_id UUID,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;

-- 10. Add columns to interview_sessions
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS interviewer_id UUID,
  ADD COLUMN IF NOT EXISTS round_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS panel_members UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS human_score DECIMAL CHECK (human_score >= 0 AND human_score <= 100),
  ADD COLUMN IF NOT EXISTS human_feedback TEXT,
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- 11. Add NOT NULL constraint on candidates email
ALTER TABLE public.candidates
  ALTER COLUMN email SET NOT NULL;

-- 12. Auth trigger for new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, department)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Employee'),
    COALESCE(NEW.raw_user_meta_data->>'registered_role', 'candidate'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Unassigned')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES FOR ALL EXISTING TABLES
-- ============================================================

-- Enable RLS on all tables (safe wrapper)
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'candidates' AND table_schema = 'public') THEN ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_forms' AND table_schema = 'public') THEN ALTER TABLE public.job_forms ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recruitment_posts' AND table_schema = 'public') THEN ALTER TABLE public.recruitment_posts ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications' AND table_schema = 'public') THEN ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'candidate_applications' AND table_schema = 'public') THEN ALTER TABLE public.candidate_applications ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assessments' AND table_schema = 'public') THEN ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assessment_tokens' AND table_schema = 'public') THEN ALTER TABLE public.assessment_tokens ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interview_sessions' AND table_schema = 'public') THEN ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_logs' AND table_schema = 'public') THEN ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks' AND table_schema = 'public') THEN ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects' AND table_schema = 'public') THEN ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leaves' AND table_schema = 'public') THEN ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'complaints' AND table_schema = 'public') THEN ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages' AND table_schema = 'public') THEN ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'candidate_onboarding' AND table_schema = 'public') THEN ALTER TABLE public.candidate_onboarding ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'background_verifications' AND table_schema = 'public') THEN ALTER TABLE public.background_verifications ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_ledger' AND table_schema = 'public') THEN ALTER TABLE public.payroll_ledger ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_history_records' AND table_schema = 'public') THEN ALTER TABLE public.payroll_history_records ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'salary_revision_history' AND table_schema = 'public') THEN ALTER TABLE public.salary_revision_history ENABLE ROW LEVEL SECURITY; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'candidate_notifications' AND table_schema = 'public') THEN ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY; END IF; END $$;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "team_lead_read_team" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON public.profiles;

-- Profiles
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "team_lead_read_team" ON public.profiles
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('team_lead', 'tl')) AND (department = (SELECT department FROM public.profiles WHERE id = auth.uid()) OR team_lead_id = auth.uid() OR id = auth.uid()));
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id AND (role IS NOT DISTINCT FROM (SELECT role FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "admin_update_all_profiles" ON public.profiles
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "admin_insert_profiles" ON public.profiles
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') OR auth.uid() = id);
CREATE POLICY "admin_delete_profiles" ON public.profiles
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Candidates
DROP POLICY IF EXISTS "candidates_select_all" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_all" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_all" ON public.candidates;
CREATE POLICY "candidates_select_all" ON public.candidates FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "candidates_insert_all" ON public.candidates FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "candidates_update_all" ON public.candidates FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Job Forms
DROP POLICY IF EXISTS "job_forms_select_all" ON public.job_forms;
DROP POLICY IF EXISTS "job_forms_insert_update" ON public.job_forms;
CREATE POLICY "job_forms_select_all" ON public.job_forms FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "job_forms_insert_update" ON public.job_forms FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Recruitment Posts
DROP POLICY IF EXISTS "recruitment_posts_select_all" ON public.recruitment_posts;
DROP POLICY IF EXISTS "recruitment_posts_insert_update" ON public.recruitment_posts;
CREATE POLICY "recruitment_posts_select_all" ON public.recruitment_posts FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "recruitment_posts_insert_update" ON public.recruitment_posts FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Job Applications
DROP POLICY IF EXISTS "applications_select_hr" ON public.job_applications;
DROP POLICY IF EXISTS "applications_select_candidate" ON public.job_applications;
DROP POLICY IF EXISTS "applications_insert" ON public.job_applications;
DROP POLICY IF EXISTS "applications_update_hr" ON public.job_applications;
CREATE POLICY "applications_select_hr" ON public.job_applications FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "applications_insert" ON public.job_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "applications_update_hr" ON public.job_applications FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Candidate Applications
DROP POLICY IF EXISTS "candidate_applications_select_hr" ON public.candidate_applications;
DROP POLICY IF EXISTS "candidate_applications_update_hr" ON public.candidate_applications;
CREATE POLICY "candidate_applications_select_hr" ON public.candidate_applications FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "candidate_applications_update_hr" ON public.candidate_applications FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Assessments
DROP POLICY IF EXISTS "assessments_select_hr" ON public.assessments;
DROP POLICY IF EXISTS "assessments_insert_update_hr" ON public.assessments;
CREATE POLICY "assessments_select_hr" ON public.assessments FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "assessments_insert_update_hr" ON public.assessments FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Assessment Tokens
DROP POLICY IF EXISTS "tokens_select_hr" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_select_candidate_own" ON public.assessment_tokens;
DROP POLICY IF EXISTS "tokens_insert_update_hr" ON public.assessment_tokens;
CREATE POLICY "tokens_select_hr" ON public.assessment_tokens FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "tokens_select_candidate_own" ON public.assessment_tokens FOR SELECT USING (candidate_id = auth.uid());
CREATE POLICY "tokens_insert_update_hr" ON public.assessment_tokens FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Interview Sessions
DROP POLICY IF EXISTS "interviews_select_hr" ON public.interview_sessions;
DROP POLICY IF EXISTS "interviews_insert_update_hr" ON public.interview_sessions;
CREATE POLICY "interviews_select_hr" ON public.interview_sessions FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "interviews_insert_update_hr" ON public.interview_sessions FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Work Logs
DROP POLICY IF EXISTS "work_logs_select_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_select_team_lead" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_insert_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_update_own" ON public.work_logs;
CREATE POLICY "work_logs_select_own" ON public.work_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "work_logs_select_team_lead" ON public.work_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('team_lead', 'tl', 'admin', 'hr')) AND user_id IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid() OR department = (SELECT department FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "work_logs_insert_own" ON public.work_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "work_logs_update_own" ON public.work_logs FOR UPDATE USING (user_id = auth.uid());

-- Tasks
DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_team" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_update" ON public.tasks;
CREATE POLICY "tasks_select_own" ON public.tasks FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "tasks_select_team" ON public.tasks FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'team_lead', 'tl')));
CREATE POLICY "tasks_insert_update" ON public.tasks FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'team_lead', 'tl')));

-- Projects
DROP POLICY IF EXISTS "projects_select_all" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_update" ON public.projects;
CREATE POLICY "projects_select_all" ON public.projects FOR SELECT USING (true);
CREATE POLICY "projects_insert_update" ON public.projects FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'team_lead', 'tl')));

-- Leaves
DROP POLICY IF EXISTS "leaves_select_own" ON public.leaves;
DROP POLICY IF EXISTS "leaves_select_admin" ON public.leaves;
DROP POLICY IF EXISTS "leaves_insert_own" ON public.leaves;
DROP POLICY IF EXISTS "leaves_update_admin" ON public.leaves;
CREATE POLICY "leaves_select_own" ON public.leaves FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "leaves_select_admin" ON public.leaves FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'team_lead', 'tl')));
CREATE POLICY "leaves_insert_own" ON public.leaves FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "leaves_update_admin" ON public.leaves FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'team_lead', 'tl')));

-- Complaints
DROP POLICY IF EXISTS "complaints_select_own" ON public.complaints;
DROP POLICY IF EXISTS "complaints_select_admin" ON public.complaints;
DROP POLICY IF EXISTS "complaints_insert" ON public.complaints;
CREATE POLICY "complaints_select_own" ON public.complaints FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "complaints_select_admin" ON public.complaints FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "complaints_insert" ON public.complaints FOR INSERT WITH CHECK (user_id = auth.uid());

-- Notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- Chat Messages
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='recipient_id') THEN
    DROP POLICY IF EXISTS "chat_select_involved" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_insert_own" ON public.chat_messages;
    CREATE POLICY "chat_select_involved" ON public.chat_messages FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());
    CREATE POLICY "chat_insert_own" ON public.chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid());
  END IF;
END $$;

-- Candidate Onboarding
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='candidate_onboarding' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "onboarding_select_hr" ON public.candidate_onboarding;
  CREATE POLICY "onboarding_select_hr" ON public.candidate_onboarding FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
END IF; END $$;

-- Background Verifications
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='background_verifications' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "background_verifications_select_hr" ON public.background_verifications;
  CREATE POLICY "background_verifications_select_hr" ON public.background_verifications FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
END IF; END $$;

-- Payroll Tables (wrapped with table existence checks)
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payroll_ledger' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "payroll_select_hr" ON public.payroll_ledger;
  CREATE POLICY "payroll_select_hr" ON public.payroll_ledger FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payroll_history_records' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "payroll_history_select_own" ON public.payroll_history_records;
  DROP POLICY IF EXISTS "payroll_history_select_hr" ON public.payroll_history_records;
  CREATE POLICY "payroll_history_select_own" ON public.payroll_history_records FOR SELECT USING (employee_id = auth.uid());
  CREATE POLICY "payroll_history_select_hr" ON public.payroll_history_records FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='salary_revision_history' AND table_schema='public') THEN
  DROP POLICY IF EXISTS "salary_revision_select_hr" ON public.salary_revision_history;
  CREATE POLICY "salary_revision_select_hr" ON public.salary_revision_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
END IF; END $$;

-- RLS on new tables
DROP POLICY IF EXISTS "applications_select_hr" ON public.applications;
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
DROP POLICY IF EXISTS "applications_update_hr" ON public.applications;
CREATE POLICY "applications_select_hr" ON public.applications FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "applications_insert" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "applications_update_hr" ON public.applications FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

DROP POLICY IF EXISTS "attempts_select_hr" ON public.assessment_attempts;
DROP POLICY IF EXISTS "attempts_select_own" ON public.assessment_attempts;
CREATE POLICY "attempts_select_hr" ON public.assessment_attempts FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "attempts_select_own" ON public.assessment_attempts FOR SELECT USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "offer_letters_select_hr" ON public.offer_letters;
DROP POLICY IF EXISTS "offer_letters_insert_update_hr" ON public.offer_letters;
CREATE POLICY "offer_letters_select_hr" ON public.offer_letters FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "offer_letters_insert_update_hr" ON public.offer_letters FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

DROP POLICY IF EXISTS "offer_approvals_select" ON public.offer_approvals;
DROP POLICY IF EXISTS "offer_approvals_insert_update" ON public.offer_approvals;
CREATE POLICY "offer_approvals_select" ON public.offer_approvals FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')) OR approver_id = auth.uid());
CREATE POLICY "offer_approvals_insert_update" ON public.offer_approvals FOR ALL USING (approver_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin')));

DROP POLICY IF EXISTS "answers_select_hr" ON public.assessment_answers;
DROP POLICY IF EXISTS "answers_insert_update_hr" ON public.assessment_answers;
CREATE POLICY "answers_select_hr" ON public.assessment_answers FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
CREATE POLICY "answers_insert_update_hr" ON public.assessment_answers FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));
