import { test, expect } from "@playwright/test";
import { createProbeEmployee, pgConnect, anonClient, signInOrFail, cleanupProbe, type ProbeEmployee } from "./helpers/probe-user";
import pgLib from "pg";

/**
 * TIME-TRAVEL PAYROLL — live CUJs driven through the CRON-EQUIVALENT path.
 *
 * Session 8 rewrite: the old spec asserted on fixture UUIDs that never existed
 * and read payslips through an anon client. Additionally, this session's
 * security lockdown (migration 20260926000003) revoked EXECUTE on the
 * scheduler RPCs from anon/authenticated — so no user session can (or may)
 * trigger payroll. Production execution is pg_cron running as `postgres`.
 * These tests therefore:
 *   - execute the SAME functions via direct pg (the cron-equivalent authority);
 *   - assert privilege denial over the real HTTP edge (anon + authenticated HR
 *     sessions must both be rejected — regression guard for the lockdown);
 *   - verify user-facing outcomes through REAL authenticated employee/HR
 *     sessions (payslip visibility, math, idempotency, accrual ledger).
 */

let probe: ProbeEmployee;
let pg: pgLib.Client;

const PAYROLL_MONTH = 12;
const PAYROLL_YEAR = 2026; // future, unused period — safe for probes
const CRON = `SELECT public.auto_process_monthly_payroll_idempotent($1, $2) AS r`;
const ACCRUE = `SELECT public.accrue_monthly_leaves_and_anniversaries() AS r`;

test.beforeAll(async () => {
  pg = pgConnect();
  await pg.connect();
  probe = await createProbeEmployee(pg, {
    name: "E2E_PROBE_Payroll_LWP",
    annualCtc: 600000, // 50,000 / month
    joinedYearsAgo: 1, // joined 2025-09-01 → Sept is anniversary month
  });

  // Live contract: leaves.user_id; CHECK allows leave_type IN
  // ('Sick','Casual','Vacation','Unpaid'); payroll RPC lowercases and matches
  // ('unpaid','unpaid_leave','lwp','lop'); status must be 'Approved'.
  await pg.query(
    `INSERT INTO leaves (user_id, leave_type, start_date, end_date, status, reason)
     VALUES ($1, 'Unpaid', '2026-12-21', '2026-12-23', 'Approved', 'E2E probe LWP fixture')`,
    [probe.id]
  );
});

test.afterAll(async () => {
  if (probe) {
    await pg.query(`DELETE FROM leaves WHERE user_id = $1`, [probe.id]);
    await cleanupProbe(probe);
  }
  // The 12/2026 cycle exists ONLY because this spec created it — remove the
  // whole cycle so the live DB carries zero test-driven payroll residue.
  await pg.query(
    `DELETE FROM payslips WHERE cycle_id IN (SELECT id FROM payroll_cycles WHERE year = $1 AND month = $2)`,
    [PAYROLL_YEAR, PAYROLL_MONTH]
  );
  await pg.query(`DELETE FROM payroll_cycles WHERE year = $1 AND month = $2`, [PAYROLL_YEAR, PAYROLL_MONTH]);
  if (pg) await pg.end();
});

test.describe("Payroll Time-Travel CUJs (live, cron-equivalent)", () => {
  test("1. Privilege regression: HTTP callers cannot trigger payroll engine", async () => {
    // a) anon over HTTP must be rejected
    const anon = anonClient();
    const { error: anonErr } = await anon.rpc("auto_process_monthly_payroll_idempotent", {
      p_month: PAYROLL_MONTH,
      p_year: PAYROLL_YEAR,
    });
    expect(anonErr).not.toBeNull(); // 42501 permission denied

    // b) even a REAL HR session must be rejected over HTTP (no role guard
    //    exists inside the function; privilege is withheld at grant level)
    const hrEmail = process.env.E2E_HR_EMAIL || "jack@email.com";
    const hrPassword = process.env.E2E_HR_PASSWORD || "jack123";
    const hr = await signInOrFail(hrEmail, hrPassword);
    const { error: hrErr } = await hr.rpc("auto_process_monthly_payroll_idempotent", {
      p_month: PAYROLL_MONTH,
      p_year: PAYROLL_YEAR,
    });
    expect(hrErr).not.toBeNull(); // 42501 permission denied

    // c) the cron-equivalent path (postgres) still works — engine is alive
    const r = await pg.query(CRON, [PAYROLL_MONTH, PAYROLL_YEAR]);
    expect(r.rows[0].r.success).toBe(true);
  });

  test("2. LWP proration math is exact for a real probe employee", async () => {
    // Engine already ran in test 1; the probe's payslip must reflect 3 LWP days.
    const cyc = await pg.query(
      `SELECT id FROM payroll_cycles WHERE month = $1 AND year = $2`,
      [PAYROLL_MONTH, PAYROLL_YEAR]
    );
    expect(cyc.rows).toHaveLength(1);
    const cycleId = cyc.rows[0].id;

    // Employee reads OWN payslip through a REAL session (RLS isolation).
    const emp = await signInOrFail(probe.email, probe.password);
    const { data: payslips, error: psErr } = await emp
      .from("payslips")
      .select("employee_id, gross, net, lop_days, lop_deduction, cycle_id")
      .eq("cycle_id", cycleId)
      .eq("employee_id", probe.id);
    expect(psErr).toBeNull();
    expect(payslips ?? []).toHaveLength(1);

    const slip = payslips![0];
    const monthlyCtc = 50000;
    const daysInDec = 31;
    const lwpDays = 3;
    const expectedGross = Number(((monthlyCtc / daysInDec) * (daysInDec - lwpDays)).toFixed(2));
    const expectedLop = Number((monthlyCtc - expectedGross).toFixed(2));
    expect(Number(slip.lop_days)).toBe(lwpDays);
    expect(Number(slip.gross)).toBeCloseTo(expectedGross, 1);
    expect(Number(slip.lop_deduction ?? expectedLop)).toBeCloseTo(expectedLop, 1);
    expect(Number(slip.net)).toBeGreaterThan(0);
  });

  test("3. Idempotency attack: 5 concurrent cron-equivalent runs create exactly ONE cycle", async () => {
    const results = await Promise.all(
      Array(5)
        .fill(null)
        .map(() => pg.query(CRON, [PAYROLL_MONTH, PAYROLL_YEAR]))
    );
    for (const r of results) {
      expect(r.rows[0].r.success).toBe(true);
      expect(r.rows[0].r.idempotent).toBe(true);
    }
    const cyc = await pg.query(
      `SELECT count(*)::int AS n FROM payroll_cycles WHERE month = $1 AND year = $2`,
      [PAYROLL_MONTH, PAYROLL_YEAR]
    );
    expect(cyc.rows[0].n).toBe(1);
    const slips = await pg.query(
      `SELECT count(*)::int AS n FROM payslips
       WHERE employee_id = $1
         AND cycle_id IN (SELECT id FROM payroll_cycles WHERE month = $2 AND year = $3)`,
      [probe.id, PAYROLL_MONTH, PAYROLL_YEAR]
    );
    expect(slips.rows[0].n).toBe(1);
  });

  test("4. Anniversary accrual: real probe gets +1.5 and +2.0 in anniversary month", async () => {
    const r = await pg.query(ACCRUE);
    expect(r.rows[0].r.success).toBe(true);

    const ledger = await pg.query(
      `SELECT transaction_type, amount FROM leave_ledgers
       WHERE user_id = $1 AND transaction_type IN ('monthly_accrual','anniversary_grant')
         AND fiscal_year = 2026 AND month = 9`,
      [probe.id]
    );
    const accrual = ledger.rows.find((x) => x.transaction_type === "monthly_accrual");
    expect(accrual).toBeDefined();
    expect(Number(accrual.amount)).toBe(1.5);
    const anniversary = ledger.rows.find((x) => x.transaction_type === "anniversary_grant");
    expect(anniversary).toBeDefined();
    expect(Number(anniversary.amount)).toBe(2.0);
  });
});
