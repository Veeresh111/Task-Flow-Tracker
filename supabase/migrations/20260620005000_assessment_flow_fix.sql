-- ============================================================
-- Add requires_assessment + assessment flow columns
-- ============================================================
ALTER TABLE public.job_forms
  ADD COLUMN IF NOT EXISTS requires_assessment BOOLEAN DEFAULT false;

-- Auto-expire job forms that have passed their expiry date
CREATE OR REPLACE FUNCTION public.auto_expire_job_forms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.job_forms
  SET status = 'Expired', updated_at = now()
  WHERE status = 'Published'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;
