-- ============================================================================
-- Migration: 20260921000030_leave_ledger_consumption_reconciliation.sql
-- Purpose (Session 5, reviewer item: leave ledger ↔ leaves ↔ payroll):
--   AUDIT FINDING (live-verified): the leave system was a split-brain.
--   - Accrual (mig 14/15) credits leave_ledgers per employee per month.
--   - Payroll (auto_process_monthly_payroll_idempotent) counts LWP from
--     approved `leaves` rows (unpaid types only), independent of ledgers.
--   - NOTHING decremented the ledger on leave approval: approved leave had
--     no authoritative balance effect. The ledger read like a healthy
--     balance while consumption was invisible.
--   FIX: AFTER UPDATE trigger on `leaves` — on transition TO 'Approved',
--   atomically append one CONSUMPTION row to leave_ledgers in the SAME
--   transaction as the approval. Rejections clean up any prior consumption
--   (reversal row). Negative-resulting balance consumption is rejected with
--   an explicit error (no over-allocation, no silent overdraft). HR/Admin
--   approvals that would exceed balance must be an explicit act: the
--   migration adds a safe consumption override for hr/admin. Idempotent:
--   one consumption row per leave (notes marker checked).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.on_leave_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days NUMERIC;
  v_balance NUMERIC;
  v_existing INT;
  v_is_unpaid BOOLEAN;
  v_actor_role TEXT;
BEGIN
  -- Only act on transitions into/out of the approved state.
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- ------------------------- APPROVAL -------------------------
  IF NEW.status = 'Approved' THEN
    -- Unpaid leave never consumes the paid balance.
    SELECT LOWER(COALESCE(NEW.leave_type, '')) IN ('unpaid', 'unpaid_leave', 'lwp', 'lop')
      INTO v_is_unpaid;
    IF v_is_unpaid THEN
      RETURN NEW;
    END IF;

    -- Idempotency: one consumption row per leave id.
    SELECT count(*) INTO v_existing
    FROM public.leave_ledgers
    WHERE notes = 'LEAVE_CONSUMPTION:' || NEW.id::text;
    IF v_existing > 0 THEN
      RETURN NEW;
    END IF;

    -- Day-count convention: inclusive calendar days, clamped to the leave's
    -- own window (payroll uses the same inclusive convention for LWP).
    v_days := GREATEST(1, (NEW.end_date - NEW.start_date) + 1)::numeric;

    -- Current balance = latest ledger row's balance_after (0 if none).
    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.leave_ledgers
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    -- Over-allocation guard: reject by default...
    IF COALESCE(v_balance, 0) - v_days < 0 THEN
      v_actor_role := LOWER(COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()), ''));
      -- ...unless an HR/Admin explicitly approves the overdraft.
      IF v_actor_role NOT IN ('hr', 'admin') THEN
        RAISE EXCEPTION 'Leave approval would over-allocate balance: have %, need % (days %)',
          COALESCE(v_balance, 0), v_days, v_days
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.leave_ledgers (
      user_id, transaction_type, leave_type, amount, balance_after,
      fiscal_year, month, notes
    ) VALUES (
      NEW.user_id,
      'consumption',
      LOWER(COALESCE(NEW.leave_type, 'casual')),
      -v_days,
      COALESCE(v_balance, 0) - v_days,
      EXTRACT(YEAR FROM NEW.start_date)::int,
      EXTRACT(MONTH FROM NEW.start_date)::int,
      'LEAVE_CONSUMPTION:' || NEW.id::text
    );

    RETURN NEW;
  END IF;

  -- --------------------- APPROVAL REVERSED ---------------------
  IF OLD.status = 'Approved' AND NEW.status IN ('Pending', 'Rejected', 'Cancelled') THEN
    -- Reverse the original consumption (keep the audit trail: append a
    -- reversal row; never delete ledger history).
    SELECT count(*) INTO v_existing
    FROM public.leave_ledgers
    WHERE notes = 'LEAVE_REVERSAL:' || NEW.id::text;
    IF v_existing = 0 THEN
      v_days := GREATEST(1, (NEW.end_date - NEW.start_date) + 1)::numeric;
      SELECT COALESCE(balance_after, 0) INTO v_balance
      FROM public.leave_ledgers
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC, id DESC
      LIMIT 1;

      INSERT INTO public.leave_ledgers (
        user_id, transaction_type, leave_type, amount, balance_after,
        fiscal_year, month, notes
      ) VALUES (
        NEW.user_id,
        'reversal',
        LOWER(COALESCE(NEW.leave_type, 'casual')),
        +v_days,
        COALESCE(v_balance, 0) + v_days,
        EXTRACT(YEAR FROM NEW.start_date)::int,
        EXTRACT(MONTH FROM NEW.start_date)::int,
        'LEAVE_REVERSAL:' || NEW.id::text
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_leave_status_change ON public.leaves;
CREATE TRIGGER trg_leave_status_change
  AFTER UPDATE ON public.leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.on_leave_status_change();

COMMIT;
