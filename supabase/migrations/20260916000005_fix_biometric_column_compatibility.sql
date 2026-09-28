-- ============================================================================
-- Migration: 20260916000005_fix_biometric_column_compatibility.sql
-- Description: Align candidate_biometrics column names (descriptor and face_descriptor)
-- ============================================================================

BEGIN;

-- Ensure candidate_biometrics has both face_descriptor and descriptor mapped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'candidate_biometrics' AND column_name = 'face_descriptor'
  ) THEN
    ALTER TABLE public.candidate_biometrics ADD COLUMN face_descriptor JSONB;
    UPDATE public.candidate_biometrics SET face_descriptor = descriptor WHERE face_descriptor IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'candidate_biometrics' AND column_name = 'descriptor'
  ) THEN
    ALTER TABLE public.candidate_biometrics ADD COLUMN descriptor JSONB;
    UPDATE public.candidate_biometrics SET descriptor = face_descriptor WHERE descriptor IS NULL;
  END IF;
END $$;

-- Update verify_candidate_biometric_face RPC to check either column gracefully
CREATE OR REPLACE FUNCTION public.verify_candidate_biometric_face(
  p_candidate_id UUID,
  p_input_descriptor JSONB,
  p_threshold NUMERIC DEFAULT 0.65
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrolled_desc JSONB;
  v_enrolled_len INT;
  v_input_len INT;
  v_sum NUMERIC := 0;
  v_diff NUMERIC;
  v_dist NUMERIC;
  i INT;
BEGIN
  -- 1. Fetch enrolled biometric descriptor from secure server table
  SELECT COALESCE(face_descriptor, descriptor) INTO v_enrolled_desc
  FROM public.candidate_biometrics
  WHERE candidate_id = p_candidate_id;

  -- If not enrolled yet, return un-enrolled status
  IF v_enrolled_desc IS NULL THEN
    RETURN jsonb_build_object(
      'enrolled', false,
      'verified', false,
      'reason', 'Candidate has no enrolled biometric identity descriptor on file.'
    );
  END IF;

  v_enrolled_len := jsonb_array_length(v_enrolled_desc);
  v_input_len := jsonb_array_length(p_input_descriptor);

  IF v_enrolled_len = 0 OR v_input_len = 0 OR v_enrolled_len != v_input_len THEN
    RETURN jsonb_build_object(
      'enrolled', true,
      'verified', false,
      'reason', 'Biometric vector dimensionality mismatch or corrupt descriptor.'
    );
  END IF;

  -- 2. Calculate Euclidean Distance in database
  FOR i IN 0..(v_enrolled_len - 1) LOOP
    v_diff := (v_input_descriptor->>i)::NUMERIC - (v_enrolled_desc->>i)::NUMERIC;
    v_sum := v_sum + (v_diff * v_diff);
  END LOOP;

  v_dist := |/ v_sum; -- Square root

  RETURN jsonb_build_object(
    'enrolled', true,
    'verified', (v_dist <= p_threshold),
    'distance', ROUND(v_dist, 4),
    'threshold', p_threshold
  );
END;
$$;

COMMIT;
