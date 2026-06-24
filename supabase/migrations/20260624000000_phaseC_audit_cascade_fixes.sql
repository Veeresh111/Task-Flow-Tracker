-- Phase C: Audit trail system + CASCADE constraint hardening

-- ============================================================
-- PART 1: AUDIT LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_columns TEXT[],
  severity TEXT DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_log_select_admin_hr" ON public.audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_old_json JSONB;
  v_new_json JSONB;
  v_changed TEXT[];
BEGIN
  BEGIN
    v_actor_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;
  BEGIN
    v_actor_role := NULL;
  EXCEPTION WHEN OTHERS THEN
    v_actor_role := NULL;
  END;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_json := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_json := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_old_json) old_vals
    JOIN jsonb_each(v_new_json) new_vals USING (key)
    WHERE old_vals.value IS DISTINCT FROM new_vals.value;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, old_values, new_values, changed_columns)
  VALUES (
    v_actor_id,
    v_actor_role,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_old_json,
    v_new_json,
    v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit triggers to P0 tables
CREATE TRIGGER trg_profiles_audit AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_job_applications_audit AFTER INSERT OR UPDATE OR DELETE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_candidates_audit AFTER INSERT OR UPDATE OR DELETE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_offer_letters_audit AFTER INSERT OR UPDATE OR DELETE ON public.offer_letters
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_interview_sessions_audit AFTER INSERT OR UPDATE OR DELETE ON public.interview_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_assessment_attempts_audit AFTER INSERT OR UPDATE OR DELETE ON public.assessment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_work_logs_audit AFTER INSERT OR UPDATE OR DELETE ON public.work_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_leaves_audit AFTER INSERT OR UPDATE OR DELETE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_complaints_audit AFTER INSERT OR UPDATE OR DELETE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_background_verifications_audit AFTER INSERT OR UPDATE OR DELETE ON public.background_verifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ============================================================
-- PART 2: HARDEN DANGEROUS ON DELETE CASCADE CONSTRAINTS
-- ============================================================

DO $$
BEGIN
  -- profiles → SET NULL for critical business tables (preserve records on user deletion)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'resignations_user_id_fkey' AND table_schema = 'public') THEN
    ALTER TABLE public.resignations DROP CONSTRAINT resignations_user_id_fkey;
  END IF;
  ALTER TABLE public.resignations ADD CONSTRAINT resignations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'employee_attrition_employee_id_fkey' AND table_schema = 'public') THEN
    ALTER TABLE public.employee_attrition DROP CONSTRAINT employee_attrition_employee_id_fkey;
  END IF;
  ALTER TABLE public.employee_attrition ADD CONSTRAINT employee_attrition_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'work_logs_user_id_fkey' AND table_schema = 'public') THEN
    ALTER TABLE public.work_logs DROP CONSTRAINT work_logs_user_id_fkey;
  END IF;
  ALTER TABLE public.work_logs ADD CONSTRAINT work_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_assigned_to_fkey' AND table_schema = 'public') THEN
    ALTER TABLE public.tasks DROP CONSTRAINT tasks_assigned_to_fkey;
  END IF;
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'leaves_user_id_fkey' AND table_schema = 'public') THEN
    ALTER TABLE public.leaves DROP CONSTRAINT leaves_user_id_fkey;
  END IF;
  ALTER TABLE public.leaves ADD CONSTRAINT leaves_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'complaints_user_id_fkey' AND table_schema = 'public') THEN
    ALTER TABLE public.complaints DROP CONSTRAINT complaints_user_id_fkey;
  END IF;
  ALTER TABLE public.complaints ADD CONSTRAINT complaints_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- candidates → SET NULL for child records that should survive candidate deletion
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_offer_letters_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.offer_letters DROP CONSTRAINT fk_offer_letters_candidate;
  END IF;
  ALTER TABLE public.offer_letters ADD CONSTRAINT fk_offer_letters_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_background_verifications_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.background_verifications DROP CONSTRAINT fk_background_verifications_candidate;
  END IF;
  ALTER TABLE public.background_verifications ADD CONSTRAINT fk_background_verifications_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE SET NULL;

  -- job_applications → SET NULL for offer_letters
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_offer_letters_application' AND table_schema = 'public') THEN
    ALTER TABLE public.offer_letters DROP CONSTRAINT fk_offer_letters_application;
  END IF;
  ALTER TABLE public.offer_letters ADD CONSTRAINT fk_offer_letters_application FOREIGN KEY (application_id) REFERENCES public.job_applications(id) ON DELETE SET NULL;

  -- candidates → RESTRICT for critical referential integrity
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_job_applications_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.job_applications DROP CONSTRAINT fk_job_applications_candidate;
  END IF;
  ALTER TABLE public.job_applications ADD CONSTRAINT fk_job_applications_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE RESTRICT;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_candidate_onboarding_candidate' AND table_schema = 'public') THEN
    ALTER TABLE public.candidate_onboarding DROP CONSTRAINT fk_candidate_onboarding_candidate;
  END IF;
  ALTER TABLE public.candidate_onboarding ADD CONSTRAINT fk_candidate_onboarding_candidate FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE RESTRICT;
END $$;
