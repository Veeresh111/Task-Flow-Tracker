-- ============================================================================
-- Migration: 20260921000011_offboarding_role_vocabulary.sql
-- Purpose (live-execution finding on top of migration 10):
--   auto_offboard_employees() fails at runtime: profiles_role_check only
--   allows ('admin','team_lead','employee','hr','candidate') — the original
--   design's 'ARCHIVED' role was NEVER a legal value, so offboarding could
--   not have succeeded even without the auth-context failure. (The cron job
--   has been failing nightly for both reasons.)
--   FIX: add unprivileged 'archived' to the role vocabulary. 'archived'
--   appears in no privilege list (admin/hr/team_lead checks), so it is
--   inherently non-authorizing; combined with status='inactive' and
--   employment_status='terminated' it completes truthful offboarding.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'team_lead'::text, 'employee'::text,
                           'hr'::text, 'candidate'::text, 'archived'::text]));

CREATE OR REPLACE FUNCTION public.auto_offboard_employees()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- pg_cron has no JWT; profile triggers require auth context. Set the
  -- transaction-scoped service_role claim (the triggers' sanctioned
  -- escape hatch); scoped to this transaction only.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.profiles p
  SET role = 'archived',
      status = 'inactive',
      employment_status = 'terminated'
  FROM public.resignations r
  WHERE r.user_id = p.id
    AND r.status = 'Approved'
    AND r.expected_last_day < CURRENT_DATE
    AND (p.role IS DISTINCT FROM 'archived'
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
    AND p.role = 'archived';
END;
$function$;

COMMIT;
