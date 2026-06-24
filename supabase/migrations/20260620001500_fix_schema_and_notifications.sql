-- ============================================================
-- FIX: Add status column to assessment_tokens
-- ============================================================
ALTER TABLE public.assessment_tokens
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- ============================================================
-- AUTOMATED NOTIFICATION TRIGGERS (Real-time enterprise events)
-- These fire on database changes to auto-create notifications
-- so the app behaves like a real-world corporate platform.
-- ============================================================

-- 1. On chat message sent → notify the recipient (for internal users)
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id UUID;
BEGIN
  -- Determine the recipient (the user who is NOT the sender)
  IF NEW.sender_id = NEW.receiver_id THEN
    RETURN NEW;
  END IF;
  v_receiver_id := NEW.receiver_id;

  INSERT INTO public.notifications (user_id, title, message, is_read)
  VALUES (
    v_receiver_id,
    'New Message',
    'You have a new direct message.',
    false
  );
  RETURN NEW;
END;
$$;

-- 2. On HR-candidate message → notify candidate
CREATE OR REPLACE FUNCTION public.notify_candidate_on_hr_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (
    NEW.candidate_id,
    'New Message from HR',
    'HR has sent you a new message.',
    false
  );
  RETURN NEW;
END;
$$;

-- 3. On interview session created/scheduled → notify candidate
CREATE OR REPLACE FUNCTION public.notify_on_interview_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  -- Try to find candidate_id from candidate_applications
  SELECT candidate_id INTO v_candidate_id
  FROM public.candidate_applications
  WHERE id = NEW.application_id;

  IF v_candidate_id IS NOT NULL THEN
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (
      v_candidate_id,
      'Interview Scheduled',
      'Your interview has been scheduled for ' || COALESCE(NEW.scheduled_at::text, 'TBD') || '.',
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. On offer_letters status change → notify appropriate parties
CREATE OR REPLACE FUNCTION public.notify_on_offer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Notify candidate of offer status change
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (
      NEW.candidate_id,
      'Offer Status Updated',
      'Your offer letter status has been updated to: ' || NEW.status || '.',
      false
    );

    -- If approved, notify HR admins
    IF NEW.status = 'Approved' THEN
      INSERT INTO public.notifications (user_id, title, message, is_read)
      SELECT id, 'Offer Ready to Send', 'Offer for candidate is approved and ready to dispatch.', false
      FROM public.profiles
      WHERE role IN ('hr', 'admin');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. On job_applications status change → notify candidate
CREATE OR REPLACE FUNCTION public.notify_candidate_on_application_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (
      NEW.candidate_id,
      'Application Status Updated',
      'Your application status has been updated to: ' || NEW.status || '.',
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 6. On complaint filed → notify admin/hr
CREATE OR REPLACE FUNCTION public.notify_on_complaint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, is_read)
  SELECT id, 'New Complaint Filed', 'A new complaint has been filed and requires attention.', false
  FROM public.profiles
  WHERE role IN ('hr', 'admin');
  RETURN NEW;
END;
$$;

-- ============================================================
-- INSTALL TRIGGERS ON ALL TABLES
-- ============================================================

-- Chat messages
DROP TRIGGER IF EXISTS trg_chat_message_notify ON public.messages;
CREATE TRIGGER trg_chat_message_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_chat_message();

-- HR-Candidate messages
DROP TRIGGER IF EXISTS trg_hr_candidate_message_notify ON public.candidate_hr_messages;
CREATE TRIGGER trg_hr_candidate_message_notify
  AFTER INSERT ON public.candidate_hr_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_candidate_on_hr_message();

-- Interview sessions
DROP TRIGGER IF EXISTS trg_interview_notify ON public.interview_sessions;
CREATE TRIGGER trg_interview_notify
  AFTER INSERT ON public.interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_interview_scheduled();

-- Offer letters
DROP TRIGGER IF EXISTS trg_offer_notify ON public.offer_letters;
CREATE TRIGGER trg_offer_notify
  AFTER UPDATE ON public.offer_letters
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_on_offer_status_change();

-- Job applications
DROP TRIGGER IF EXISTS trg_job_application_notify ON public.job_applications;
CREATE TRIGGER trg_job_application_notify
  AFTER UPDATE ON public.job_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_candidate_on_application_status();

-- Complaints
DROP TRIGGER IF EXISTS trg_complaint_notify ON public.complaints;
CREATE TRIGGER trg_complaint_notify
  AFTER INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_complaint();
