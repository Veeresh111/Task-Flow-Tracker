-- Migration: 20260916000012_fix_profile_trigger_column.sql
-- Fix: Remove non-existent employee_id column from protect_profile_immutable_fields trigger

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
     (OLD.status IS DISTINCT FROM NEW.status) THEN
     
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

COMMIT;
