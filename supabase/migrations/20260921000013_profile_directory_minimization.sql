-- ============================================================================
-- Migration: 20260921000013_profile_directory_minimization.sql
-- Purpose (B4 follow-up — completes the profile RLS reconstruction):
--
--   LIVE FINDING: policy `Authenticated users full access profiles` is a
--   permissive ALL policy (USING + WITH CHECK = auth.role()='authenticated').
--   Under Postgres, permissive policies OR together, so this policy does not
--   merely add read exposure — it GRANTS EVERY AUTHENTICATED USER
--   UPDATE (on fields the field-protection triggers do not guard) AND
--   DELETE on ANY profile row, including the admin's, plus INSERT with
--   arbitrary role/department values. Current distribution: 567
--   employees/candidates/leads vs 1 admin + 1 hr.
--
--   The field-protection triggers cover sensitive UPDATE fields (role,
--   payroll_ctc, department, employment_status, ...), but DELETE and INSERT
--   were fully exposed.
--
--   FIX:
--   1. Drop the ALL policy.
--   2. Role-scoped policies remain: admin/hr read+update, admin delete,
--      team-lead department-scoped read, self read/update, self insert
--      (admin_insert_profiles WITH CHECK includes auth.uid() = id — covers
--      OAuth first-login profile creation), and a NEW hr/admin insert
--      policy for the invite flow.
--   3. Provide the two missing server projections that consumers needed the
--      open policy for:
--        - get_profile_ids_for_roles(text[]): notification fan-out
--          (id + role only, enumeration-gated, bounded).
--        - consumers of team-lead names use existing
--          get_directory_profiles(uuid[]) (id, name, avatar_url, role,
--          department for authenticated callers).
-- ============================================================================

BEGIN;

-- 1. Remove the blanket ALL policy (UPDATE/DELETE/INSERT/SELECT for every
--    authenticated user).
DROP POLICY IF EXISTS "Authenticated users full access profiles" ON public.profiles;

-- 2. HR invite flow needs INSERT on profiles (admin already had it).
DROP POLICY IF EXISTS "hr_insert_profiles" ON public.profiles;
CREATE POLICY "hr_insert_profiles"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (user_has_role(ARRAY['admin'::text, 'hr'::text]));

-- 3. Notification fan-out projection: minimal columns, enumeration-gated.
--    Non-staff callers may only resolve STAFF role lists (the notify-HR
--    pattern). Privileged callers may resolve any role list. Bounded at 500
--    rows; returns id + role only.
CREATE OR REPLACE FUNCTION public.get_profile_ids_for_roles(p_roles text[])
 RETURNS TABLE(id uuid, role text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.role
  FROM public.profiles p
  WHERE p.role = ANY(p_roles)
    AND cardinality(p_roles) BETWEEN 1 AND 20
    AND (
      user_has_role(ARRAY['admin'::text, 'hr'::text, 'team_lead'::text, 'tl'::text])
      OR (
        auth.uid() IS NOT NULL
        AND p_roles <@ ARRAY['hr'::text, 'admin'::text, 'team_lead'::text]
      )
    )
  LIMIT 500;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_ids_for_roles(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_ids_for_roles(text[]) TO authenticated;

-- 4. Harden get_user_department (SECURITY DEFINER previously without a
--    pinned search_path).
CREATE OR REPLACE FUNCTION public.get_user_department()
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT department FROM public.profiles WHERE id = auth.uid();
$function$;

COMMIT;
