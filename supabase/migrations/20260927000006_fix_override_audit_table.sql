-- ============================================================================
-- 20260927000006 — Correct override audit table (audit_logs, not admin_audit_logs)
-- ============================================================================
-- LIVE-PROVEN (leave-policy probe T6): 20260927000005 referenced
-- public.admin_audit_logs, which does NOT exist in the live schema (the live
-- audit table is public.audit_logs: actor_id, action, entity_type, entity_id,
-- details). Any HR overdraft override would have errored the approval.
-- (20260927000005 was already applied before the table name was corrected in
-- the file — per migration discipline this fix ships as a NEW migration.)
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
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_ledger_type := CASE LOWER(COALESCE(NEW.leave_type, ''))
    WHEN 'sick' THEN 'sick_leave'
    WHEN 'vacation' THEN 'paid_leave'
    WHEN 'unpaid' THEN 'unpaid_leave'
    ELSE 'casual_leave'
  END;

  IF NEW.status = 'Approved' THEN
    PERFORM pg_advisory_xact_lock(hashtext('leave_balance_' || NEW.user_id::text));

    SELECT LOWER(COALESCE(NEW.leave_type, '')) = 'unpaid' INTO v_is_unpaid;
    IF v_is_unpaid THEN
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_existing
    FROM public.leave_ledgers
    WHERE notes = 'LEAVE_CONSUMPTION:' || NEW.id::text;
    IF v_existing > 0 THEN
      RETURN NEW;
    END IF;

    v_days := GREATEST(1, (NEW.end_date - NEW.start_date) + 1)::numeric;

    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.leave_ledgers
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

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

  IF OLD.status = 'Approved' AND NEW.status IN ('Pending', 'Rejected') THEN
    PERFORM pg_advisory_xact_lock(hashtext('leave_balance_' || NEW.user_id::text));

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
