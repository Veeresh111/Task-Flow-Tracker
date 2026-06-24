-- =============================================================================
-- Phase 6: Missing Tables, Columns, Indexes, CHECK Constraints, Cascade Deletes
-- =============================================================================

-- 1. MISSING COLUMNS ON candidates TABLE
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS recommendation TEXT;

-- 2. MISSING COLUMNS ON profiles TABLE
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS performance_score NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS join_date TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_career_prediction JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS core_skills TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education_details JSONB;

-- 3. MISSING COLUMNS ON background_verifications TABLE
ALTER TABLE background_verifications ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'Pending';

-- 4. MISSING COLUMNS ON offer_letters TABLE (job_form_id FK)
ALTER TABLE offer_letters ADD COLUMN IF NOT EXISTS job_form_id UUID REFERENCES job_forms(id) ON DELETE SET NULL;

-- 5. CREATE MISSING TABLES
-- 5a. resignations
CREATE TABLE IF NOT EXISTS resignations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  expected_last_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE resignations ENABLE ROW LEVEL SECURITY;
CREATE POLICY resignations_select_own ON resignations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY resignations_insert_own ON resignations FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY resignations_update_own ON resignations FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY resignations_select_all_admin ON resignations FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);
CREATE POLICY resignations_update_all_admin ON resignations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

-- 5b. company_announcements
CREATE TABLE IF NOT EXISTS company_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'General',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE company_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_announcements_select_all ON company_announcements FOR SELECT USING (true);
CREATE POLICY company_announcements_insert_admin ON company_announcements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

-- 5c. recruitment_announcements
CREATE TABLE IF NOT EXISTS recruitment_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT,
  apply_link TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE recruitment_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY recruitment_announcements_select_all ON recruitment_announcements FOR SELECT USING (true);
CREATE POLICY recruitment_announcements_insert_hr ON recruitment_announcements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

-- 5d. employee_attrition
CREATE TABLE IF NOT EXISTS employee_attrition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  exit_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_attrition ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_attrition_select_admin ON employee_attrition FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);
CREATE POLICY employee_attrition_insert_admin ON employee_attrition FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

-- 5e. reports (analytics reports)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_select_admin ON reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);
CREATE POLICY reports_insert_admin ON reports FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

-- 5f. Analytics view tables (for admin/Analytics.tsx)
CREATE TABLE IF NOT EXISTS hiring_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT,
  value NUMERIC,
  period TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE hiring_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY hiring_stats_select_admin ON hiring_stats FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

CREATE TABLE IF NOT EXISTS pipeline_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage TEXT,
  count NUMERIC,
  period TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pipeline_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY pipeline_stats_select_admin ON pipeline_stats FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

CREATE TABLE IF NOT EXISTS weekly_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE,
  present_count NUMERIC,
  absent_count NUMERIC,
  total_employees NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE weekly_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY weekly_attendance_select_admin ON weekly_attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

CREATE TABLE IF NOT EXISTS performance_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT,
  avg_score NUMERIC,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE performance_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY performance_trends_select_admin ON performance_trends FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

CREATE TABLE IF NOT EXISTS executive_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT,
  metric_value NUMERIC,
  period TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE executive_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY executive_metrics_select_admin ON executive_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR'))
);

-- 6. ADDITIONAL INDEXES (beyond Phase 5)
CREATE INDEX IF NOT EXISTS idx_profiles_team_lead_id ON profiles(team_lead_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department);
CREATE INDEX IF NOT EXISTS idx_resignations_user_id ON resignations(user_id);
CREATE INDEX IF NOT EXISTS idx_resignations_status ON resignations(status);
CREATE INDEX IF NOT EXISTS idx_company_announcements_created_at ON company_announcements(created_at DESC);

-- 7. ADDITIONAL CHECK CONSTRAINTS
-- work_logs.status
ALTER TABLE work_logs DROP CONSTRAINT IF EXISTS chk_work_logs_status;
ALTER TABLE work_logs ADD CONSTRAINT chk_work_logs_status CHECK (status IN ('Active', 'Completed'));

-- candidates.verification_status
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS chk_candidates_verification_status;
ALTER TABLE candidates ADD CONSTRAINT chk_candidates_verification_status CHECK (verification_status IN ('Pending', 'Verified', 'Failed', 'In Progress'));

-- job_forms.status
ALTER TABLE job_forms DROP CONSTRAINT IF EXISTS chk_job_forms_status;
ALTER TABLE job_forms ADD CONSTRAINT chk_job_forms_status CHECK (status IN ('Draft', 'Published', 'Open', 'Closed', 'Archived', 'Expired'));

-- leaves.status
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS chk_leaves_status;
ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status CHECK (status IN ('Pending', 'Approved', 'Rejected'));

-- 8. ADDITIONAL CASCADE DELETES
-- notifications
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- work_logs
ALTER TABLE work_logs DROP CONSTRAINT IF EXISTS work_logs_user_id_fkey;
ALTER TABLE work_logs ADD CONSTRAINT work_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- tasks
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE CASCADE;

-- leaves
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_user_id_fkey;
ALTER TABLE leaves ADD CONSTRAINT leaves_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- complaints
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_user_id_fkey;
ALTER TABLE complaints ADD CONSTRAINT complaints_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- job_applications.form_id
ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS job_applications_form_id_fkey;
ALTER TABLE job_applications ADD CONSTRAINT job_applications_form_id_fkey FOREIGN KEY (form_id) REFERENCES job_forms(id) ON DELETE SET NULL;

-- interview_sessions.interviewer_id
ALTER TABLE interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_interviewer_id_fkey;
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_interviewer_id_fkey FOREIGN KEY (interviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 9. AUTOMATION TRIGGERS
-- Auto-create notification when task is assigned
CREATE OR REPLACE FUNCTION notify_on_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> OLD.assigned_to THEN
    INSERT INTO notifications (user_id, title, message, is_read)
    VALUES (NEW.assigned_to, 'New Task Assigned', 'You have been assigned: ' || NEW.title, false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_task_assigned ON tasks;
CREATE TRIGGER trg_notify_on_task_assigned
  AFTER UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_task_assigned();

-- Auto-create notification on task INSERT with assigned_to
CREATE OR REPLACE FUNCTION notify_on_task_inserted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, is_read)
    VALUES (NEW.assigned_to, 'New Task', 'You have been assigned: ' || NEW.title, false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_task_inserted ON tasks;
CREATE TRIGGER trg_notify_on_task_inserted
  AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_task_inserted();

-- Auto-notify on leave status change
CREATE OR REPLACE FUNCTION notify_on_leave_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO notifications (user_id, title, message, is_read)
    VALUES (NEW.user_id, 'Leave ' || NEW.status, 'Your leave request has been ' || LOWER(NEW.status) || '.', false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_leave_status_change ON leaves;
CREATE TRIGGER trg_notify_on_leave_status_change
  AFTER UPDATE OF status ON leaves
  FOR EACH ROW EXECUTE FUNCTION notify_on_leave_status_change();

-- Auto-update job_forms to Expired when expires_at passes
CREATE OR REPLACE FUNCTION auto_expire_job_forms()
RETURNS void AS $$
BEGIN
  UPDATE job_forms
  SET status = 'Expired'
  WHERE status IN ('Published', 'Open')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a convenience function to get resolve_candidate_id in RLS (centralized lookup)
CREATE OR REPLACE FUNCTION resolve_candidate_id(auth_uid UUID)
RETURNS UUID AS $$
DECLARE
  result UUID;
BEGIN
  SELECT candidate_id INTO result FROM profiles WHERE id = auth_uid AND candidate_id IS NOT NULL;
  RETURN COALESCE(result, auth_uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. FIX RLS POLICY that references non-existent c.profile_id
-- Drop the bad policy from cleanup migration and recreate it
DROP POLICY IF EXISTS "candidate_applications_select" ON candidate_applications;
CREATE POLICY "candidate_applications_select" ON candidate_applications FOR SELECT USING (
  candidate_id = auth.uid() OR candidate_id = resolve_candidate_id(auth.uid())
);

-- 11. Add UPDATE/DELETE policies for candidate_hr_messages
DROP POLICY IF EXISTS "candidate_hr_messages_update" ON candidate_hr_messages;
CREATE POLICY "candidate_hr_messages_update" ON candidate_hr_messages FOR UPDATE USING (
  candidate_id = auth.uid() OR candidate_id = resolve_candidate_id(auth.uid())
);

-- 12. Add candidate UPDATE policy for background_verifications
DROP POLICY IF EXISTS "background_verifications_update" ON background_verifications;
CREATE POLICY "background_verifications_update" ON background_verifications FOR UPDATE USING (
  candidate_id = auth.uid() OR candidate_id = resolve_candidate_id(auth.uid())
);

-- 13. Restrict projects SELECT to admin/hr/team_lead only
DROP POLICY IF EXISTS "projects_select_all" ON projects;
DROP POLICY IF EXISTS "projects_select_all_admin_hr" ON projects;
CREATE POLICY "projects_select_all" ON projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'HR', 'TEAM_LEAD')
  )
);

-- 14. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS resignations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS company_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS recruitment_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS employee_attrition;
