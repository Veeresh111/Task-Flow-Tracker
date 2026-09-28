-- ============================================================================
-- 20260927000008 — Scope offer-creation RPC grants to authenticated
-- ============================================================================
-- create_offer_for_application was created with the default PUBLIC EXECUTE
-- grant. The function internally rejects unauthenticated callers, but grants
-- should express intent: only authenticated (HR/Admin) sessions may invoke it.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_offer_for_application(uuid, numeric, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_offer_for_application(uuid, numeric, date, text)
  TO authenticated;
