-- ============================================================
-- FIX: Add is_read to messages, RLS for payroll_ledger,
--      and make all notification triggers resilient
-- ============================================================

-- 1. Add is_read column to messages (used by chat SELECT queries)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

-- 2. RLS policies for payroll_ledger table
ALTER TABLE public.payroll_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_ledger_select_all" ON public.payroll_ledger;
CREATE POLICY "payroll_ledger_select_all" ON public.payroll_ledger
  FOR SELECT USING (public.user_has_role(ARRAY['admin', 'hr']));

-- 3. Rewrite notification triggers to NEVER fail the parent transaction.
--    If the notification insert fails (e.g. FK violation, missing column),
--    the exception is caught and the original operation still succeeds.
--    This is critical for chat, offers, assessments, etc.

CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id = NEW.receiver_id THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.notifications (user_id, title, message, is_read)
    VALUES (NEW.receiver_id, 'New Message', 'You have a new direct message.', false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

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
  BEGIN
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'New Message from HR', 'HR has sent you a new message.', false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

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
    BEGIN
      INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
      VALUES (v_candidate_id, 'Interview Scheduled', 'Your interview has been scheduled for ' || COALESCE(NEW.scheduled_at::text, 'TBD') || '.', false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

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
    BEGIN
      INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
      VALUES (v_candidate_id, 'Offer Status Updated', 'Your offer letter status has been updated to: ' || NEW.status || '.', false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    IF NEW.status = 'Approved' THEN
      BEGIN
        INSERT INTO public.notifications (user_id, title, message, is_read)
        SELECT id, 'Offer Ready to Send', 'Offer for candidate is approved and ready to dispatch.', false
        FROM public.profiles WHERE role IN ('hr', 'admin');
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
    BEGIN
      INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
      VALUES (v_candidate_id, 'Application Status Updated', 'Your application status has been updated to: ' || NEW.status || '.', false);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_complaint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, title, message, is_read)
    SELECT id, 'New Complaint Filed', 'A new complaint has been filed and requires attention.', false
    FROM public.profiles WHERE role IN ('hr', 'admin');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

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
  BEGIN
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'Assessment Assigned', 'You have been assigned an assessment. Please check your dashboard.', false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

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
  BEGIN
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'Offer Letter Issued', 'An offer letter has been issued for you. Please review it in your dashboard.', false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;
