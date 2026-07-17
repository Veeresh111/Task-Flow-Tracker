-- Phase A: Add selections column to assessment_attempts for server-side answer storage
ALTER TABLE public.assessment_attempts
  ADD COLUMN IF NOT EXISTS selections JSONB DEFAULT NULL;

COMMENT ON COLUMN public.assessment_attempts.selections IS 'Stores candidate answers server-side for audit trail';
