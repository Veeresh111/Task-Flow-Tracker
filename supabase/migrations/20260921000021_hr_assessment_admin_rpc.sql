-- ============================================================================
-- Migration: 20260921000021_hr_assessment_admin_rpc.sql
-- Purpose: with questions column-SELECT removed from anon AND authenticated
--   (migration 20 — closes the answer-key wire leak), HR assessment
--   management needs a server path to full assessment content. This RPC is
--   SECURITY DEFINER but gated to admin/hr via user_has_role, so it is not
--   an RLS bypass: it grants exactly the HR surface the UI requires.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_assessment_full(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(a)
  FROM public.assessments a
  WHERE a.id = p_id
    AND public.user_has_role(ARRAY['admin', 'hr']);
$function$;

CREATE OR REPLACE FUNCTION public.list_assessments_admin()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM public.assessments a
  WHERE public.user_has_role(ARRAY['admin', 'hr']);
$function$;

REVOKE ALL ON FUNCTION public.get_assessment_full(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_assessments_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_assessment_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assessments_admin() TO authenticated;

COMMIT;
