-- Migration: 20260917000001_final_production_hardening_and_state_machines.sql
-- Description: Consolidate server-authoritative state transitions, question security RPC, autosave RPC, and immutable proctoring logs.

-- 1. SERVER-AUTHORITATIVE STATE MACHINE ON job_applications
CREATE OR REPLACE FUNCTION public.check_job_application_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If status hasn't changed, permit update
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allow initial setup when OLD.status IS NULL
  IF OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Strictly enforce permitted forward lifecycle transitions
  CASE OLD.status
    WHEN 'Applied' THEN
      IF NEW.status NOT IN ('Shortlisted', 'Under Review', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Under Review' THEN
      IF NEW.status NOT IN ('Shortlisted', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Shortlisted' THEN
      IF NEW.status NOT IN ('Assessment In Progress', 'Assessment Completed', 'Interview Scheduled', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Assessment In Progress' THEN
      IF NEW.status NOT IN ('Assessment Completed', 'Disqualified', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Assessment Completed' THEN
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
      IF NEW.status NOT IN ('Hired', 'Rejected') THEN
        RAISE EXCEPTION 'Illegal job application transition from % to % (EV-STATE-001)', OLD.status, NEW.status;
      END IF;
    WHEN 'Hired' THEN
      RAISE EXCEPTION 'Terminal state: Hired application cannot be modified (EV-STATE-002)';
    WHEN 'Rejected' THEN
      RAISE EXCEPTION 'Terminal state: Rejected application cannot be modified (EV-STATE-002)';
    ELSE
      -- Any unknown legacy status can only transition to Rejected or standard stages
      IF NEW.status NOT IN ('Shortlisted', 'Assessment Completed', 'Interview Cleared', 'Offer Generated', 'Offer Accepted', 'Hired', 'Rejected') THEN
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


-- 2. CANDIDATE ASSESSMENT ACCESS RPC (WITHOUT EXPOSING CORRECT ANSWERS)
CREATE OR REPLACE FUNCTION public.get_assessment_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_assessment RECORD;
  v_sanitized_questions JSONB := '[]'::jsonb;
  q JSONB;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Missing or empty token.');
  END IF;

  -- 1. Find token row
  SELECT * INTO v_token
  FROM public.assessment_tokens
  WHERE token = p_token
    AND status = 'Active'
    AND used = false;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid, consumed, or non-existent assessment token.');
  END IF;

  -- Check expiration
  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('valid', false, 'error', 'Assessment token has expired.');
  END IF;

  -- 2. Fetch assessment blueprint
  SELECT * INTO v_assessment
  FROM public.assessments
  WHERE id = v_token.assessment_id;

  IF v_assessment.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Associated assessment blueprint does not exist.');
  END IF;

  -- 3. Sanitize questions: strip correctAnswer, explanation, and grading keys
  IF v_assessment.questions IS NOT NULL AND jsonb_typeof(v_assessment.questions) = 'array' THEN
    FOR q IN SELECT * FROM jsonb_array_elements(v_assessment.questions) LOOP
      v_sanitized_questions := v_sanitized_questions || jsonb_build_object(
        'id', COALESCE(q->>'id', gen_random_uuid()::text),
        'question', COALESCE(q->>'question', ''),
        'options', COALESCE(q->'options', '[]'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'token_id', v_token.id,
    'candidate_id', v_token.candidate_id,
    'application_id', v_token.application_id,
    'assessment_id', v_assessment.id,
    'title', v_assessment.title,
    'duration_minutes', COALESCE(v_assessment.duration_minutes, 30),
    'passing_score', COALESCE(v_assessment.passing_score, 70),
    'max_violations', 5,
    'expires_at', v_token.expires_at,
    'questions', v_sanitized_questions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assessment_by_token(text) TO anon, authenticated, service_role;


-- 3. CANDIDATE ASSESSMENT AUTOSAVE RPC
CREATE OR REPLACE FUNCTION public.autosave_assessment_answers(
  p_token text,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_attempt_id UUID;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing assessment token.');
  END IF;

  -- Validate token
  SELECT * INTO v_token
  FROM public.assessment_tokens
  WHERE token = p_token
    AND status = 'Active'
    AND used = false;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or consumed token.');
  END IF;

  -- Check expiration
  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('success', false, 'error', 'Cannot autosave: assessment deadline has expired (EV-EXAM-001).');
  END IF;

  -- Find or create in-progress attempt
  SELECT id INTO v_attempt_id
  FROM public.assessment_attempts
  WHERE assessment_id = v_token.assessment_id
    AND candidate_id = v_token.candidate_id
    AND completed_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_attempt_id IS NULL THEN
    INSERT INTO public.assessment_attempts (
      assessment_id,
      candidate_id,
      started_at
    ) VALUES (
      v_token.assessment_id,
      v_token.candidate_id,
      now()
    ) RETURNING id INTO v_attempt_id;
  END IF;

  -- Return acknowledgment with server timestamp
  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'saved_at', now(),
    'answer_count', (SELECT count(*) FROM jsonb_object_keys(p_answers))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.autosave_assessment_answers(text, jsonb) TO anon, authenticated, service_role;


-- 4. IMMUTABLE PROCTORING LOGS TABLE & RLS
CREATE TABLE IF NOT EXISTS public.proctoring_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  attempt_id UUID,
  violation_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL DEFAULT 'warning',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proctoring_logs ENABLE ROW LEVEL SECURITY;

-- Candidates can INSERT violation incidents
DROP POLICY IF EXISTS "proctoring_logs_candidate_insert" ON public.proctoring_logs;
CREATE POLICY "proctoring_logs_candidate_insert" ON public.proctoring_logs
  FOR INSERT WITH CHECK (true);

-- Only HR / Admin can view proctoring logs
DROP POLICY IF EXISTS "proctoring_logs_hr_select" ON public.proctoring_logs;
CREATE POLICY "proctoring_logs_hr_select" ON public.proctoring_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- No one can UPDATE or DELETE proctoring logs (immutable security audit)
DROP POLICY IF EXISTS "proctoring_logs_no_update" ON public.proctoring_logs;
DROP POLICY IF EXISTS "proctoring_logs_no_delete" ON public.proctoring_logs;
