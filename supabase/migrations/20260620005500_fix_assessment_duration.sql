-- ============================================================
-- Fix existing assessments with invalid duration_minutes values
-- Sets a minimum of 2 minutes (120 seconds) for all existing records
-- and prevents future invalid values with a CHECK constraint
-- ============================================================

-- First, log how many records will be affected (for audit trail)
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count
  FROM public.assessments
  WHERE duration_minutes IS NULL
     OR duration_minutes < 2
     OR duration_minutes = 0;

  RAISE NOTICE 'Fixing % assessment records with invalid duration_minutes', affected_count;
END $$;

-- Fix NULL, zero, or sub-2-minute durations to a reasonable default (30 min)
UPDATE public.assessments
SET duration_minutes = 30
WHERE duration_minutes IS NULL
   OR duration_minutes < 2
   OR duration_minutes = 0;

-- Add CHECK constraint to prevent future invalid values
-- Allows NULL (for drafts/unsaved) but requires >= 2 if set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'assessments_duration_minutes_check'
      AND table_schema = 'public'
      AND table_name = 'assessments'
  ) THEN
    ALTER TABLE public.assessments
    ADD CONSTRAINT assessments_duration_minutes_check
    CHECK (duration_minutes IS NULL OR duration_minutes >= 2);
  END IF;
END $$;
