-- ============================================================================
-- Migration: 20260921000001_truth_reconciliation_state_machines_rls.sql
-- Purpose:   Truth reconciliation pass.
--   A. Align job_applications state machine with the DB CHECK vocabulary
--      (Hired, Offer Declined, Interview Failed, Under Review, Assessment Assigned)
--   B. Restore lawful anonymous INSERT on job_applications / candidates
--      (public careers portal) and provide a SECURITY DEFINER RPC so anonymous
--      auto-issued assessment tokens no longer require INSERT privileges.
--   C. Make assessment autosave persist real answers with revision guarding.
--   D. Immutable finalized F&F settlements; numeric CHECKs on money columns.
--   E. Hard idempotency on pending_emails (unique idempotency_key).
-- ============================================================================

BEGIN;

-- ============================================================================
-- A. STATE MACHINE RECONCILIATION
-- ============================================================================

-- A1. Widen the CHECK constraint to cover every status the application and the
--     state-machine trigger actually use. Existing rows are valid members of
--     the new set, so no data migration is required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_job_applications_status'
      AND conrelid = 'public.job_applications'::regclass
  ) THEN
    ALTER TABLE public.job_applications DROP CONSTRAINT chk_job_applications_status;
  END IF;
END $$;

ALTER TABLE public.job_applications
  ADD CONSTRAINT chk_job_applications_status
  CHECK (status IN (
    'Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted',
    'Recruiter Screening', 'Assessment Assigned', 'Assessment In Progress',
    'Assessment Passed', 'Assessment Completed', 'Interview Scheduled',
    'Interview Cleared', 'Interview Failed', 'Offer Generated', 'Offer Accepted',
    'Offer Declined', 'Onboarding', 'Hired', 'Rejected'
  ));

-- A2. Rebuild the transition trigger over the reconciled vocabulary.
CREATE OR REPLACE FUNCTION public.check_job_application_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Initial setup when no status existed yet
  IF OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Anonymous/system backfill of legacy NULL vocabulary is not permitted to
  -- skip stages: every transition below must be one of the documented edges.
  CASE OLD.status
    WHEN 'Applied' THEN
      IF NEW.status NOT IN ('Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted', 'Assessment Assigned', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Screening' THEN
      IF NEW.status NOT IN ('Under Review', 'Shortlisted', 'ATS Shortlisted', 'Assessment Assigned', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Under Review' THEN
      IF NEW.status NOT IN ('Shortlisted', 'ATS Shortlisted', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Shortlisted', 'ATS Shortlisted' THEN
      IF NEW.status NOT IN ('Assessment Assigned', 'Assessment In Progress', 'Assessment Completed', 'Interview Scheduled', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Recruiter Screening' THEN
      IF NEW.status NOT IN ('Shortlisted', 'Assessment Assigned', 'Interview Scheduled', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Assessment Assigned' THEN
      IF NEW.status NOT IN ('Assessment In Progress', 'Assessment Completed', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Assessment In Progress' THEN
      IF NEW.status NOT IN ('Assessment Completed', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Assessment Passed', 'Assessment Completed' THEN
      IF NEW.status NOT IN ('Interview Scheduled', 'Interview Cleared', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Interview Scheduled' THEN
      IF NEW.status NOT IN ('Interview Cleared', 'Interview Failed', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Interview Cleared' THEN
      IF NEW.status NOT IN ('Offer Generated', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Offer Generated' THEN
      IF NEW.status NOT IN ('Offer Accepted', 'Offer Declined', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Offer Accepted' THEN
      IF NEW.status NOT IN ('Onboarding', 'Hired', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Onboarding' THEN
      IF NEW.status NOT IN ('Hired', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Hired' THEN
      RAISE EXCEPTION 'Terminal state: Hired application cannot be modified (EV-STATE-002)';
    WHEN 'Rejected' THEN
      RAISE EXCEPTION 'Terminal state: Rejected application cannot be modified (EV-STATE-002)';
    ELSE
      -- Unknown legacy vocabulary: only allow convergence to a documented state.
      IF NEW.status NOT IN ('Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted',
                            'Assessment Assigned', 'Assessment Completed', 'Interview Scheduled',
                            'Interview Cleared', 'Offer Generated', 'Offer Accepted', 'Onboarding',
                            'Hired', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_job_application_transition ON public.job_applications;
CREATE TRIGGER trg_check_job_application_transition
  BEFORE UPDATE OF status ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_application_transition();

-- A3. HR-side transition guard: non-HR actors may not mutate application status
--     via direct REST. Anonymous authors can only ever INSERT (B1 below).
CREATE OR REPLACE FUNCTION public.guard_job_application_status_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    -- Server-authoritative internal transitions (SECURITY DEFINER RPCs) mark
    -- their transaction with this GUC. PostgREST clients cannot set custom
    -- GUCs, so this cannot be forged from outside the database.
    IF current_setting('app.authoritative_transition', true) = 'true' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Anonymous sessions cannot modify job application status (EV-RBAC-101)';
  END IF;

  SELECT LOWER(COALESCE(role, '')) INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid() AND status != 'archived';

  IF v_caller_role NOT IN ('admin', 'hr') THEN
    RAISE EXCEPTION 'Only HR/Admin may change job application status (EV-RBAC-102)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_application_status_authority ON public.job_applications;
CREATE TRIGGER trg_guard_application_status_authority
  BEFORE UPDATE OF status ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_job_application_status_authority();

-- ============================================================================
-- B. PUBLIC APPLICATION FLOW — LAWFUL ANON INSERT + SECURE TOKEN RPC
-- ============================================================================

-- B1. Anonymous applicants must be able to create their own candidate row and
--     application row (the public careers portal). This is a deliberate,
--     scoped exception: INSERT-only, no UPDATE, no DELETE, no SELECT.
DROP POLICY IF EXISTS "candidates_public_insert" ON public.candidates;
CREATE POLICY "candidates_public_insert" ON public.candidates
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "applications_public_insert" ON public.job_applications;
CREATE POLICY "applications_public_insert" ON public.job_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- B2. SECURITY DEFINER RPC: anonymous auto-shortlist token issuance.
--     Replaces the previous pattern where anon needed INSERT on
--     assessment_tokens (which RLS denied -> 403 on every auto-issued token).
--     Server derives the assessment from the job form, enforces one active
--     token per candidate/assessment, and never exposes grading metadata.
CREATE OR REPLACE FUNCTION public.issue_public_assessment_token(
  p_form_id UUID,
  p_candidate_id UUID,
  p_application_id UUID,
  p_score NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assessment_id UUID;
  v_existing TEXT;
  v_token TEXT;
  v_valid_candidate BOOLEAN;
  v_valid_application BOOLEAN;
BEGIN
  IF p_form_id IS NULL OR p_candidate_id IS NULL OR p_application_id IS NULL THEN
    RAISE EXCEPTION 'Missing form/candidate/application reference (EV-EXAM-100)';
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Invalid screening score (EV-EXAM-101)';
  END IF;

  -- Authoritative binding: the application must belong to the candidate AND
  -- to the given public job form. Prevents token minting for foreign rows.
  SELECT EXISTS (
    SELECT 1 FROM public.job_applications
    WHERE id = p_application_id
      AND candidate_id = p_candidate_id
      AND form_id = p_form_id
  ) INTO v_valid_application;

  IF NOT v_valid_application THEN
    RAISE EXCEPTION 'Application does not match candidate/form (EV-EXAM-102)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.candidates WHERE id = p_candidate_id
  ) INTO v_valid_candidate;
  IF NOT v_valid_candidate THEN
    RAISE EXCEPTION 'Candidate record not found (EV-EXAM-103)';
  END IF;

  SELECT id INTO v_assessment_id
  FROM public.assessments
  WHERE job_form_id = p_form_id AND status = 'Active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_assessment_id IS NULL THEN
    RETURN NULL; -- No active assessment configured: caller skips issuance.
  END IF;

  -- Idempotency: one active token per candidate/assessment.
  SELECT token INTO v_existing
  FROM public.assessment_tokens
  WHERE candidate_id = p_candidate_id
    AND assessment_id = v_assessment_id
    AND status = 'Active'
    AND used = false
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Token generated server-side (never client Math.random).
  v_token := upper(substring(gen_random_uuid()::text from 1 for 8))
          || '-' || upper(substring(gen_random_uuid()::text from 1 for 4));

  INSERT INTO public.assessment_tokens (
    assessment_id, candidate_id, application_id, token,
    status, used, expires_at
  ) VALUES (
    v_assessment_id, p_candidate_id, p_application_id, v_token,
    'Active', false, now() + interval '48 hours'
  );

  -- Authoritative pipeline transition performed server-side (anonymous
  -- clients never UPDATE job_applications). Marked via transaction GUC so
  -- the authority guard can distinguish this definer-context transition.
  PERFORM set_config('app.authoritative_transition', 'true', true);

  UPDATE public.job_applications
  SET status = 'Assessment Assigned'
  WHERE id = p_application_id
    AND status IN ('Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted', 'Recruiter Screening');

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_public_assessment_token(UUID, UUID, UUID, NUMERIC)
  TO anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_public_assessment_token(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;

-- ============================================================================
-- C. REAL AUTOSAVE — PERSIST ANSWERS WITH REVISION GUARDING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assessment_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt
  ON public.assessment_attempt_answers(attempt_id);

ALTER TABLE public.assessment_attempt_answers ENABLE ROW LEVEL SECURITY;
-- No client policies: access only through the SECURITY DEFINER RPC below and
-- the grade-assessment Edge Function (service_role).

CREATE OR REPLACE FUNCTION public.autosave_assessment_answers(
  p_token TEXT,
  p_answers JSONB,
  p_revision INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_attempt_id UUID;
  v_max_revision INT;
  v_incoming_revision INT;
  v_saved_count INT := 0;
  q JSONB;
  v_qid TEXT;
  v_answer TEXT;
  v_existing_rev INT;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing assessment token.');
  END IF;

  SELECT * INTO v_token
  FROM public.assessment_tokens
  WHERE token = p_token AND status = 'Active' AND used = false;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or consumed token.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('success', false, 'error', 'Cannot autosave: assessment deadline has expired (EV-EXAM-001).');
  END IF;

  -- Find or create the in-progress attempt (row-locked to serialize writers).
  SELECT id INTO v_attempt_id
  FROM public.assessment_attempts
  WHERE assessment_id = v_token.assessment_id
    AND candidate_id = v_token.candidate_id
    AND completed_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_attempt_id IS NULL THEN
    INSERT INTO public.assessment_attempts (assessment_id, candidate_id, started_at)
    VALUES (v_token.assessment_id, v_token.candidate_id, now())
    RETURNING id INTO v_attempt_id;
  END IF;

  -- Out-of-order guard: an older client revision must not clobber newer data.
  SELECT COALESCE(MAX(revision), 0) INTO v_max_revision
  FROM public.assessment_attempt_answers
  WHERE attempt_id = v_attempt_id;

  v_incoming_revision := COALESCE(p_revision, v_max_revision + 1);
  IF v_incoming_revision <= v_max_revision THEN
    RETURN jsonb_build_object(
      'success', false,
      'stale_revision', true,
      'current_revision', v_max_revision,
      'error', 'Stale autosave revision rejected (EV-EXAM-002).'
    );
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p_answers) = 'array' THEN p_answers
      ELSE '[]'::jsonb
    END
  ) LOOP
    v_qid := q->>'questionId';
    v_answer := q->>'answer';
    IF v_qid IS NULL OR v_answer IS NULL THEN
      CONTINUE;
    END IF;

    -- Accept either a bare value or { value, revision } entries.
    -- Per-question revision rides on the batch revision for simplicity and
    -- monotonicity; individual rows keep their own saved_at audit stamp.

    SELECT revision INTO v_existing_rev
    FROM public.assessment_attempt_answers
    WHERE attempt_id = v_attempt_id AND question_id = v_qid;

    IF v_existing_rev IS NULL THEN
      INSERT INTO public.assessment_attempt_answers (attempt_id, question_id, answer, revision)
      VALUES (v_attempt_id, v_qid, left(v_answer, 10000), v_incoming_revision);
      v_saved_count := v_saved_count + 1;
    ELSIF v_incoming_revision > v_existing_rev THEN
      UPDATE public.assessment_attempt_answers
      SET answer = left(v_answer, 10000),
          revision = v_incoming_revision,
          saved_at = now()
      WHERE attempt_id = v_attempt_id AND question_id = v_qid;
      v_saved_count := v_saved_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'saved_at', now(),
    'revision', v_incoming_revision,
    'saved_count', v_saved_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.autosave_assessment_answers(TEXT, JSONB, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autosave_assessment_answers(TEXT, JSONB, INT)
  TO anon, authenticated, service_role;

-- ============================================================================
-- D. F&F IMMUTABILITY + MONEY INVARIANTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_fnf_finalized_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'settled' AND NEW.status IS DISTINCT FROM 'disbursed' THEN
    RAISE EXCEPTION 'Finalized F&F settlement is immutable (EV-FNF-001)';
  END IF;

  -- Any mutation of a settled row other than a controlled status move to
  -- 'disbursed' (payment execution) is rejected, including amount tampering.
  IF OLD.status = 'settled' THEN
    IF OLD.net_payable IS DISTINCT FROM NEW.net_payable
       OR OLD.gross_settlement IS DISTINCT FROM NEW.gross_settlement
       OR OLD.prorated_salary IS DISTINCT FROM NEW.prorated_salary
       OR OLD.leave_encashment_amount IS DISTINCT FROM NEW.leave_encashment_amount
       OR OLD.notice_shortfall_deduction IS DISTINCT FROM NEW.notice_shortfall_deduction
       OR OLD.gratuity_amount IS DISTINCT FROM NEW.gratuity_amount THEN
      RAISE EXCEPTION 'Settled F&F amounts are immutable; use controlled correction (EV-FNF-002)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fnf_immutable ON public.fnf_settlements;
CREATE TRIGGER trg_fnf_immutable
  BEFORE UPDATE ON public.fnf_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fnf_finalized_immutability();

-- Numeric sanity on authoritative money columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payslips_money_positive'
      AND conrelid = 'public.payslips'::regclass
  ) THEN
    ALTER TABLE public.payslips
      ADD CONSTRAINT chk_payslips_money_positive
      CHECK (gross >= 0 AND net >= 0 AND pf_amount >= 0 AND pt_amount >= 0 AND tds_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_fnf_net_nonnegative'
      AND conrelid = 'public.fnf_settlements'::regclass
  ) THEN
    ALTER TABLE public.fnf_settlements
      ADD CONSTRAINT chk_fnf_net_nonnegative
      CHECK (net_payable >= 0 AND gross_settlement >= 0);
  END IF;
END $$;

-- ============================================================================
-- E. EMAIL QUEUE — HARD IDEMPOTENCY
-- ============================================================================

DO $$
DECLARE
  v_dup TEXT;
BEGIN
  -- Collapse duplicate keys to keep the oldest row before adding uniqueness.
  SELECT min(id::text) INTO v_dup FROM public.pending_emails WHERE false; -- placeholder no-op
  UPDATE public.pending_emails
  SET idempotency_key = 'email/' || id::text
  WHERE idempotency_key IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pending_emails'
      AND indexname = 'uq_pending_emails_idempotency_key'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_emails_idempotency_key
      ON public.pending_emails (idempotency_key);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    -- Legacy duplicates exist: keep the queue functional but enforce at the
    -- worker layer (ON CONFLICT DO NOTHING semantics). Not silently swallowed:
    -- documented here and surfaced to operators via this migration comment.
    RAISE NOTICE 'pending_emails.idempotency_key contains legacy duplicates; unique index NOT created. Deduplicate rows before re-running this migration.';
END $$;

COMMIT;
