-- ============================================================
-- Pending Emails Queue + Auto-Reject Email Trigger
--
-- Queues emails for asynchronous delivery via the send-email
-- edge function. The edge function processes this queue and
-- sends via Resend API.
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN ('application_rejected', 'payslip_available')),
  reference_id TEXT,                     -- job_application_id or payslip_id
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_emails_status ON pending_emails (status);
CREATE INDEX IF NOT EXISTS idx_pending_emails_type ON pending_emails (email_type);
CREATE INDEX IF NOT EXISTS idx_pending_emails_reference_id ON pending_emails (reference_id);

-- Auto-reject email trigger: fires when job_applications.status changes to 'Rejected'
CREATE OR REPLACE FUNCTION public.queue_rejection_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_email TEXT;
  v_candidate_name TEXT;
  v_job_title TEXT;
BEGIN
  -- Only fire when status changes TO 'Rejected'
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'Rejected' THEN
    -- Resolve candidate email and name from profiles table
    SELECT p.email, COALESCE(p.full_name, 'Candidate')
    INTO v_candidate_email, v_candidate_name
    FROM profiles p
    WHERE p.id = NEW.candidate_id;

    -- Resolve job title from job_forms
    SELECT COALESCE(jf.title, 'a position')
    INTO v_job_title
    FROM job_forms jf
    WHERE jf.id = NEW.form_id;

    -- Only queue if we have an email
    IF v_candidate_email IS NOT NULL THEN
      INSERT INTO pending_emails (
        recipient_email,
        recipient_name,
        subject,
        html_body,
        email_type,
        reference_id
      ) VALUES (
        v_candidate_email,
        v_candidate_name,
        'Application Update - ' || v_job_title,
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">'
          || '<h2 style="color: #293d78;">Application Status Update</h2>'
          || '<p>Dear ' || v_candidate_name || ',</p>'
          || '<p>Thank you for your interest in the <strong>' || v_job_title || '</strong> position.</p>'
          || '<p>After careful evaluation, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>'
          || '<p>We appreciate the time and effort you invested in the application process and wish you the best in your job search.</p>'
          || '<br/><p style="color: #666;">Best regards,<br/>FlowTracker HR Team</p>'
          || '</div>',
        'application_rejected',
        NEW.id::TEXT
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_rejection_email
  AFTER UPDATE OF status ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_rejection_email();
