-- ============================================================
-- Hotfix: Align offer_letters schema with code expectations
--
-- Schema mismatch discovered via lifecycle test:
--   "Could not find the 'offered_ctc' column"
--   "record "new" has no field "candidate_id"" (broken trigger)
--
-- Live DB schema (probed via REST API):
--   id, candidate_name (NOT NULL), candidate_email (NOT NULL),
--   job_title (NOT NULL), status, created_at, updated_at
--
-- Expected schema (from migrations + TypeScript interface):
--   id, application_id, candidate_id, job_form_id, offered_ctc,
--   offer_date, joining_date, status, approved_by, approved_at,
--   sent_at, responded_at, created_by, offer_letter_url, terms,
--   notes, created_at, updated_at
-- ============================================================

-- STEP 1: Add missing columns (safe, IF NOT EXISTS)
ALTER TABLE public.offer_letters
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS candidate_id UUID,
  ADD COLUMN IF NOT EXISTS job_form_id UUID,
  ADD COLUMN IF NOT EXISTS offered_ctc DECIMAL,
  ADD COLUMN IF NOT EXISTS offer_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS offer_letter_url TEXT,
  ADD COLUMN IF NOT EXISTS terms TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- STEP 2: Drop broken trigger functions that reference NEW.candidate_id
-- These triggers exist on the live DB but the column didn't exist
DROP TRIGGER IF EXISTS trg_offer_created_notify ON public.offer_letters;
DROP TRIGGER IF EXISTS trg_offer_notify ON public.offer_letters;

-- Recreate the notification functions with proper null guards
CREATE OR REPLACE FUNCTION public.notify_candidate_on_offer_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  -- Guard: candidate_id might be null (optional column)
  IF NEW.candidate_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_candidate_id := NEW.candidate_id;
  INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
  VALUES (v_candidate_id, 'Offer Letter Issued', 'An offer letter has been issued for you. Please review it in your dashboard.', false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: notifications are best-effort
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
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.candidate_id IS NOT NULL THEN
    v_candidate_id := NEW.candidate_id;
    INSERT INTO public.candidate_notifications (candidate_id, title, message, read)
    VALUES (v_candidate_id, 'Offer Status Updated', 'Your offer status has been updated to: ' || NEW.status, false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Recreate triggers using the updated functions
DROP TRIGGER IF EXISTS trg_offer_created_notify ON public.offer_letters;
CREATE TRIGGER trg_offer_created_notify
  AFTER INSERT ON public.offer_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_candidate_on_offer_created();

DROP TRIGGER IF EXISTS trg_offer_notify ON public.offer_letters;
CREATE TRIGGER trg_offer_notify
  AFTER UPDATE OF status ON public.offer_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_offer_status_change();
