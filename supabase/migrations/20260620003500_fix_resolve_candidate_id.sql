-- ============================================================
-- FIX: resolve_candidate_id referenced c.profile_id
-- which does not exist on the candidates table
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_candidate_id(input_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.candidates WHERE id = input_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT candidate_id INTO v_id FROM public.profiles WHERE id = input_id AND candidate_id IS NOT NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  RETURN input_id;
END;
$$;
