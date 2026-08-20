-- ============================================================
-- Restrict Service-Role RPCs
--
-- Secures SECURITY DEFINER functions that are ONLY called
-- from edge functions (not from frontend). These should be
-- callable exclusively by the service_role to prevent any
-- direct invocation from anon or authenticated users.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'auto_expire_assessment_tokens'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() TO service_role';
  END IF;
END $$;
