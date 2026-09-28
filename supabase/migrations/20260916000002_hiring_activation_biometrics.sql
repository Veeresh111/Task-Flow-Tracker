-- ============================================================================
-- Migration: 20260916000002_hiring_activation_biometrics.sql
-- Description: Establishes idempotent hiring operations, token-hashed employee
--              activations, and secure server-side biometric storage.
-- ============================================================================

BEGIN;

-- 1. Idempotent Candidate Hiring Operations Table
CREATE TABLE IF NOT EXISTS public.candidate_hiring_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  auth_user_id UUID,
  department TEXT NOT NULL,
  team_lead_id UUID,
  annual_ctc NUMERIC(12, 2) NOT NULL DEFAULT 0,
  joining_date DATE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  failure_reason TEXT,
  hired_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hiring_application UNIQUE (application_id)
);

ALTER TABLE public.candidate_hiring_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hiring_ops_admin_hr ON public.candidate_hiring_operations;
CREATE POLICY hiring_ops_admin_hr ON public.candidate_hiring_operations
  FOR ALL TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND public.is_admin_or_hr())
  )
  WITH CHECK (
    auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND public.is_admin_or_hr())
  );

-- 2. Secure Token-Hashed Employee Activations Table
CREATE TABLE IF NOT EXISTS public.employee_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Consumed', 'Revoked', 'Expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_activations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_activations_policy ON public.employee_activations;
CREATE POLICY employee_activations_policy ON public.employee_activations
  FOR ALL TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND public.is_admin_or_hr())
  )
  WITH CHECK (
    auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND public.is_admin_or_hr())
  );

-- 3. Protected Server-Side Biometric Descriptors Table
CREATE TABLE IF NOT EXISTS public.candidate_biometrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  descriptor JSONB NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_candidate_biometrics UNIQUE (candidate_id)
);

ALTER TABLE public.candidate_biometrics ENABLE ROW LEVEL SECURITY;
-- Strict: Service role only can access raw biometric descriptors; no direct client SELECT
DROP POLICY IF EXISTS biometrics_service_role ON public.candidate_biometrics;
CREATE POLICY biometrics_service_role ON public.candidate_biometrics
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Ensure candidates.profile_id column exists and has index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'candidates' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE public.candidates ADD COLUMN profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidates_profile_id ON public.candidates(profile_id);
CREATE INDEX IF NOT EXISTS idx_employee_activations_token_hash ON public.employee_activations(token_hash);
CREATE INDEX IF NOT EXISTS idx_employee_activations_user_id ON public.employee_activations(user_id);

COMMIT;
