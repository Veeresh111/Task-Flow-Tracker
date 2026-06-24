-- ============================================================
-- Add lifecycle columns to job_forms for corporate-grade
-- Draft → Published → Closed → Archived workflow
-- ============================================================
ALTER TABLE public.job_forms
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TRIGGER trg_job_forms_updated_at
  BEFORE UPDATE ON public.job_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.job_forms SET status = 'Draft' WHERE status IS NULL;
