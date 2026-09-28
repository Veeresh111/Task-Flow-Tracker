-- ============================================================================
-- 20260926000003 — Scheduler RPC Privilege Lockdown
-- ============================================================================
-- LIVE-PROVEN HOLE (session 8, 2026-09-26):
--   An UNAUTHENTICATED PostgREST call to
--   auto_process_monthly_payroll_idempotent(8, 2026) returned success:true.
--   Root cause: proacl of the four scheduler RPCs granted EXECUTE to
--   PUBLIC (=X/postgres), anon, and authenticated.
--   These functions are invoked exclusively by pg_cron (runs as `postgres`).
--   The frontend has ZERO call sites (verified by code search — only the
--   fully-mocked unit test touches them via supabase-js).
--
-- Fix: revoke from PUBLIC/anon/authenticated. Explicitly retain service_role
-- (edge-function paths, defense for future callers). postgres keeps owner
-- EXECUTE so pg_cron jobs are unaffected.
--
-- Adversarial acceptance (post-deploy):
--   anon PostgREST RPC  -> rejected (404/42501/P0001), cycle count unchanged.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.auto_process_monthly_payroll_idempotent(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accrue_monthly_leaves_and_anniversaries()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_daily_absentees()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_fiscal_year_reset(integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.auto_process_monthly_payroll_idempotent(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.accrue_monthly_leaves_and_anniversaries()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_daily_absentees()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_fiscal_year_reset(integer)
  TO service_role;
