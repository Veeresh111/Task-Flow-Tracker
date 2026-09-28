-- Migration: 20260916000011_harden_profile_and_offer_invariants.sql
-- 1. Upgrade protect_profile_immutable_fields() to cover all organizational/system columns
-- 2. Restrict direct client UPDATE on offer_letters (only admin, hr, or service_role)
-- 3. Restrict direct client UPDATE on job_applications (only admin, hr, or service_role)
-- 4. Ensure candidates and non-privileged employees cannot modify offer_letters, job_applications, or organizational profile fields via PostgREST

BEGIN;

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
  FROM public.profiles
  WHERE id = auth.uid() AND status != 'archived';

  -- Check if any protected organizational or system field changed
  IF (OLD.role IS DISTINCT FROM NEW.role) OR
     (OLD.payroll_ctc IS DISTINCT FROM NEW.payroll_ctc) OR
     (OLD.department IS DISTINCT FROM NEW.department) OR
     (OLD.team_name IS DISTINCT FROM NEW.team_name) OR
     (OLD.team_lead_id IS DISTINCT FROM NEW.team_lead_id) OR
     (OLD.employment_status IS DISTINCT FROM NEW.employment_status) OR
     (OLD.employment_start_date IS DISTINCT FROM NEW.employment_start_date) OR
     (OLD.candidate_id IS DISTINCT FROM NEW.candidate_id) OR
     (OLD.status IS DISTINCT FROM NEW.status) OR
     (OLD.employee_id IS DISTINCT FROM NEW.employee_id) THEN
     
    -- Only Admin and HR are permitted to modify these organizational fields
    IF v_caller_role NOT IN ('admin', 'hr') THEN
      RAISE EXCEPTION '403 Forbidden: You do not have permission to modify organizational profile fields (role, salary, department, team, status).';
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

-- Ensure offer_letters can ONLY be modified by admin or hr
ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offer_letters_update_hr_only" ON public.offer_letters;
DROP POLICY IF EXISTS "offer_letters_insert_update_hr" ON public.offer_letters;

CREATE POLICY "offer_letters_insert_update_hr" ON public.offer_letters
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- Ensure job_applications can ONLY be updated by admin or hr
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "applications_update_hr" ON public.job_applications;

CREATE POLICY "applications_update_hr" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

COMMIT;
