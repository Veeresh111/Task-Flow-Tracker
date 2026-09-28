-- ============================================================================
-- Migration: 20260921000033_biometric_verify_acl_hardening.sql
-- Purpose (Session 6): the migration-32 REVOKE ... FROM anon, authenticated
--   did not close the legacy client-id verify oracle because function
--   privileges default to PUBLIC (proacl '=X/postgres'). Postgres ORs grants;
--   any single grant wins. Revoke from PUBLIC (and anon/authenticated for
--   explicitness), re-grant to service_role only. The identity oracle
--   ("is this face candidate X?") is therefore closed for browsers; the
--   token-bound variant (migration 32) is the only browser path.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.verify_candidate_biometric_face(uuid, jsonb, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_candidate_biometric_face(uuid, jsonb, numeric)
  TO service_role;

COMMIT;
