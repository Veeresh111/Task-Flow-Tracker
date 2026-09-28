-- ============================================================================
-- Migration: 20260916000003_email_queue_leasing_and_triggers.sql
-- Description: Upgrades pending_emails into a production-grade leased worker queue
--              with atomic locking, idempotency tracking, and lifecycle triggers.
-- ============================================================================

BEGIN;

-- 1. Expand email_type check constraint
ALTER TABLE public.pending_emails DROP CONSTRAINT IF EXISTS pending_emails_email_type_check;
ALTER TABLE public.pending_emails ADD CONSTRAINT pending_emails_email_type_check
  CHECK (email_type IN (
    'application_received',
    'assessment_invite',
    'interview_scheduled',
    'offer_letter',
    'employee_activation',
    'onboarding_welcome',
    'application_rejected',
    'payslip_available'
  ));

-- 2. Expand status check constraint to include 'processing'
ALTER TABLE public.pending_emails DROP CONSTRAINT IF EXISTS pending_emails_status_check;
ALTER TABLE public.pending_emails ADD CONSTRAINT pending_emails_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed'));

-- 3. Add worker leasing, backoff and idempotency tracking columns
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS worker_id TEXT;
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.pending_emails ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_pending_emails_lease ON public.pending_emails(status, locked_until, attempts);
CREATE INDEX IF NOT EXISTS idx_pending_emails_idempotency ON public.pending_emails(idempotency_key);

-- 4. Atomic Worker Claim RPC (prevents race conditions across concurrent workers)
CREATE OR REPLACE FUNCTION public.claim_pending_emails(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 10,
  p_lease_seconds INT DEFAULT 120
)
RETURNS SETOF public.pending_emails
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.pending_emails
  SET 
    status = 'processing',
    locked_until = now() + (p_lease_seconds || ' seconds')::INTERVAL,
    worker_id = p_worker_id,
    last_attempt_at = now()
  WHERE id IN (
    SELECT id FROM public.pending_emails
    WHERE (
      status = 'pending'
      OR (status = 'processing' AND locked_until < now())
      OR (status = 'failed' AND attempts < 3 AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
    )
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- 5. Auto-queue Application Received Confirmation
CREATE OR REPLACE FUNCTION public.queue_application_received_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT := 'Open Corporate Position';
BEGIN
  SELECT COALESCE(job_title, 'Open Corporate Position') INTO v_job_title 
  FROM job_forms WHERE id = NEW.form_id;

  IF NEW.candidate_email IS NOT NULL AND NEW.candidate_email != '' THEN
    INSERT INTO pending_emails (
      recipient_email,
      recipient_name,
      subject,
      html_body,
      email_type,
      reference_id,
      idempotency_key
    ) VALUES (
      NEW.candidate_email,
      COALESCE(NEW.candidate_name, 'Candidate'),
      'Application Received — ' || v_job_title,
      '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; background: #ffffff;">'
      || '<h2 style="color: #1e1b4b; margin-top: 0;">Application Confirmation</h2>'
      || '<p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear ' || COALESCE(NEW.candidate_name, 'Candidate') || ',</p>'
      || '<p style="color: #475569; font-size: 14px; line-height: 1.6;">We have successfully received your application for <strong>' || v_job_title || '</strong>. Our automated screening engine is currently reviewing your submission.</p>'
      || '<p style="color: #475569; font-size: 14px; line-height: 1.6;">You will receive notification updates regarding your evaluation status and potential assessment scheduling shortly.</p>'
      || '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />'
      || '<p style="color: #94a3b8; font-size: 12px; margin: 0;">FWC Enterprise Recruitment & Talent Operations</p>'
      || '</div>',
      'application_received',
      NEW.id::TEXT,
      'app-ack-' || NEW.id::TEXT
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_application_received ON public.job_applications;
CREATE TRIGGER trg_queue_application_received
  AFTER INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_application_received_email();

COMMIT;
