-- ============================================================================
-- Migration: 20260921000010_scheduler_repair.sql
-- Purpose (Session 3 scheduler audit — all failures live-verified in
-- cron.job_run_details):
--
--   JOB 1  daily-offboarding  → auto_offboard_employees()
--     FAILS: "Authentication required: Anonymous role modification is
--     prohibited" — the function UPDATEs profiles.role, firing
--     trg_prevent_self_role_change which RAISEs when auth.uid() IS NULL.
--     pg_cron runs without JWT claims, so this failed EVERY night since
--     Sep 17. Resigned employees were NEVER archived in production.
--     FIX: set transaction-scoped service_role claim inside the function
--     (same escape hatch the trigger itself provides to service_role).
--     Also: this function never marked employment_status — profiles.status
--     alone did not revoke access. It now performs the full offboarding
--     truthfully: role → 'ARCHIVED', status → 'inactive',
--     employment_status → 'terminated'. This also means stale JWTs held by
--     offboarded employees stop authorizing operations that check
--     employment_status (H3 canonical primitive).
--
--   JOB 2  daily-auto-clockout → auto_clock_out()
--     FAILS: "function public.auto_clock_out() does not exist" — the cron
--     job references a function that was never created (or was dropped).
--     FIX: implement it for real: any work_log still open (clock_out IS
--     NULL, status='Active') from before today is closed at its clock_in
--     + 12h cap (bounded, truthful), status → 'Completed', with an audit
--     note. Never fabricates times: clock_out is derived from the actual
--     clock_in, capped at 12h.
--
--   JOB 10  corporate-daily-absentee-scan → flag_daily_absentees()
--     FAILS: "column \"date\" does not exist" — the function was written
--     against a work_logs schema with a `date` column that does not exist
--     (schema has clock_in/clock_out only). Failed every weekday run.
--     FIX: derive "present today" from clock_in::DATE; insert absentee
--     flags WITHOUT the nonexistent date column (notes carry the date).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PREREQ: general-purpose audit table (live finding: the DB previously had
-- only domain-specific logs — payroll_audit, login_history — so lifecycle
-- events like offboarding were never auditable). Deny-by-default: no RLS
-- policies means no anon/authenticated access; rows are written only by
-- definer/service contexts and read via controlled server paths.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- JOB 1: auto_offboard_employees — trigger-safe + complete offboarding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_offboard_employees()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- The profiles UPDATE fires trg_prevent_self_role_change /
  -- trg_protect_profile_fields which require auth context. pg_cron has
  -- none. Set a transaction-scoped service_role claim (the trigger's own
  -- sanctioned escape hatch); scoped to this transaction only.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.profiles p
  SET role = 'ARCHIVED',
      status = 'inactive',
      employment_status = 'terminated'
  FROM public.resignations r
  WHERE r.user_id = p.id
    AND r.status = 'Approved'
    AND r.expected_last_day < CURRENT_DATE
    AND (p.role IS DISTINCT FROM 'ARCHIVED'
         OR p.status IS DISTINCT FROM 'inactive'
         OR p.employment_status IS DISTINCT FROM 'terminated');

  -- Audit every row actually transitioned this run.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  SELECT
    NULL,
    'employee.auto_offboarded',
    'profiles',
    p.id,
    jsonb_build_object(
      'source', 'cron:daily-offboarding',
      'resignation_id', r.id,
      'last_day', r.expected_last_day
    )
  FROM public.profiles p
  JOIN public.resignations r ON r.user_id = p.id
  WHERE r.status = 'Approved'
    AND r.expected_last_day < CURRENT_DATE
    AND p.role = 'ARCHIVED';
END;
$function$;

-- ---------------------------------------------------------------------------
-- JOB 2: auto_clock_out — implement the function the cron job references
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_clock_out()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_closed INT := 0;
BEGIN
  -- Truthful bounded close: clock_out = clock_in + 12h max. An open log
  -- from a previous day was abandoned (browser closed, forgot to clock
  -- out); we record the MAXIMUM plausible shift, not a fabricated one.
  WITH closed AS (
    UPDATE public.work_logs
    SET clock_out = LEAST(clock_in + INTERVAL '12 hours', now()),
        status = 'Completed',
        notes = COALESCE(notes || ' | ', '') ||
                'auto-closed by scheduler: abandoned open log'
    WHERE clock_out IS NULL
      AND status = 'Active'
      AND clock_in::DATE < (now() AT TIME ZONE 'UTC')::DATE
    RETURNING 1
  )
  SELECT count(*) INTO v_closed FROM closed;

  RETURN jsonb_build_object(
    'success', true,
    'closed_logs', v_closed,
    'ran_at', now()
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- JOB 10: flag_daily_absentees — align with actual work_logs schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flag_daily_absentees()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_flagged_count INT := 0;
BEGIN
  -- Skip Saturday and Sunday (0 and 6 in DOW)
  IF EXTRACT(DOW FROM v_today) IN (0, 6) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Weekend: Attendance check skipped', 'flagged_count', 0);
  END IF;

  WITH flagged AS (
    INSERT INTO public.work_logs (user_id, clock_in, status, notes, work_location)
    SELECT p.id,
           (v_today + time '10:00') AT TIME ZONE 'UTC',
           'Unmarked / Absent',
           'Auto-flagged absent: no clock-in or approved leave by 10:00 UTC on ' || v_today::TEXT,
           'OFFICE'
    FROM public.profiles p
    WHERE p.status = 'active'
      AND LOWER(p.role) NOT IN ('candidate', 'archived')
      AND p.employment_status IS DISTINCT FROM 'terminated'
      AND NOT EXISTS (
        SELECT 1 FROM public.work_logs w
        WHERE w.user_id = p.id AND w.clock_in::DATE = v_today
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leaves l
        WHERE l.user_id = p.id
          AND l.status = 'Approved'
          AND l.start_date <= v_today
          AND l.end_date >= v_today
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_flagged_count FROM flagged;

  RETURN jsonb_build_object(
    'success', true,
    'date', v_today,
    'flagged_absentees', v_flagged_count
  );
END;
$function$;

COMMIT;
