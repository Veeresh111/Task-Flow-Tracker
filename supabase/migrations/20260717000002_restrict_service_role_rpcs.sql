-- ============================================================
-- Restrict Service-Role RPCs
--
-- Secures SECURITY DEFINER functions that are ONLY called
-- from edge functions (not from frontend). These should be
-- callable exclusively by the service_role to prevent any
-- direct invocation from anon or authenticated users.
-- ============================================================

-- auto_expire_assessment_tokens() is called only by the
-- expire-tokens edge function. No frontend code calls it.
REVOKE EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_assessment_tokens() TO service_role;
