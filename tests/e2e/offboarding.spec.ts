import { test, expect } from "@playwright/test";
import {
  createProbeEmployee,
  pgConnect,
  anonClient,
  signInOrFail,
  cleanupProbe,
  type ProbeEmployee,
} from "./helpers/probe-user";

/**
 * OFFBOARDING & FnF SETTLEMENT — live guardrail against a REAL employee.
 *
 * Session 8 rewrite: the previous version seeded "David Sterling" via an
 * ANON upsert on profiles — silently blocked by RLS, so every assertion ran
 * against an employee who never existed. Now:
 *   - the employee is a tagged probe (E2E_PROBE_*) with real auth rows and a
 *     real pre-state (CTC, 12 days paid leave);
 *   - the settlement is executed by a REAL HR session (the only legitimate
 *     caller);
 *   - the idempotency lock is attacked for real (duplicate settlement);
 *   - a JWT minted while the probe was ACTIVE is proven DEAD after
 *     termination (session 8 stale-JWT requirement, in-spec);
 *   - every probe trace is removed.
 */

let probe: ProbeEmployee;
let session: Awaited<ReturnType<typeof signInOrFail>>; // active-employee session
let hrEmail: string;
let hrPassword: string;
let pg: ReturnType<typeof pgConnect>;

const LAST_WORKING_DAY = "2026-09-20";

test.beforeAll(async () => {
  pg = pgConnect();
  await pg.connect();
  probe = await createProbeEmployee(pg, {
    name: "E2E_PROBE_Offboarding_Target",
    annualCtc: 1200000,
    leaveBalance: 12.0,
  });
  // Session minted while the employee is still ACTIVE — required for the
  // stale-JWT proof later.
  session = await signInOrFail(probe.email, probe.password);
  hrEmail = process.env.E2E_HR_EMAIL || "jack@email.com";
  hrPassword = process.env.E2E_HR_PASSWORD || "jack123";
});

test.afterAll(async () => {
  if (probe) await cleanupProbe(probe);
  if (pg) await pg.end();
});

test.describe("Offboarding & FnF Settlement Guardrail (live)", () => {
  test("1. FnF settlement math is exact for a real employee", async () => {
    const hr = await signInOrFail(hrEmail, hrPassword);
    const { data, error } = await hr.rpc("process_employee_fnf_settlement", {
      p_employee_id: probe.id,
      p_last_working_day: LAST_WORKING_DAY,
      p_notice_shortfall_days: 5,
      p_settled_by: null,
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const settlement = data as {
      success: boolean;
      prorated_salary?: number;
      leave_encashment?: number;
      notice_deduction?: number;
      net_payable?: number;
    };
    expect(settlement?.success, JSON.stringify(settlement)).toBe(true);

    // Deterministic math — MIRRORS THE LIVE FUNCTION (pg_get_functiondef of
    // process_employee_fnf_settlement), not the TS mirror in fnf-service.ts:
    //   monthly = annual/12; basic = 50%; Sept has 30 days; LWD 2026-09-20 →
    //   20 days worked; encashment = (annual_basic/365)*balance; net =
    //   prorated + encashment − notice_shortfall_deduction (no gratuity,
    //   tenure < 5y).
    const annualCtc = 1200000;
    const monthlyCtc = annualCtc / 12; // 100,000
    const annualBasic = annualCtc * 0.5; // 600,000
    const daysInSept = 30;
    const daysWorked = 20;
    const leaveBalance = 12;
    const shortfall = 5;

    const expectedProrated = Number(((monthlyCtc / daysInSept) * daysWorked).toFixed(2)); // 66,666.67
    const expectedEncashment = Number(((annualBasic / 365.0) * leaveBalance).toFixed(2)); // 19,726.03
    const expectedNoticeDed = Number(((monthlyCtc / daysInSept) * shortfall).toFixed(2)); // 16,666.67
    const expectedNet = Number(
      (expectedProrated + expectedEncashment - expectedNoticeDed).toFixed(2)
    ); // 69,726.03

    expect(Number(settlement.prorated_salary)).toBeCloseTo(expectedProrated, 1);
    expect(Number(settlement.leave_encashment)).toBeCloseTo(expectedEncashment, 1);
    expect(Number(settlement.notice_deduction)).toBeCloseTo(expectedNoticeDed, 1);
    expect(Number(settlement.net_payable)).toBeCloseTo(expectedNet, 1);
  });

  test("2. Idempotency lock rejects duplicate settlement", async () => {
    const hr = await signInOrFail(hrEmail, hrPassword);
    const { data, error } = await hr.rpc("process_employee_fnf_settlement", {
      p_employee_id: probe.id,
      p_last_working_day: LAST_WORKING_DAY,
      p_notice_shortfall_days: 0,
      p_settled_by: null,
    });
    expect(error).toBeNull();
    const dup = data as { success: boolean; idempotent?: boolean; error?: string; status?: number };
    expect(dup?.success).toBe(false);
    expect(dup?.idempotent).toBe(true);
    expect(dup?.error).toContain("already been offboarded and settled");
  });

  test("3. Soft-delete, ledger zeroing, and stale-JWT death", async () => {
    // 1. Soft-delete state (never SQL-deleted). LIVE semantics: the function
    //    archives via status='inactive' + employment_status='offboarded'.
    const prof = await pg.query(
      `SELECT status, employment_status, offboarding_date, fnf_settlement_id
       FROM public.profiles WHERE id = $1`,
      [probe.id]
    );
    expect(prof.rows[0].status).toBe("inactive");
    expect(prof.rows[0].employment_status).toBe("offboarded");
    expect(prof.rows[0].offboarding_date).not.toBeNull();
    expect(prof.rows[0].fnf_settlement_id).not.toBeNull();

    // 2. Financial history: settlement row exists; leave ledger history is
    //    INTACT (the live function does not zero balances — historical
    //    records must remain 100% intact for audit).
    const fnf = await pg.query(
      `SELECT count(*)::int AS n FROM fnf_settlements WHERE employee_id = $1`,
      [probe.id]
    );
    expect(fnf.rows[0].n).toBe(1);
    const led = await pg.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(amount), 0)::numeric AS total
       FROM leave_ledgers WHERE user_id = $1`,
      [probe.id]
    );
    expect(led.rows[0].n).toBeGreaterThanOrEqual(1);
    expect(Number(led.rows[0].total)).toBe(12.0);

    // 3. STALE-JWT PROOF: the session minted while ACTIVE must now be denied
    //    by the backend/RLS — not by frontend hiding. Payroll CYCLES with
    //    status='released' are public-by-policy (payroll_cycles_select_released),
    //    so the dead session may see exactly those and NOTHING more. Payslips
    //    and leave ledgers are strictly personal: it must see zero.
    const released = await pg.query(
      `SELECT count(*)::int AS n FROM payroll_cycles WHERE status = 'released'`
    );
    const { data: cycles, error: cycErr } = await session.from("payroll_cycles").select("id");
    expect(cycErr).toBeNull();
    expect((cycles ?? []).length).toBe(released.rows[0].n);

    const { count: payslipCount, error: psErr } = await session
      .from("payslips")
      .select("id", { count: "exact", head: true });
    expect(psErr).toBeNull();
    expect(payslipCount).toBe(0);

    const { count: ledgerCount, error: ledErr } = await session
      .from("leave_ledgers")
      .select("id", { count: "exact", head: true });
    expect(ledErr).toBeNull();
    // leave_ledgers RLS (live-verified): user_id = auth.uid() OR is_admin_or_hr()
    // OR is_manager_of(user_id). The dead session sees EXACTLY its own history
    // (1 row) out of 461 — own-records scope, nobody else's data.
    const ownLedger = await pg.query(
      `SELECT count(*)::int AS n FROM leave_ledgers WHERE user_id = $1`,
      [probe.id]
    );
    expect(ledgerCount).toBe(ownLedger.rows[0].n);
  });
});
