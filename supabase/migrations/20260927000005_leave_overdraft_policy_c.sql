-- ============================================================================
-- 20260927000005 — Leave overdraft Policy C (HR override) hardening
-- ============================================================================
-- PRODUCT-OWNER DECISION (session 11): Policy C — normal approvals deny when
-- the available balance is insufficient; HR/Admin may explicitly approve an
-- overdraft exception, recorded for audit.
--
-- LIVE FINDING: the deployed trigger on_leave_status_change ALREADY enforces
-- the C decision rule (insufficient balance + non-HR actor -> check_violation;
-- HR/Admin -> allowed). Verified live: HR approval over a 0 balance consumed
-- -2.00 (override); 4 negative balances exist from legitimate HR overrides.
-- No historical rows are rewritten.
--
-- TWO GAPS versus the decision requirements, fixed here:
--   1. CONCURRENCY: the balance check + consumption INSERT are not serialized
--      per user. Two concurrent approvals could read the same balance and
--      write interleaved/incorrect balance_after chains (race-condition
--      overdraft). Fix: pg_advisory_xact_lock per user_id inside the trigger
--      transaction — atomicity preserved, no schema change.
--   2. AUDITABILITY: an HR override was implicit (no record that an exception
--      was exercised). Fix: when an overdraft is allowed by HR/Admin, append
--      an admin_audit_logs row naming the override actor, employee, days, and
--      balance. The consumption row's notes key ('LEAVE_CONSUMPTION:<id>')
--      is UNCHANGED — it is the idempotency key and must stay byte-stable.
--
-- Everything else (unpaid skip, day convention, idempotency, reversal
-- semantics, vocabulary mapping) is preserved byte-for-byte from the live
-- definition (scripts/leave_trigger_live_dump.sql).
-- ============================================================================

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
  v_overridden BOOLEAN := false;
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
    -- Serialize balance mutations per employee: two concurrent approvals must
    -- never read the same balance and interleave consumption rows.
    PERFORM pg_advisory_xact_lock(hashtext('leave_balance_' || NEW.user_id::text));

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

    -- Policy C: over-allocation is denied unless an HR/Admin explicitly
    -- approves the overdraft exception.
    IF COALESCE(v_balance, 0) - v_days < 0 THEN
      v_actor_role := LOWER(COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()), ''));
      IF v_actor_role NOT IN ('hr', 'admin') THEN
        RAISE EXCEPTION 'Leave approval would over-allocate balance: have %, need % days',
          COALESCE(v_balance, 0), v_days
          USING ERRCODE = 'check_violation';
      END IF;
      v_overridden := true;
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

    -- Explicit, auditable override record (Policy C requirement).
    IF v_overridden THEN
      INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
      VALUES (
        auth.uid(),
        'LEAVE_OVERDRAFT_OVERRIDE',
        'leaves',
        NEW.id,
        jsonb_build_object(
          'employee_id', NEW.user_id,
          'leave_type', NEW.leave_type,
          'days', v_days,
          'balance_before', COALESCE(v_balance, 0),
          'balance_after', COALESCE(v_balance, 0) - v_days
        )
      );
    END IF;

    RETURN NEW;
  END IF;

  -- --------------------- APPROVAL REVERSED ---------------------
  IF OLD.status = 'Approved' AND NEW.status IN ('Pending', 'Rejected') THEN
    -- Serialize against concurrent approvals/reversals for the same employee.
    PERFORM pg_advisory_xact_lock(hashtext('leave_balance_' || NEW.user_id::text));

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
