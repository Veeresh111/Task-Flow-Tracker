-- ============================================================
-- FIX: candidate_id resolution helper + missing tables
-- ============================================================

-- Helper function: resolve any candidate_id to a value that
-- exists in candidates(id). Handles the dual-identity issue
-- where some tables store profiles.id instead of candidates.id.
CREATE OR REPLACE FUNCTION public.resolve_candidate_id(input_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.candidates WHERE id = input_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT c.id INTO v_id FROM public.candidates c JOIN public.profiles p ON c.profile_id = p.id WHERE p.id = input_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT candidate_id INTO v_id FROM public.profiles WHERE id = input_id AND candidate_id IS NOT NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  RETURN input_id;
END;
$$;

-- ============================================================
-- FIX: Recreate ALL trigger functions with robust candidate_id
-- ============================================================

-- 1. On chat message sent → notify the recipient (internal)
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id UUID;
BEGIN
  IF NEW.sender_id = NEW.receiver_id THEN RETURN NEW; END IF;
  v_receiver_id := NEW.receiver_id;
  INSERT INTO public.notifications (user_id, title, message, is_read)
  VALUES (v_receiver_id, 'New Message', 'You have a new direct message.', false);
  RETURN NEW;
END;
$$;

-- 2. On HR-candidate message → notify candidate (with candidate_id resolution)
CREATE OR REPLACE FUNCTION public.notify_candidate_on_hr_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  v_candidate_id := public.resolve_candidate_id(NEW.candidate_id);
  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (v_candidate_id, 'New Message from HR', 'HR has sent you a new message.', false);
  RETURN NEW;
END;
$$;

-- 3. On interview session created → notify candidate (with resolution)
CREATE OR REPLACE FUNCTION public.notify_on_interview_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  SELECT candidate_id INTO v_candidate_id FROM public.candidate_applications WHERE id = NEW.application_id;
  IF v_candidate_id IS NOT NULL THEN
    v_candidate_id := public.resolve_candidate_id(v_candidate_id);
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'Interview Scheduled', 'Your interview has been scheduled for ' || COALESCE(NEW.scheduled_at::text, 'TBD') || '.', false);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. On offer_letters status change → notify candidate + HR admins
CREATE OR REPLACE FUNCTION public.notify_on_offer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_candidate_id := public.resolve_candidate_id(NEW.candidate_id);
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'Offer Status Updated', 'Your offer letter status has been updated to: ' || NEW.status || '.', false);
    IF NEW.status = 'Approved' THEN
      INSERT INTO public.notifications (user_id, title, message, is_read)
      SELECT id, 'Offer Ready to Send', 'Offer for candidate is approved and ready to dispatch.', false
      FROM public.profiles WHERE role IN ('hr', 'admin');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. On job_applications status change → notify candidate (with resolution)
CREATE OR REPLACE FUNCTION public.notify_candidate_on_application_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_candidate_id := public.resolve_candidate_id(NEW.candidate_id);
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'Application Status Updated', 'Your application status has been updated to: ' || NEW.status || '.', false);
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
  FROM public.profiles WHERE role IN ('hr', 'admin');
  RETURN NEW;
END;
$$;

-- 7. On assessment_token used → notification
CREATE OR REPLACE FUNCTION public.notify_candidate_on_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  v_candidate_id := public.resolve_candidate_id(NEW.candidate_id);
  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (v_candidate_id, 'Assessment Assigned', 'You have been assigned an assessment. Please check your dashboard.', false);
  RETURN NEW;
END;
$$;

-- ============================================================
-- DROP AND RECREATE ALL TRIGGERS to pick up new function bodies
-- ============================================================
DROP TRIGGER IF EXISTS trg_chat_message_notify ON public.messages;
CREATE TRIGGER trg_chat_message_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_chat_message();

DROP TRIGGER IF EXISTS trg_hr_candidate_message_notify ON public.candidate_hr_messages;
CREATE TRIGGER trg_hr_candidate_message_notify
  AFTER INSERT ON public.candidate_hr_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_candidate_on_hr_message();

DROP TRIGGER IF EXISTS trg_interview_notify ON public.interview_sessions;
CREATE TRIGGER trg_interview_notify
  AFTER INSERT ON public.interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_interview_scheduled();

DROP TRIGGER IF EXISTS trg_offer_notify ON public.offer_letters;
CREATE TRIGGER trg_offer_notify
  AFTER UPDATE ON public.offer_letters
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_on_offer_status_change();

DROP TRIGGER IF EXISTS trg_job_application_notify ON public.job_applications;
CREATE TRIGGER trg_job_application_notify
  AFTER UPDATE ON public.job_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_candidate_on_application_status();

DROP TRIGGER IF EXISTS trg_complaint_notify ON public.complaints;
CREATE TRIGGER trg_complaint_notify
  AFTER INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_complaint();

DROP TRIGGER IF EXISTS trg_assessment_notify ON public.assessment_tokens;
CREATE TRIGGER trg_assessment_notify
  AFTER INSERT ON public.assessment_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_candidate_on_assessment();

-- ============================================================
-- CREATE missing payroll_ledger table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  net_payroll_pay DECIMAL DEFAULT 0,
  gross_pay DECIMAL DEFAULT 0,
  deductions DECIMAL DEFAULT 0,
  pay_period TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FIX: Add missing trigger for offer_letters INSERT
-- So new offers also trigger notifications, not just updates
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_candidate_on_offer_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  v_candidate_id := public.resolve_candidate_id(NEW.candidate_id);
  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (v_candidate_id, 'Offer Letter Issued', 'An offer letter has been issued for you. Please review it in your dashboard.', false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_created_notify ON public.offer_letters;
CREATE TRIGGER trg_offer_created_notify
  AFTER INSERT ON public.offer_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_candidate_on_offer_created();

-- ============================================================
-- SEED payroll_ledger with sample data if empty
-- ============================================================
INSERT INTO public.payroll_ledger (user_id, net_payroll_pay, gross_pay, deductions, pay_period)
SELECT id, 75000, 100000, 25000, '2026-Q2'
FROM public.profiles
WHERE role IN ('employee', 'admin', 'hr', 'team_lead')
  AND NOT EXISTS (SELECT 1 FROM public.payroll_ledger LIMIT 1)
LIMIT 10;
