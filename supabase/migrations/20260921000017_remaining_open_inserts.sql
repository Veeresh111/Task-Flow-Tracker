-- ============================================================================
-- Migration: 20260921000017_remaining_open_inserts.sql
-- Purpose (follow-up to 16 — the last unconditional WITH CHECK(true)
-- policies found by the rescan):
--
--   1. candidate_applications."Allow public application workflow creation"
--      — no frontend writer exists (public flow uses job_applications +
--      submit_public_application RPC). Dead open path → drop.
--   2. recruitment_posts."recruitment_posts_insert" — no frontend writer;
--      the table is public-read for careers. Unconditional INSERT → drop.
--   3. job_forms."Allow HR to publish forms" — unconditional INSERT
--      (not actually HR-checked). HR writers exist (four pages) and are
--      covered by job_forms_hr_write (user_has_role). Duplicate+weaker →
--      drop.
--   4. recruitment_announcements."recruitment_announcements_insert" —
--      unconditional INSERT; HR writer exists and is covered by
--      announcements_hr_write. Drop.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Allow public application workflow creation" ON public.candidate_applications;
DROP POLICY IF EXISTS "recruitment_posts_insert" ON public.recruitment_posts;
DROP POLICY IF EXISTS "Allow HR to publish forms" ON public.job_forms;
DROP POLICY IF EXISTS "recruitment_announcements_insert" ON public.recruitment_announcements;

COMMIT;
