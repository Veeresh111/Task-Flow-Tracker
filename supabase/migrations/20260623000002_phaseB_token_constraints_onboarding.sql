-- Phase B: Assessment token integrity + candidates table enhancements

-- 1. Remove duplicate tokens (keep the earliest created)
DELETE FROM public.assessment_tokens a
USING (
  SELECT token, MIN(created_at) as min_created
  FROM public.assessment_tokens
  GROUP BY token
  HAVING COUNT(*) > 1
) b
WHERE a.token = b.token AND a.created_at > b.min_created;

-- Add UNIQUE constraint on token (B2)
ALTER TABLE public.assessment_tokens
  ADD CONSTRAINT IF NOT EXISTS uq_assessment_tokens_token UNIQUE (token);

-- 2. Add joined_at column to candidates table (B10)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.candidates.joined_at IS 'Set when candidate is onboarded to employee';
