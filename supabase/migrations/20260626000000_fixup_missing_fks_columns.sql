-- =============================================================================
-- Fixup: Missing foreign keys and columns identified during deployment testing
-- =============================================================================

-- 1. Add FK from offer_letters.candidate_id → candidates.id
--    (so Supabase can infer the relationship for nested joins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_offer_letters_candidate'
      AND table_schema = 'public'
      AND table_name = 'offer_letters'
  ) THEN
    ALTER TABLE public.offer_letters
      ADD CONSTRAINT fk_offer_letters_candidate
      FOREIGN KEY (candidate_id) REFERENCES public.candidates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Add missing columns to assessment_tokens for proctoring and completion tracking
ALTER TABLE public.assessment_tokens
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proctor_log JSONB DEFAULT '[]'::jsonb;


