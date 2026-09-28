-- ============================================================================
-- Migration: 20260921000034_recruitment_content_rls_closure.sql
-- Purpose (Session 6, P21 final rescan): recruitment_posts and
--   recruitment_announcements carried UNCONDITIONAL authenticated
--   DELETE/UPDATE policies (USING true) alongside the intended
--   admin/hr-gated ALL policies. Permissive policies OR together, so any
--   authenticated user (employee/candidate) could delete or rewrite
--   recruitment content. Drop the unconditional policies; the role-gated
--   ALL policies (user_has_role(['admin','hr'])) remain the only write path.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS recruitment_posts_delete ON public.recruitment_posts;
DROP POLICY IF EXISTS recruitment_posts_update ON public.recruitment_posts;

DROP POLICY IF EXISTS recruitment_announcements_delete ON public.recruitment_announcements;
DROP POLICY IF EXISTS recruitment_announcements_update ON public.recruitment_announcements;

COMMIT;
