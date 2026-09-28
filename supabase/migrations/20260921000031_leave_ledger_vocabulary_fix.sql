-- ============================================================================
-- Migration: 20260921000031_leave_ledger_vocabulary_fix.sql
-- Purpose: corrective to migration 30. The leave_ledgers CHECK constraints
--   define the canonical vocabulary — transaction_type must be one of
--   monthly_accrual/leave_taken/leave_cancelled/fiscal_lapse/carry_forward/
--   anniversary_grant/manual_adjustment, and leave_type one of paid_leave/
--   sick_leave/casual_leave/unpaid_leave. Migration 30 wrote 'consumption'/
--   'reversal' and 'casual' — every real approval would have aborted at
--   runtime (push succeeded; behavior broken — same class as the digest()
--   incident). This migration rewrites the trigger to use the canonical
--   vocabulary: leave_taken + leave_cancelled, with the leaves→ledger type
--   mapping (Casual→casual_leave, Sick→sick_leave, Vacation→paid_leave,
--   Unpaid→unpaid_leave).
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
  v_ledger_type TEXT;
BEGIN
  -- Only act on transitions into/out of the approved state.
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- leaves.leave_type CHECK vocabulary → ledger leave_type CHECK vocabulary.
  v_ledger_type := CASE LOWER(COALESCE(NEW.leave_type, ''))
    WHEN 'sick' THEN 'sick_leave'
    WHEN 'vacation' THEN 'paid_leave'
    WHEN 'unpaid' THEN 'unpaid_leave'
    ELSE 'casual_leave'
  END;

  -- ------------------------- APPROVAL -------------------------
  IF NEW.status = 'Approved' THEN
    -- Unpaid leave never consumes the paid balance.
    SELECT LOWER(COALESCE(NEW.leave_type, '')) = 'unpaid' INTO v_is_unpaid;
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

    -- Day-count convention: inclusive calendar days (payroll uses the same
    -- inclusive convention for LWP counting).
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
        RAISE EXCEPTION 'Leave approval would over-allocate balance: have %, need % days',
          COALESCE(v_balance, 0), v_days
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.leave_ledgers (
      user_id, transaction_type, leave_type, amount, balance_after,
      fiscal_year, month, notes
    ) VALUES (
      NEW.user_id,
      'leave_taken',
      v_ledger_type,
      -v_days,
      COALESCE(v_balance, 0) - v_days,
      EXTRACT(YEAR FROM NEW.start_date)::int,
      EXTRACT(MONTH FROM NEW.start_date)::int,
      'LEAVE_CONSUMPTION:' || NEW.id::text
    );

    RETURN NEW;
  END IF;

  -- --------------------- APPROVAL REVERSED ---------------------
  IF OLD.status = 'Approved' AND NEW.status IN ('Pending', 'Rejected') THEN
    -- Reverse the original consumption (append a cancellation row; never
    -- delete ledger history).
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
        'leave_cancelled',
        v_ledger_type,
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

COMMIT;
