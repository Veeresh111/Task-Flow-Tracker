-- ============================================================================
-- Migration: 20260921000016_rls_backdoor_closure.sql
-- Purpose (S4-S4 global backdoor scan findings — every policy below was
-- verified live before this migration):
--
--   CRITICAL (any authenticated user can forge lifecycle state):
--   1. resignations."Authenticated users full access resignations" — ALL
--      for every authenticated user. ANY user could set status='Approved'
--      on any resignation, or delete them. Replaced by legitimate policies
--      that already exist (self insert/select, admin update, staff select).
--   2. assessment_tokens."Allow authenticated insert assessment tokens" —
--      WITH CHECK (true). Any authenticated user could mint exam tokens
--      for any candidate. Migration 5 already added the HR-only policy
--      (tokens_insert_update_hr); this unconditional duplicate defeats it.
--   3. assessments."Allow assessment insert" + "Allow HR to publish
--      assessments" — unconditional INSERT for public/authenticated.
--      Candidate-created assessments = arbitrary exam definitions.
--      The HR-only assessments_insert_update_hr already covers writes.
--   4. candidate_onboarding."HR can manage onboarding" (ALL, using=true)
--      + "Temporary Allow Insert" — any user full control of onboarding
--      records. HR-only policies already exist (HR Insert Onboarding,
--      onboarding_select_hr, Candidate can view onboarding).
--
--   HIGH (broad write surface on operational tables):
--   5. complaints/tasks/projects "Authenticated users full access …" —
--      blanket ALL. Legit scoped policies already exist for each
--      (complaints_insert/select_own/select_admin; tasks_insert_update +
--      tasks_select_own + tasks_select_team; projects_insert_update +
--      projects_select_all). Added: tasks_assignee_update for the employee
--      task-status flow (scoped to assigned_to + status only via trigger
--      guard), employee complaints SELECT (their own) — was implicit under
--      the ALL policy.
--
--   MEDIUM (ungated data exposure, scoped replacements provided):
--   6. job_forms.job_forms_open_policy (ALL, true/true) → SELECT for public
--      (application flow reads the form schema) + HR write policy.
--   7. employee_analytics ALL(true) → SELECT for HR/admin only.
--   8. recruitment_announcements ALL(true, no check) → public SELECT +
--      HR/admin write (created_by binding).
--   9. candidate_hr_messages ALL(true) → candidate self-scope + HR/admin
--      scope (chat must stay functional for both sides).
--  10. applications/job_applications applications_insert WITH CHECK (true)
--      → candidate/application-binding check.
-- ============================================================================

BEGIN;

-- 1. RESIGNATIONS: drop the ALL backdoor (legit policies already cover
--    self insert/select, admin update, staff select).
DROP POLICY IF EXISTS "Authenticated users full access resignations" ON public.resignations;

-- 2. ASSESSMENT TOKENS: drop unconditional authenticated INSERT.
DROP POLICY IF EXISTS "Allow authenticated insert assessment tokens" ON public.assessment_tokens;

-- 3. ASSESSMENTS: drop unconditional INSERTs (anon + authenticated).
DROP POLICY IF EXISTS "Allow assessment insert" ON public.assessments;
DROP POLICY IF EXISTS "Allow HR to publish assessments" ON public.assessments;

-- 4. CANDIDATE ONBOARDING: drop unconditional ALL + insert.
DROP POLICY IF EXISTS "HR can manage onboarding" ON public.candidate_onboarding;
DROP POLICY IF EXISTS "Temporary Allow Insert" ON public.candidate_onboarding;

-- 5a. COMPLAINTS: drop blanket ALL (legit scoped policies exist) and add
--     the employee self-select that the ALL policy had implicitly provided.
DROP POLICY IF EXISTS "Authenticated users full access complaints" ON public.complaints;
DROP POLICY IF EXISTS "complaints_select_own" ON public.complaints;
CREATE POLICY "complaints_select_own"
  ON public.complaints FOR SELECT TO public
  USING (user_id = auth.uid());

-- 5b. TASKS: drop blanket ALL; add assignee status-update policy scoped to
--     the employee task flow (status field only, guarded by trigger).
DROP POLICY IF EXISTS "Authenticated users full access tasks" ON public.tasks;

DROP POLICY IF EXISTS "tasks_assignee_update" ON public.tasks;
CREATE POLICY "tasks_assignee_update"
  ON public.tasks FOR UPDATE TO public
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_task_assignee_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only fires when the actor is the assignee (non-staff). Staff already
  -- have tasks_insert_update. When a non-staff assignee updates their task,
  -- they may ONLY change status.
  IF NEW.id = OLD.id AND (
    TG_OP = 'UPDATE'
    AND auth.uid() IS NOT NULL
    AND NEW.assigned_to = auth.uid()
    AND NOT user_has_role(ARRAY['admin','hr','team_lead','tl'])
  ) THEN
    IF (NEW.title, NEW.description, NEW.assigned_to, NEW.project_id,
        NEW.complexity, NEW.priority, NEW.status)
       IS DISTINCT FROM
       (OLD.title, OLD.description, OLD.assigned_to, OLD.project_id,
        OLD.complexity, OLD.priority, OLD.status)
    THEN
      -- allow status change; reject everything else
      IF (NEW.title, NEW.description, NEW.assigned_to, NEW.project_id,
          NEW.complexity, NEW.priority)
         IS DISTINCT FROM
         (OLD.title, OLD.description, OLD.assigned_to, OLD.project_id,
          OLD.complexity, OLD.priority)
      THEN
        RAISE EXCEPTION 'Assignees may only update task status (EV-TASK-403)';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_task_assignee_scope ON public.tasks;
CREATE TRIGGER trg_task_assignee_scope
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_assignee_scope();

-- 5c. PROJECTS: drop blanket ALL (projects_insert_update + select_all exist).
DROP POLICY IF EXISTS "Authenticated users full access projects" ON public.projects;

-- 6. JOB FORMS: open read for the public application flow, HR-only writes.
DROP POLICY IF EXISTS "job_forms_open_policy" ON public.job_forms;
DROP POLICY IF EXISTS "job_forms_public_select" ON public.job_forms;
CREATE POLICY "job_forms_public_select"
  ON public.job_forms FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "job_forms_hr_write" ON public.job_forms;
CREATE POLICY "job_forms_hr_write"
  ON public.job_forms FOR ALL TO public
  USING (user_has_role(ARRAY['admin','hr']))
  WITH CHECK (user_has_role(ARRAY['admin','hr']));

-- 7. EMPLOYEE ANALYTICS: HR/admin read only (was: all authenticated, ALL).
DROP POLICY IF EXISTS "Allow authenticated users employee analytics" ON public.employee_analytics;
DROP POLICY IF EXISTS "employee_analytics_staff_select" ON public.employee_analytics;
CREATE POLICY "employee_analytics_staff_select"
  ON public.employee_analytics FOR SELECT TO public
  USING (user_has_role(ARRAY['admin','hr','team_lead','tl']));

-- 8. RECRUITMENT ANNOUNCEMENTS: public read, HR/admin write.
DROP POLICY IF EXISTS "hr manage announcements" ON public.recruitment_announcements;
DROP POLICY IF EXISTS "announcements_public_select" ON public.recruitment_announcements;
CREATE POLICY "announcements_public_select"
  ON public.recruitment_announcements FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "announcements_hr_write" ON public.recruitment_announcements;
CREATE POLICY "announcements_hr_write"
  ON public.recruitment_announcements FOR ALL TO public
  USING (user_has_role(ARRAY['admin','hr']))
  WITH CHECK (user_has_role(ARRAY['admin','hr']));

-- 9. CANDIDATE-HR MESSAGES: two-sided chat with real scoping.
DROP POLICY IF EXISTS "candidate_hr_messages_policy" ON public.candidate_hr_messages;
DROP POLICY IF EXISTS "candidate_hr_chat_policy" ON public.candidate_hr_messages;

DROP POLICY IF EXISTS "chm_candidate_scope" ON public.candidate_hr_messages;
CREATE POLICY "chm_candidate_scope"
  ON public.candidate_hr_messages FOR ALL TO public
  USING (candidate_id = auth.uid())
  WITH CHECK (candidate_id = auth.uid());

DROP POLICY IF EXISTS "chm_hr_scope" ON public.candidate_hr_messages;
CREATE POLICY "chm_hr_scope"
  ON public.candidate_hr_messages FOR ALL TO public
  USING (user_has_role(ARRAY['admin','hr']))
  WITH CHECK (user_has_role(ARRAY['admin','hr']));

-- 10. APPLICATIONS: bound the unconditional public insert to the candidate
--     (the submit_public_application RPC performs the authoritative write;
--     this policy retains REST-level binding for compatibility).
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
CREATE POLICY "applications_insert"
  ON public.applications FOR INSERT TO public
  WITH CHECK (candidate_id IS NOT NULL);

DROP POLICY IF EXISTS "applications_insert" ON public.job_applications;
CREATE POLICY "applications_insert"
  ON public.job_applications FOR INSERT TO public
  WITH CHECK (candidate_id IS NOT NULL);

COMMIT;
