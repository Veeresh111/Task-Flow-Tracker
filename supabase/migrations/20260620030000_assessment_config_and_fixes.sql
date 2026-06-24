-- ============================================================
-- PHASE 1.5: Assessment configuration & notification dedup
-- - Add max_violations to assessments (configurable per-exam)
-- - Update interview notification trigger with richer messaging
-- - Remove redundant trg_job_application_notify to fix double-notify
--   (ApplicationHub + trigger both fire for same status change)
-- ============================================================

-- ============================================================
-- B1. ADD max_violations TO assessments
--     Allows HR to configure threshold per assessment
--     Default 5 (matches AssessmentAccess existing behavior)
-- ============================================================
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS max_violations INTEGER DEFAULT 5;

-- ============================================================
-- B2. UPDATE notify_on_interview_scheduled to include richer
--     notification message (meeting link, round name)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_interview_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
  v_job_title TEXT;
  v_round_name TEXT;
  v_meeting_link TEXT;
  v_meeting_time TEXT;
BEGIN
  -- Try job_applications first (new), fall back to candidate_applications (legacy)
  SELECT ja.candidate_id, jf.job_title
  INTO v_candidate_id, v_job_title
  FROM public.job_applications ja
  LEFT JOIN public.job_forms jf ON ja.form_id = jf.id
  WHERE ja.id = NEW.application_id;

  IF v_candidate_id IS NULL THEN
    SELECT ca.candidate_id, jf.job_title
    INTO v_candidate_id, v_job_title
    FROM public.candidate_applications ca
    LEFT JOIN public.job_forms jf ON ca.job_form_id = jf.id
    WHERE ca.id = NEW.application_id;
  END IF;

  v_round_name := COALESCE(NEW.round_name, 'Technical Round');
  v_meeting_link := COALESCE(NEW.meeting_link, 'TBD');
  v_meeting_time := COALESCE(to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'Mon DD, YYYY HH24:MI'), 'TBD');

  IF v_candidate_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
      VALUES (
        v_candidate_id,
        'Interview Requisition Scheduled',
        'Your live proctored evaluation session for role [' || COALESCE(v_job_title, 'Unknown Position') || '] has been scheduled on ' || v_meeting_time || '. Access Link: ' || v_meeting_link,
        false
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- B3. UPDATE trg_job_application_notify to be smarter about
--     deduplication — only fire for specific status transitions
--     that client code does NOT already handle
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_candidate_on_application_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
  v_job_title TEXT;
  v_notif_title TEXT;
  v_notif_msg TEXT;
BEGIN
  -- Only notify for terminal/important transitions, not every status change
  -- (Client code handles most status transitions with richer messages)
  IF NEW.status IN ('Rejected', 'Onboarding', 'Offer Generated') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT jf.job_title
    INTO v_job_title
    FROM public.job_forms jf
    WHERE jf.id = NEW.form_id;

    v_candidate_id := NEW.candidate_id;

    IF NEW.status = 'Rejected' THEN
      v_notif_title := 'Application Status Update';
      v_notif_msg := 'Thank you for your interest in the ' || COALESCE(v_job_title, 'position') || ' role. After careful evaluation, we have decided to move forward with other candidates.';
    ELSIF NEW.status = 'Offer Generated' THEN
      v_notif_title := 'Offer Letter Generated';
      v_notif_msg := 'Congratulations! Your offer letter for the ' || COALESCE(v_job_title, 'position') || ' role has been generated. Please check your dashboard.';
    ELSIF NEW.status = 'Onboarding' THEN
      v_notif_title := 'Onboarding Initiated';
      v_notif_msg := 'Welcome aboard! Your onboarding for the ' || COALESCE(v_job_title, 'position') || ' role has been initiated.';
    END IF;

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
