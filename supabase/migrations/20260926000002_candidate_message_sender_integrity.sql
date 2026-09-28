-- ============================================================================
-- Migration: 20260926000002_candidate_message_sender_integrity.sql
-- Purpose: close a live-verified spoofing hole in candidate_hr_messages.
--
-- FINDING (scripts/messaging-roundtrip-probe.mjs, live 2026-09-26):
--   A candidate (role='candidate') could INSERT a row into their own thread
--   with sender_id = <an HR user's id>. The UI renders messages based on
--   sender_id, so the spoofed row would be displayed as if HR had sent it.
--   RLS only constrained candidate_id; sender_id was client-controlled.
--
-- FIX: enforce sender integrity server-side. A sender may only ever write
--   rows whose sender_id equals their own authenticated identity.
--   HR (staff) also writes as themselves — no caller needs to impersonate.
-- ============================================================================

BEGIN;

-- Drop only the sender-related enforcement we add; existing policies remain.
-- The ALL policies (chm_candidate_scope / chm_hr_scope) stay as the coarse
-- scope guard; this trigger adds the fine-grained identity invariant that
-- RLS boolean policies cannot express per-column.

CREATE OR REPLACE FUNCTION public.enforce_chm_sender_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_sender_role text;
BEGIN
  -- Server-side contexts (pg_cron, edge functions, service role) are exempt:
  -- the platform's sanctioned paths already set explicit sender identities.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- The authenticated caller may ONLY write as themselves.
  IF NEW.sender_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Sender integrity violation: authenticated caller may only send messages as themselves.';
  END IF;

  -- Defense in depth: verify the claimed sender exists and is an active
  -- member of the conversation's allowed roles.
  SELECT LOWER(role) INTO v_sender_role
  FROM public.profiles
  WHERE id = NEW.sender_id
    AND status != 'archived';

  IF v_sender_role IS NULL OR v_sender_role NOT IN ('hr', 'admin', 'candidate') THEN
    RAISE EXCEPTION 'Sender integrity violation: sender profile is missing or not authorized to participate.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chm_sender_identity ON public.candidate_hr_messages;
CREATE TRIGGER trg_chm_sender_identity
  BEFORE INSERT ON public.candidate_hr_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chm_sender_identity();

COMMENT ON TRIGGER trg_chm_sender_identity ON public.candidate_hr_messages IS
  'Anti-spoofing: live-verified hole where a candidate could forge sender_id to impersonate HR. Caller may only write as themselves.';

COMMIT;
