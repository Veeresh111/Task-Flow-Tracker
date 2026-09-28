-- ============================================================================
-- Migration: 20260916000001_harden_security_and_eradicate_backdoors.sql
-- Description: Completely eradicates anonymous RLS backdoors (OR auth.uid() IS NULL)
--              and establishes immutable profile field protection against privilege escalation.
-- ============================================================================

BEGIN;

-- 1. PAYSLIPS: Strict RLS (Eliminate anonymous access leak)
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payslips_rbac_select ON public.payslips;
DROP POLICY IF EXISTS payslips_rbac_all ON public.payslips;
DROP POLICY IF EXISTS "payslips_all_access" ON public.payslips;

CREATE POLICY payslips_rbac_select ON public.payslips
  FOR SELECT TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND (
        employee_id = auth.uid()
        OR public.is_admin_or_hr()
        OR public.is_manager_of(employee_id)
      )
    )
  );

CREATE POLICY payslips_rbac_all ON public.payslips
  FOR ALL TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND public.is_admin_or_hr()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND public.is_admin_or_hr()
    )
  );

-- 2. LEAVE_LEDGERS: Strict RLS (Eliminate anonymous access leak)
ALTER TABLE public.leave_ledgers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_ledgers_rbac_select ON public.leave_ledgers;
DROP POLICY IF EXISTS leave_ledgers_rbac_all ON public.leave_ledgers;

CREATE POLICY leave_ledgers_rbac_select ON public.leave_ledgers
  FOR SELECT TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND (
        user_id = auth.uid()
        OR public.is_admin_or_hr()
        OR public.is_manager_of(user_id)
      )
    )
  );

CREATE POLICY leave_ledgers_rbac_all ON public.leave_ledgers
  FOR ALL TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND public.is_admin_or_hr()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND public.is_admin_or_hr()
    )
  );

-- 3. PROFILES: Protected Fields Trigger (Privilege Escalation Wall)
-- Disallow clients from mutating protected fields unless caller is service_role or admin/hr
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Service role always permitted
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- If unauthenticated, reject mutation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update user profiles.';
  END IF;

  SELECT LOWER(COALESCE(role, 'employee')) INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid() AND status != 'archived';

  -- Check if any protected field changed
  IF (OLD.role IS DISTINCT FROM NEW.role) OR
     (OLD.payroll_ctc IS DISTINCT FROM NEW.payroll_ctc) OR
     (OLD.department IS DISTINCT FROM NEW.department) OR
     (OLD.team_lead_id IS DISTINCT FROM NEW.team_lead_id) OR
     (OLD.employment_status IS DISTINCT FROM NEW.employment_status) OR
     (OLD.candidate_id IS DISTINCT FROM NEW.candidate_id) OR
     (OLD.status IS DISTINCT FROM NEW.status) THEN
     
    -- Only Admin and HR are permitted to modify these organizational fields
    IF v_caller_role NOT IN ('admin', 'hr') THEN
      RAISE EXCEPTION '403 Forbidden: You do not have permission to modify organizational profile fields (role, salary, department, status).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_immutable_fields();

-- 4. Secure prevent_self_role_change function
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required: Anonymous role modification is prohibited.';
    END IF;

    IF NOT public.user_has_role(ARRAY['admin', 'hr']) THEN
      RAISE EXCEPTION 'Permission denied: You cannot change your own role. Only administrators can modify roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
