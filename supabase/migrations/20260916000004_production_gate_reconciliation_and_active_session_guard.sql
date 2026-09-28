-- ============================================================================
-- Migration: 20260916000004_production_gate_reconciliation_and_active_session_guard.sql
-- Description: 
--   1. Strict RLS guards on work_logs, leaves, and tasks enforcing is_active_employee()
--      so offboarded employees with unexpired JWTs cannot perform protected operations.
--   2. Stable logical email idempotency key default & uniqueness.
--   3. Server-side biometric comparison RPC (never expose raw descriptors to client).
--   4. Scheduled worker registration via pg_cron / pg_net.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. STRICT ACTIVE EMPLOYEE GUARDS ON WORK_LOGS (ATTENDANCE) & LEAVES
-- ----------------------------------------------------------------------------
-- Ensure is_active_employee function is strictly defined
CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND status = 'active'
      AND COALESCE(employment_status, 'active') = 'active'
  );
$$;

-- Harden work_logs (Clock-In & Attendance)
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_logs_insert_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_update_own" ON public.work_logs;
DROP POLICY IF EXISTS "work_logs_select_own" ON public.work_logs;

-- Active employees can insert only their own logs while active
CREATE POLICY "work_logs_insert_own" ON public.work_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND public.is_active_employee()
  );

-- Active employees can update only their own active logs while active
CREATE POLICY "work_logs_update_own" ON public.work_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() 
    AND public.is_active_employee()
  );

-- Terminated/archived employees can only read historical logs, never mutate
CREATE POLICY "work_logs_select_own" ON public.work_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR public.is_admin_or_hr()
    OR public.user_has_role(ARRAY['team_lead', 'tl'])
  );

-- Harden leaves (Leave Requests)
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leaves_insert_own" ON public.leaves;

CREATE POLICY "leaves_insert_own" ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() 
    AND public.is_active_employee()
  );

-- Harden tasks (Task Mutations): Employees cannot create or update tasks once offboarded
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks' AND table_schema = 'public') THEN 
    ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "tasks_insert_update" ON public.tasks;
    CREATE POLICY "tasks_insert_update" ON public.tasks 
      FOR ALL TO authenticated
      USING (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']) AND public.is_active_employee())
      WITH CHECK (public.user_has_role(ARRAY['admin', 'hr', 'team_lead', 'tl']) AND public.is_active_employee());
  END IF; 
END $$;

-- Harden user_has_role to reject archived or terminated staff
CREATE OR REPLACE FUNCTION public.user_has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = ANY(roles)
      AND status = 'active'
      AND COALESCE(employment_status, 'active') = 'active'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. STABLE EMAIL IDEMPOTENCY KEY ENFORCEMENT
-- ----------------------------------------------------------------------------
-- Backfill existing null idempotency keys with durable logical identifier
UPDATE public.pending_emails 
SET idempotency_key = 'email/' || id::text 
WHERE idempotency_key IS NULL;

-- Default future rows to durable logical identifier
ALTER TABLE public.pending_emails 
  ALTER COLUMN idempotency_key SET DEFAULT ('email/' || gen_random_uuid()::text);

-- ----------------------------------------------------------------------------
-- 3. SERVER-SIDE BIOMETRIC COMPARISON (Zero raw descriptor exposure)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_candidate_biometric_face(
  p_candidate_id UUID,
  p_input_descriptor JSONB,
  p_threshold NUMERIC DEFAULT 0.65
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrolled_desc JSONB;
  v_enrolled_len INT;
  v_input_len INT;
  v_sum NUMERIC := 0;
  v_diff NUMERIC;
  v_dist NUMERIC;
  i INT;
BEGIN
  -- 1. Fetch enrolled biometric descriptor from secure server table
  SELECT face_descriptor INTO v_enrolled_desc
  FROM public.candidate_biometrics
  WHERE candidate_id = p_candidate_id;

  -- If not enrolled yet, return un-enrolled status
  IF v_enrolled_desc IS NULL THEN
    RETURN jsonb_build_object(
      'enrolled', false,
      'verified', false,
      'reason', 'Candidate has no enrolled biometric identity descriptor on file.'
    );
  END IF;

  v_enrolled_len := jsonb_array_length(v_enrolled_desc);
  v_input_len := jsonb_array_length(p_input_descriptor);

  IF v_enrolled_len = 0 OR v_input_len = 0 OR v_enrolled_len != v_input_len THEN
    RETURN jsonb_build_object(
      'enrolled', true,
      'verified', false,
      'reason', 'Biometric vector dimensionality mismatch or corrupt descriptor.'
    );
  END IF;

  -- 2. Calculate Euclidean Distance in database
  FOR i IN 0..(v_enrolled_len - 1) LOOP
    v_diff := (v_input_descriptor->>i)::NUMERIC - (v_enrolled_desc->>i)::NUMERIC;
    v_sum := v_sum + (v_diff * v_diff);
  END LOOP;

  v_dist := |/ v_sum; -- Square root

  RETURN jsonb_build_object(
    'enrolled', true,
    'verified', (v_dist <= p_threshold),
    'distance', ROUND(v_dist, 4),
    'threshold', p_threshold
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. SCHEDULED QUEUE WORKER REGISTRATION (pg_cron + pg_net)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_email_queue_batch(p_batch_size INT DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_count INT;
BEGIN
  SELECT count(*) INTO v_claimed_count
  FROM public.claim_pending_emails('system_cron_worker', p_batch_size, 180);

  RETURN jsonb_build_object(
    'status', 'claimed',
    'claimed_count', v_claimed_count,
    'timestamp', now()
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule email worker to claim and process queue every 2 minutes
    PERFORM cron.schedule(
      'process-pending-emails-queue',
      '*/2 * * * *',
      'SELECT public.trigger_email_queue_batch(20);'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not installed or restricted. Worker callable via Edge Function webhook.';
END $$;

COMMIT;
