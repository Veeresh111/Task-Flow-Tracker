-- Phase 5: Missing columns, indexes, CHECK constraints, cascade deletes, and automation
-- This migration fixes ALL schema gaps identified during Phase 5 audit

-- ============================================================================
-- PART 1: MISSING COLUMNS
-- ============================================================================

-- 1.1: assessment_tokens.used — frontend filters by `used: false` everywhere
ALTER TABLE public.assessment_tokens
  ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT false;

-- 1.2: profiles — columns referenced by multiple HR/payroll pages
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS payroll_ctc DECIMAL,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- 1.3: candidates — columns inserted/updated by JobApplication.tsx
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resume_url TEXT,
  ADD COLUMN IF NOT EXISTS ats_score DECIMAL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'Pending';

-- 1.4: job_forms — form_schema used by custom form builder
ALTER TABLE public.job_forms
  ADD COLUMN IF NOT EXISTS form_schema JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- PART 2: INDEXES ON FOREIGN KEY COLUMNS
-- ============================================================================

-- Recruitment indexes
CREATE INDEX IF NOT EXISTS idx_assessment_tokens_candidate_id ON public.assessment_tokens (candidate_id);
CREATE INDEX IF NOT EXISTS idx_assessment_tokens_assessment_id ON public.assessment_tokens (assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_tokens_application_id ON public.assessment_tokens (application_id);
CREATE INDEX IF NOT EXISTS idx_assessment_tokens_token ON public.assessment_tokens (token);
CREATE INDEX IF NOT EXISTS idx_assessment_tokens_status ON public.assessment_tokens (status);
CREATE INDEX IF NOT EXISTS idx_offer_letters_application_id ON public.offer_letters (application_id);
CREATE INDEX IF NOT EXISTS idx_offer_letters_candidate_id ON public.offer_letters (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notifications_candidate_id ON public.candidate_notifications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_hr_messages_candidate_id ON public.candidate_hr_messages (candidate_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_application_id ON public.interview_sessions (application_id);
CREATE INDEX IF NOT EXISTS idx_background_verifications_candidate_id ON public.background_verifications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_onboarding_candidate_id ON public.candidate_onboarding (candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_candidate_id ON public.job_applications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_form_id ON public.job_applications (form_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_candidate_form ON public.job_applications (candidate_id, form_id);

-- HR/employee indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user_id ON public.leaves (user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON public.complaints (user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_user_id ON public.work_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages (receiver_id);

-- Email lookup indexes (used by SmartInbox, ApplyForm, etc.)
CREATE INDEX IF NOT EXISTS idx_candidates_email ON public.candidates (email);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- ============================================================================
-- PART 3: CHECK CONSTRAINTS ON STATUS COLUMNS
-- ============================================================================

DO $$
BEGIN
  -- assessment_tokens.status
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assessment_tokens' AND column_name='status') THEN
    ALTER TABLE public.assessment_tokens DROP CONSTRAINT IF EXISTS chk_assessment_tokens_status;
    ALTER TABLE public.assessment_tokens ADD CONSTRAINT chk_assessment_tokens_status CHECK (status IN ('Active', 'Used', 'Expired', 'Disqualified'));
  END IF;

  -- interview_sessions.status
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='interview_sessions' AND column_name='status') THEN
    ALTER TABLE public.interview_sessions DROP CONSTRAINT IF EXISTS chk_interview_sessions_status;
    ALTER TABLE public.interview_sessions ADD CONSTRAINT chk_interview_sessions_status CHECK (status IN ('Scheduled', 'Completed', 'Cancelled', 'No Show'));
  END IF;

  -- tasks.status
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='status') THEN
    ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS chk_tasks_status;
    ALTER TABLE public.tasks ADD CONSTRAINT chk_tasks_status CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed', 'Pending', 'In Progress', 'Completed'));
  END IF;

  -- complaints.status
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='complaints' AND column_name='status') THEN
    ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS chk_complaints_status;
    ALTER TABLE public.complaints ADD CONSTRAINT chk_complaints_status CHECK (status IN ('Open', 'Escalated', 'Resolved', 'Closed'));
  END IF;

  -- background_verifications.status
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='background_verifications' AND column_name='status') THEN
    ALTER TABLE public.background_verifications DROP CONSTRAINT IF EXISTS chk_bgv_status;
    ALTER TABLE public.background_verifications ADD CONSTRAINT chk_bgv_status CHECK (status IN ('Submitted', 'Pending', 'Verified', 'Failed', 'In Progress'));
  END IF;
END $$;

-- ============================================================================
-- PART 4: CASCADE DELETES ON FOREIGN KEYS
-- ============================================================================

DO $$
BEGIN
  -- assessment_tokens -> assessments
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assessment_tokens_assessments' AND table_schema = 'public') THEN
    ALTER TABLE public.assessment_tokens DROP CONSTRAINT fk_assessment_tokens_assessments;
    ALTER TABLE public.assessment_tokens ADD CONSTRAINT fk_assessment_tokens_assessments FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;
  END IF;

  -- assessment_tokens -> job_applications
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assessment_tokens_applications' AND table_schema = 'public') THEN
    ALTER TABLE public.assessment_tokens DROP CONSTRAINT fk_assessment_tokens_applications;
    ALTER TABLE public.assessment_tokens ADD CONSTRAINT fk_assessment_tokens_applications FOREIGN KEY (application_id) REFERENCES public.job_applications(id) ON DELETE CASCADE;
  END IF;

  -- job_applications -> candidates
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_job_applications_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.job_applications DROP CONSTRAINT fk_job_applications_candidate;
  END IF;
  ALTER TABLE public.job_applications ADD CONSTRAINT fk_job_applications_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

  -- interview_sessions -> job_applications
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_interview_sessions_application' AND table_schema = 'public') THEN
    ALTER TABLE public.interview_sessions DROP CONSTRAINT fk_interview_sessions_application;
  END IF;
  ALTER TABLE public.interview_sessions ADD CONSTRAINT fk_interview_sessions_application FOREIGN KEY (application_id) REFERENCES public.job_applications(id) ON DELETE CASCADE;

  -- offer_letters -> job_applications
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_offer_letters_application' AND table_schema = 'public') THEN
    ALTER TABLE public.offer_letters DROP CONSTRAINT fk_offer_letters_application;
  END IF;
  ALTER TABLE public.offer_letters ADD CONSTRAINT fk_offer_letters_application FOREIGN KEY (application_id) REFERENCES public.job_applications(id) ON DELETE CASCADE;

  -- offer_letters -> candidates
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_offer_letters_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.offer_letters DROP CONSTRAINT fk_offer_letters_candidate;
  END IF;
  ALTER TABLE public.offer_letters ADD CONSTRAINT fk_offer_letters_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

  -- offer_approvals -> offer_letters
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_offer_approvals_offer' AND table_schema = 'public') THEN
    ALTER TABLE public.offer_approvals DROP CONSTRAINT fk_offer_approvals_offer;
  END IF;
  ALTER TABLE public.offer_approvals ADD CONSTRAINT fk_offer_approvals_offer FOREIGN KEY (offer_id) REFERENCES public.offer_letters(id) ON DELETE CASCADE;

  -- candidate_notifications -> candidates
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_candidate_notifications_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.candidate_notifications DROP CONSTRAINT fk_candidate_notifications_candidate;
  END IF;
  ALTER TABLE public.candidate_notifications ADD CONSTRAINT fk_candidate_notifications_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

  -- candidate_hr_messages -> candidates
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_candidate_hr_messages_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.candidate_hr_messages DROP CONSTRAINT fk_candidate_hr_messages_candidate;
  END IF;
  ALTER TABLE public.candidate_hr_messages ADD CONSTRAINT fk_candidate_hr_messages_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

  -- background_verifications -> candidates
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_background_verifications_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.background_verifications DROP CONSTRAINT fk_background_verifications_candidate;
  END IF;
  ALTER TABLE public.background_verifications ADD CONSTRAINT fk_background_verifications_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

  -- candidate_onboarding -> candidates
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_candidate_onboarding_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.candidate_onboarding DROP CONSTRAINT fk_candidate_onboarding_candidate;
  END IF;
  ALTER TABLE public.candidate_onboarding ADD CONSTRAINT fk_candidate_onboarding_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;
END $$;

-- ============================================================================
-- PART 5: ADDITIONAL AUTOMATION TRIGGERS
-- ============================================================================

-- 5.1: Auto-create offer_approvals rows when an offer_letter is inserted
CREATE OR REPLACE FUNCTION public.init_offer_approvals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.offer_approvals (offer_id, approver_id, approval_order, status, created_at)
  VALUES (NEW.id, NEW.created_by, 1, 'Pending', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_letters_init_approvals ON public.offer_letters;
CREATE TRIGGER trg_offer_letters_init_approvals
  AFTER INSERT ON public.offer_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.init_offer_approvals();

-- 5.2: Sync job_applications status when offer_letter is accepted/declined
CREATE OR REPLACE FUNCTION public.sync_job_app_from_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Accepted' AND OLD.status IS DISTINCT FROM 'Accepted' THEN
    UPDATE public.job_applications SET status = 'Offer Accepted' WHERE id = NEW.application_id;
  ELSIF NEW.status = 'Declined' AND OLD.status IS DISTINCT FROM 'Declined' THEN
    UPDATE public.job_applications SET status = 'Offer Declined' WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_letters_sync_job_app ON public.offer_letters;
CREATE TRIGGER trg_offer_letters_sync_job_app
  AFTER UPDATE OF status ON public.offer_letters
  FOR EACH ROW
  WHEN (NEW.status IN ('Accepted', 'Declined'))
  EXECUTE FUNCTION public.sync_job_app_from_offer();

-- 5.3: Sync job_applications status when interview is scheduled
CREATE OR REPLACE FUNCTION public.sync_job_app_from_interview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.job_applications
  SET status = 'Interview Scheduled', interview_status = 'Scheduled'
  WHERE id = NEW.application_id
  AND status NOT IN ('Interview Cleared', 'Offer Generated', 'Offer Accepted', 'Offer Declined', 'Rejected');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interviews_sync_job_app ON public.interview_sessions;
CREATE TRIGGER trg_interviews_sync_job_app
  AFTER INSERT ON public.interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_app_from_interview();

-- 5.4: Auto-assign "Assessment Assigned" status when assessment token is created
CREATE OR REPLACE FUNCTION public.sync_job_app_from_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.job_applications
  SET status = 'Assessment Assigned'
  WHERE id = NEW.application_id
  AND status NOT IN ('Assessment Completed', 'Interview Scheduled', 'Interview Cleared', 'Offer Generated', 'Offer Accepted', 'Offer Declined', 'Rejected');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tokens_sync_job_app ON public.assessment_tokens;
CREATE TRIGGER trg_tokens_sync_job_app
  AFTER INSERT ON public.assessment_tokens
  FOR EACH ROW
  WHEN (NEW.application_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_job_app_from_token();
