-- Phase 4: RLS Fixes + Automation Triggers
-- Fixes all candidate-facing RLS gaps and adds maximum database automation

-- ============================================================================
-- PART 1: FIX CANDIDATE RLS POLICIES
-- ============================================================================

-- 1.1: candidate_notifications — RLS enabled but ZERO policies existed
-- Candidates must be able to see and update their own notifications
CREATE POLICY "candidate_notifications_select_own"
  ON public.candidate_notifications
  FOR SELECT
  USING (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );

CREATE POLICY "candidate_notifications_update_own"
  ON public.candidate_notifications
  FOR UPDATE
  USING (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );

-- 1.2: candidate_hr_messages — RLS never enabled, no policies
ALTER TABLE public.candidate_hr_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate_hr_messages_select_candidate"
  ON public.candidate_hr_messages
  FOR SELECT
  USING (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );

CREATE POLICY "candidate_hr_messages_insert_candidate"
  ON public.candidate_hr_messages
  FOR INSERT
  WITH CHECK (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );

CREATE POLICY "candidate_hr_messages_insert_hr"
  ON public.candidate_hr_messages
  FOR INSERT
  WITH CHECK (public.user_has_role(ARRAY['admin', 'hr']));

-- 1.3: job_forms — add public SELECT for Open jobs (candidates can view)
CREATE POLICY "job_forms_select_public"
  ON public.job_forms
  FOR SELECT
  USING (status = 'Open');

-- 1.4: assessments — candidates can see assessments assigned to them via tokens
CREATE POLICY "assessments_select_candidate"
  ON public.assessments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_tokens at
      JOIN public.job_applications ja ON ja.id = at.application_id
      WHERE at.assessment_id = assessments.id
      AND (
        ja.candidate_id = auth.uid()
        OR ja.candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
      )
    )
  );

-- 1.5: background_verifications — candidates can see their own submitted docs
CREATE POLICY "background_verifications_select_candidate"
  ON public.background_verifications
  FOR SELECT
  USING (candidate_id = auth.uid());

CREATE POLICY "background_verifications_insert_candidate"
  ON public.background_verifications
  FOR INSERT
  WITH CHECK (candidate_id = auth.uid());

-- 1.6: candidate_onboarding — candidates can see their own onboarding
CREATE POLICY "candidate_onboarding_select_candidate"
  ON public.candidate_onboarding
  FOR SELECT
  USING (candidate_id = auth.uid());

-- 1.7: interview_sessions — candidates can see their own interview sessions
CREATE POLICY "interviews_select_candidate"
  ON public.interview_sessions
  FOR SELECT
  USING (
    application_id IN (
      SELECT id FROM public.job_applications
      WHERE candidate_id = auth.uid()
      OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
    )
  );

-- 1.8: offer_letters — candidates can see their own offer letters
CREATE POLICY "offer_letters_select_candidate"
  ON public.offer_letters
  FOR SELECT
  USING (
    candidate_id = auth.uid()
    OR application_id IN (
      SELECT id FROM public.job_applications
      WHERE candidate_id = auth.uid()
      OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
    )
  );

-- 1.9: candidates — allow public INSERT for self-registration during job application
CREATE POLICY "candidates_insert_public"
  ON public.candidates
  FOR INSERT
  WITH CHECK (true);

-- 1.10: assessment_tokens — add UPDATE policy for candidates submitting assessments
CREATE POLICY "tokens_update_candidate_own"
  ON public.assessment_tokens
  FOR UPDATE
  USING (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );

-- ============================================================================
-- PART 2: AUTOMATION TRIGGERS
-- ============================================================================

-- 2.1: Sync job_applications.status → candidates.stage automatically
-- Eliminates the manual .update({ stage }) calls in JobApplication.tsx
CREATE OR REPLACE FUNCTION public.sync_candidate_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.candidates
  SET stage = NEW.status
  WHERE id = NEW.candidate_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_applications_sync_stage
  AFTER UPDATE OF status ON public.job_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_candidate_stage();

-- 2.2: Extend status notification trigger to cover all common pipeline transitions
-- Previously only fired for Rejected/Onboarding/Offer Generated
CREATE OR REPLACE FUNCTION public.notify_candidate_on_application_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_candidate_id UUID; v_job_title TEXT; v_notif_title TEXT; v_notif_msg TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Rejected', 'Onboarding', 'Offer Generated', 'Assessment Completed', 'Shortlisted', 'Interview Scheduled', 'Offer Accepted') THEN
    SELECT jf.job_title INTO v_job_title FROM public.job_forms jf WHERE jf.id = NEW.form_id;
    v_candidate_id := NEW.candidate_id;
    CASE NEW.status
      WHEN 'Rejected' THEN
        v_notif_title := 'Application Status Update';
        v_notif_msg := 'After careful evaluation, we have decided to move forward with other candidates.';
      WHEN 'Offer Generated' THEN
        v_notif_title := 'Offer Letter Generated';
        v_notif_msg := 'Congratulations! Your offer letter has been generated.';
      WHEN 'Onboarding' THEN
        v_notif_title := 'Onboarding Initiated';
        v_notif_msg := 'Welcome aboard! Your onboarding has been initiated.';
      WHEN 'Assessment Completed' THEN
        v_notif_title := 'Assessment Completed';
        v_notif_msg := 'Your assessment has been evaluated. Check your dashboard for results.';
      WHEN 'Shortlisted' THEN
        v_notif_title := 'Application Shortlisted';
        v_notif_msg := 'Congratulations! You have been shortlisted for the next stage.';
      WHEN 'Interview Scheduled' THEN
        v_notif_title := 'Interview Scheduled';
        v_notif_msg := 'An interview has been scheduled for your application.';
      WHEN 'Offer Accepted' THEN
        v_notif_title := 'Offer Accepted';
        v_notif_msg := 'You have accepted the offer. Welcome to the team!';
      ELSE
        v_notif_title := 'Application Updated';
        v_notif_msg := 'Your application status has been updated to: ' || NEW.status;
    END CASE;
    IF v_candidate_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
        VALUES (v_candidate_id, v_notif_title, v_notif_msg, false);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trg_job_application_notify ON public.job_applications;
CREATE TRIGGER trg_job_application_notify
  AFTER UPDATE OF status ON public.job_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Rejected', 'Onboarding', 'Offer Generated', 'Assessment Completed', 'Shortlisted', 'Interview Scheduled', 'Offer Accepted'))
  EXECUTE FUNCTION public.notify_candidate_on_application_status();

-- 2.3: Auto-create candidate_onboarding record when a candidate is created
CREATE OR REPLACE FUNCTION public.init_candidate_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.candidate_onboarding (candidate_id, stage, status)
  VALUES (NEW.id, 'pending', 'not_started')
  ON CONFLICT (candidate_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_candidates_init_onboarding
  AFTER INSERT ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.init_candidate_onboarding();

-- 2.4: Auto-expire assessment tokens function (callable via pg_cron or scheduled edge function)
CREATE OR REPLACE FUNCTION public.auto_expire_assessment_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.assessment_tokens
  SET status = 'Expired'
  WHERE status = 'Active' AND expires_at IS NOT NULL AND expires_at < now();
END;
$$;

-- ============================================================================
-- PART 3: ADD MISSING COLUMNS FOR OFFER LETTER FETCHING
-- ============================================================================

-- Ensure offer_letters has application_id populated for candidate-facing queries
-- This is needed so candidates can find their offers via job_applications

-- ============================================================================
-- PART 4: ASSESSMENT_ATTEMPTS INSERT POLICY FOR CANDIDATES
-- ============================================================================

CREATE POLICY "attempts_insert_candidate"
  ON public.assessment_attempts
  FOR INSERT
  WITH CHECK (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );

CREATE POLICY "attempts_update_candidate_own"
  ON public.assessment_attempts
  FOR UPDATE
  USING (
    candidate_id = auth.uid()
    OR candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid() AND candidate_id IS NOT NULL)
  );
