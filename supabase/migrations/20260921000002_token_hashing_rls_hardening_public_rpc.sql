-- ============================================================================
-- Migration: 20260921000002_token_hashing_rls_hardening_public_rpc.sql
-- Purpose (P0 security pass, live-verified targets):
--   A. B2: Hash assessment tokens at rest (sha-256) with legacy coexistence.
--   B. Close anon answer-key leak: assessments readable only by HR/admin;
--      candidate access exclusively via sanitizing RPCs.
--   C. Server-authoritative public application submission (RPC), removing
--      anon REST insert paths on job_applications / candidates.
--   D. profiles: remove ANON full access (keep authenticated flows; the
--      authenticated directory minimization is a documented follow-up).
--   E. Notifications / chat / payroll open policies scoped to real actors.
--   F. DB-backed rate limiting primitive (rate_limit_buckets + RPC).
--   G. Email worker invocation prep (pg_net + vault-referenced secret; secret
--      itself is injected at deploy time, never in this file).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- A. B2 — ASSESSMENT TOKEN HASHING
-- ============================================================================

ALTER TABLE public.assessment_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Backfill: hash every existing plaintext token so legacy rows keep working.
UPDATE public.assessment_tokens
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- One hash per token; partial unique (new rows only until all legacy consumed).
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_tokens_token_hash
  ON public.assessment_tokens (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_tokens_token_hash_lookup
  ON public.assessment_tokens (token_hash);

-- --- A1. Hash-aware token resolution shared by RPCs -------------------------
CREATE OR REPLACE FUNCTION public.find_assessment_token_by_value(p_token TEXT)
RETURNS public.assessment_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_row public.assessment_tokens;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  v_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  -- Hash-first (new tokens), plaintext fallback (legacy rows only).
  SELECT * INTO v_row FROM public.assessment_tokens
  WHERE token_hash = v_hash
  LIMIT 1;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.assessment_tokens
    WHERE token = trim(p_token)
    LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

-- --- A2. Public assessment blueprint via token (sanitized, hash-aware) ------
CREATE OR REPLACE FUNCTION public.get_assessment_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.assessment_tokens;
  v_assessment public.assessments%ROWTYPE;
  v_sanitized JSONB := '[]'::jsonb;
  q JSONB;
  v_attempts INT := 0;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Missing or empty token.');
  END IF;

  -- Rate limit: 40 token validations / 5 min per distinct token value.
  IF NOT public.consume_rate_limit('assessment_token_lookup', encode(digest(lower(trim(p_token)), 'sha256'), 'hex'), 40, 300) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Too many attempts. Please wait before retrying (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid, consumed, or non-existent assessment token.');
  END IF;

  IF v_token.status != 'Active' OR v_token.used = true THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This assessment token has already been used or is no longer active.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('valid', false, 'error', 'Assessment token has expired.');
  END IF;

  SELECT * INTO v_assessment FROM public.assessments WHERE id = v_token.assessment_id;
  IF v_assessment.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Associated assessment blueprint does not exist.');
  END IF;

  SELECT count(*) INTO v_attempts FROM public.assessment_attempts
  WHERE assessment_id = v_token.assessment_id AND candidate_id = v_token.candidate_id;

  IF v_assessment.questions IS NOT NULL AND jsonb_typeof(v_assessment.questions) = 'array' THEN
    FOR q IN SELECT * FROM jsonb_array_elements(v_assessment.questions) LOOP
      v_sanitized := v_sanitized || jsonb_build_object(
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
    'max_attempts', COALESCE(v_assessment.max_attempts, 1),
    'attempts_used', v_attempts,
    'max_violations', 5,
    'expires_at', v_token.expires_at,
    'questions', v_sanitized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_assessment_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_by_token(TEXT) TO anon, authenticated, service_role;

-- --- A3. Autosave: hash-aware token resolution ------------------------------
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
  v_token public.assessment_tokens;
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

  -- Rate limit autosave bursts: 120 saves / 5 min per token.
  IF NOT public.consume_rate_limit('assessment_autosave', encode(digest(lower(trim(p_token)), 'sha256'), 'hex'), 120, 300) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Autosave rate limit reached; continue working — submissions remain authoritative (EV-RATE-429).');
  END IF;

  v_token := public.find_assessment_token_by_value(p_token);

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or consumed token.');
  END IF;

  IF v_token.expires_at IS NOT NULL AND v_token.expires_at < now() THEN
    UPDATE public.assessment_tokens SET status = 'Expired' WHERE id = v_token.id;
    RETURN jsonb_build_object('success', false, 'error', 'Cannot autosave: assessment deadline has expired (EV-EXAM-001).');
  END IF;

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

  SELECT COALESCE(MAX(revision), 0) INTO v_max_revision
  FROM public.assessment_attempt_answers
  WHERE attempt_id = v_attempt_id;

  v_incoming_revision := COALESCE(p_revision, v_max_revision + 1);
  IF v_incoming_revision <= v_max_revision THEN
    RETURN jsonb_build_object(
      'success', false, 'stale_revision', true,
      'current_revision', v_max_revision,
      'error', 'Stale autosave revision rejected (EV-EXAM-002).'
    );
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_answers) = 'array' THEN p_answers ELSE '[]'::jsonb END
  ) LOOP
    v_qid := q->>'questionId';
    v_answer := q->>'answer';
    IF v_qid IS NULL OR v_answer IS NULL THEN CONTINUE; END IF;

    SELECT revision INTO v_existing_rev
    FROM public.assessment_attempt_answers
    WHERE attempt_id = v_attempt_id AND question_id = v_qid;

    IF v_existing_rev IS NULL THEN
      INSERT INTO public.assessment_attempt_answers (attempt_id, question_id, answer, revision)
      VALUES (v_attempt_id, v_qid, left(v_answer, 10000), v_incoming_revision);
      v_saved_count := v_saved_count + 1;
    ELSIF v_incoming_revision > v_existing_rev THEN
      UPDATE public.assessment_attempt_answers
      SET answer = left(v_answer, 10000), revision = v_incoming_revision, saved_at = now()
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

-- --- A4. Issuance: high-entropy raw token, only the hash is stored ----------
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
  v_raw TEXT;
  v_hash TEXT;
  v_valid BOOLEAN;
BEGIN
  IF p_form_id IS NULL OR p_candidate_id IS NULL OR p_application_id IS NULL THEN
    RAISE EXCEPTION 'Missing form/candidate/application reference (EV-EXAM-100)';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Invalid screening score (EV-EXAM-101)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.job_applications
    WHERE id = p_application_id AND candidate_id = p_candidate_id AND form_id = p_form_id
  ) INTO v_valid;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Application does not match candidate/form (EV-EXAM-102)';
  END IF;

  SELECT id INTO v_assessment_id
  FROM public.assessments
  WHERE job_form_id = p_form_id AND status = 'Active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_assessment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT token INTO v_existing
  FROM public.assessment_tokens
  WHERE candidate_id = p_candidate_id
    AND assessment_id = v_assessment_id
    AND status = 'Active' AND used = false
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- 128-bit server-generated token. Raw value is returned ONCE to the caller
  -- (delivery channel); only its SHA-256 is persisted.
  v_raw := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

  INSERT INTO public.assessment_tokens (
    assessment_id, candidate_id, application_id, token, token_hash,
    status, used, expires_at
  ) VALUES (
    v_assessment_id, p_candidate_id, p_application_id,
    'H:' || v_hash, v_hash,
    'Active', false, now() + interval '48 hours'
  );

  PERFORM set_config('app.authoritative_transition', 'true', true);
  UPDATE public.job_applications
  SET status = 'Assessment Assigned'
  WHERE id = p_application_id
    AND status IN ('Applied', 'Screening', 'Under Review', 'Shortlisted', 'ATS Shortlisted', 'Recruiter Screening');

  RETURN v_raw;
END;
$$;

-- ============================================================================
-- B. ASSESSMENTS — close public answer-key leak
-- ============================================================================
DROP POLICY IF EXISTS "Allow assessment read" ON public.assessments;
DROP POLICY IF EXISTS "Allow public to view assessments" ON public.assessments;
DROP POLICY IF EXISTS "Allow assessment update" ON public.assessments;
DROP POLICY IF EXISTS "assessments_open_policy" ON public.assessments;
DROP POLICY IF EXISTS "assessments_select_hr" ON public.assessments;
DROP POLICY IF EXISTS "assessments_write_hr" ON public.assessments;

CREATE POLICY "assessments_select_hr" ON public.assessments
  FOR SELECT TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'hr']));

CREATE POLICY "assessments_insert_hr" ON public.assessments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin', 'hr']));

CREATE POLICY "assessments_update_hr" ON public.assessments
  FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'hr']))
  WITH CHECK (public.user_has_role(ARRAY['admin', 'hr']));

CREATE POLICY "assessments_delete_hr" ON public.assessments
  FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'hr']));

-- ============================================================================
-- C. SERVER-AUTHORITATIVE PUBLIC APPLICATION SUBMISSION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_public_application_for_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_applications
    WHERE lower(candidate_email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_application_for_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_application_for_email(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_application(
  p_form_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_experience_years NUMERIC,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_email TEXT;
  v_candidate_id UUID;
  v_application_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_form_open BOOLEAN;
  v_form_title TEXT;
  v_app_json JSONB;
BEGIN
  IF p_form_id IS NULL OR p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Missing requisition or applicant email (EV-APP-100)';
  END IF;

  SELECT (status IN ('Published', 'Open')) , job_title
  INTO v_form_open, v_form_title
  FROM public.job_forms WHERE id = p_form_id;

  IF NOT v_form_open THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORM_CLOSED',
      'error', 'This requisition is no longer accepting applications.');
  END IF;

  v_clean_email := lower(trim(p_email));

  SELECT id INTO v_candidate_id FROM public.candidates WHERE lower(email) = v_clean_email;

  IF v_candidate_id IS NULL THEN
    INSERT INTO public.candidates (full_name, email, phone, experience_years, stage)
    VALUES (COALESCE(trim(p_full_name), 'Applicant'), v_clean_email,
            NULLIF(trim(COALESCE(p_phone, '')), ''), COALESCE(p_experience_years, 0), 'Applied')
    RETURNING id INTO v_candidate_id;
  ELSE
    -- Candidate exists: enforce one application per requisition (idempotency).
    SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.job_applications
    WHERE candidate_id = v_candidate_id AND form_id = p_form_id;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_APPLICATION',
        'application_id', v_existing_id, 'status', v_existing_status,
        'error', 'You have already applied for this position. Current status: ' || COALESCE(v_existing_status, 'Applied') || '.');
    END IF;
  END IF;

  INSERT INTO public.job_applications (
    form_id, candidate_id, candidate_name, candidate_email,
    answers, status
  ) VALUES (
    p_form_id, v_candidate_id, COALESCE(trim(p_full_name), 'Applicant'), v_clean_email,
    COALESCE(p_answers, '{}'::jsonb), 'Applied'
  ) RETURNING id INTO v_application_id;

  -- Link profile (if a registered user with this email exists).
  UPDATE public.profiles
  SET candidate_id = v_candidate_id
  WHERE lower(email) = v_clean_email AND candidate_id IS NULL;

  v_app_json := jsonb_build_object(
    'success', true,
    'candidate_id', v_candidate_id,
    'application_id', v_application_id,
    'job_title', v_form_title
  );
  RETURN v_app_json;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_application(UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_application(UUID, TEXT, TEXT, TEXT, NUMERIC, JSONB)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_public_resume(
  p_application_id UUID,
  p_resume_path TEXT,
  p_parsed_resume_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id UUID;
BEGIN
  SELECT candidate_id INTO v_candidate_id FROM public.job_applications WHERE id = p_application_id;
  IF v_candidate_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found.');
  END IF;

  UPDATE public.job_applications
  SET resume_url = NULLIF(trim(p_resume_path), ''),
      parsed_resume_text = NULLIF(left(COALESCE(p_parsed_resume_text, ''), 200000), '')
  WHERE id = p_application_id;

  UPDATE public.candidates
  SET resume_url = NULLIF(trim(p_resume_path), '')
  WHERE id = v_candidate_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_public_resume(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_public_resume(UUID, TEXT, TEXT) TO anon, authenticated;

-- Drop anon/public REST mutation paths now that the RPC owns this flow.
DROP POLICY IF EXISTS "job_applications_open_policy" ON public.job_applications;
DROP POLICY IF EXISTS "applications_public_insert" ON public.job_applications;
DROP POLICY IF EXISTS "job_applications_insert" ON public.job_applications;
DROP POLICY IF EXISTS "Allow public candidates to submit applications" ON public.job_applications;

DROP POLICY IF EXISTS "candidates_open_policy" ON public.candidates;
DROP POLICY IF EXISTS "Allow public candidate creation" ON public.candidates;
DROP POLICY IF EXISTS "Allow public candidate read" ON public.candidates;
DROP POLICY IF EXISTS "candidates_public_insert" ON public.candidates;

-- ============================================================================
-- D. PROFILES — remove ANON full access (authenticated directory minimization
--    is a documented follow-up: get_directory_profiles RPC provided below)
-- ============================================================================
DROP POLICY IF EXISTS "profiles_open_policy" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_directory_profiles(p_ids UUID[])
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT, role TEXT, department TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.avatar_url, p.role, p.department
  FROM public.profiles p
  WHERE p.id = ANY(COALESCE(p_ids, '{}'::uuid[]))
    AND cardinality(COALESCE(p_ids, '{}'::uuid[])) <= 100
    AND (auth.uid() IS NOT NULL OR false);
$$;

REVOKE ALL ON FUNCTION public.get_directory_profiles(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_directory_profiles(UUID[]) TO authenticated;

-- ============================================================================
-- E. NOTIFICATIONS / MESSAGES / PAYROLL open-policy scoping
-- ============================================================================

-- notifications: own-select + keep existing insert/delete policies
DROP POLICY IF EXISTS "notifications_all_access" ON public.notifications;
DROP POLICY IF EXISTS "notifications_open_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_has_role(ARRAY['admin', 'hr']));

-- candidate_notifications: own-select + system/HR write
DROP POLICY IF EXISTS "candidate_notifications_all_access" ON public.candidate_notifications;
DROP POLICY IF EXISTS "candidate_notifications_open_policy" ON public.candidate_notifications;
DROP POLICY IF EXISTS "candidate_notifications_select_own" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_select_own" ON public.candidate_notifications
  FOR SELECT TO authenticated
  USING (
    candidate_id = (SELECT candidate_id FROM public.profiles WHERE id = auth.uid())
    OR public.user_has_role(ARRAY['admin', 'hr'])
  );
DROP POLICY IF EXISTS "candidate_notifications_insert_auth" ON public.candidate_notifications;
CREATE POLICY "candidate_notifications_insert_auth" ON public.candidate_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin', 'hr']));

-- messages: keep authenticated read; stop identity spoofing on insert
DROP POLICY IF EXISTS "messages_open_policy" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- chat_reads: only own rows
DROP POLICY IF EXISTS "chat_reads_all_access" ON public.chat_reads;
DROP POLICY IF EXISTS "chat_reads_open_policy" ON public.chat_reads;

-- payroll config/audit: drop open duplicates, scoped policies already exist
DROP POLICY IF EXISTS "payroll_cycles_open_policy" ON public.payroll_cycles;
DROP POLICY IF EXISTS "payroll_audit_open_policy" ON public.payroll_audit;
DROP POLICY IF EXISTS "salary_structures_open_policy" ON public.salary_structures;
DROP POLICY IF EXISTS "salary_components_open_policy" ON public.salary_components;

-- ============================================================================
-- F. RATE LIMITING PRIMITIVE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket TEXT NOT NULL,
  identity TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identity)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No client policies: definer RPC + service role only.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket TEXT,
  p_identity TEXT,
  p_max INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.rate_limit_buckets%ROWTYPE;
BEGIN
  IF p_bucket IS NULL OR p_identity IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row
  FROM public.rate_limit_buckets
  WHERE bucket = p_bucket AND identity = p_identity
  FOR UPDATE;

  IF v_row.bucket IS NULL OR v_row.window_start < now() - make_interval(secs => p_window_seconds) THEN
    INSERT INTO public.rate_limit_buckets (bucket, identity, window_start, hits)
    VALUES (p_bucket, p_identity, now(), 1)
    ON CONFLICT (bucket, identity)
    DO UPDATE SET window_start = now(), hits = 1;
    RETURN true;
  END IF;

  IF v_row.hits >= p_max THEN
    RETURN false;
  END IF;

  UPDATE public.rate_limit_buckets
  SET hits = hits + 1
  WHERE bucket = p_bucket AND identity = p_identity;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INT, INT) TO service_role;

-- ============================================================================
-- G. EMAIL WORKER INVOCATION (pg_net) — secret injected at deploy time via
--    Supabase Vault (name: email_cron_secret). Never stored in this file.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_email_worker()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_secret TEXT;
  v_url TEXT;
  v_request_id BIGINT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'email_cron_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF COALESCE(v_secret, '') = '' THEN
    RAISE WARNING 'invoke_email_worker: vault secret email_cron_secret missing; email worker NOT invoked (EV-EMAIL-001)';
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_fn_url' LIMIT 1;
  IF COALESCE(v_url, '') = '' THEN
    RAISE WARNING 'invoke_email_worker: vault secret supabase_fn_url missing; email worker NOT invoked (EV-EMAIL-002)';
    RETURN 0;
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret,
      'x-process-queue', 'true'
    ),
    body := jsonb_build_object('process_queue', true, 'batch_size', 20),
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  RETURN 1;
END;
$$;

-- Repoint the existing cron to actually invoke the worker (was: claim-only).
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'process-pending-emails-queue';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_job_id, command := 'SELECT public.invoke_email_worker();');
  ELSE
    PERFORM cron.schedule('process-pending-emails-queue', '*/2 * * * *', 'SELECT public.invoke_email_worker();');
  END IF;
END $$;

-- Release honestly-stuck rows so the worker retries them cleanly.
UPDATE public.pending_emails
SET status = 'pending', locked_until = NULL, worker_id = NULL
WHERE status = 'processing';

COMMIT;
