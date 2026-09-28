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
 * RBAC IRON WALL — live penetration tests against REAL identities.
 *
 * Session 8 rewrite: the previous version probed fixture UUIDs (Alex Rivera /
 * Elena Rostova) that never existed in the live database, and passed the
 * attacker's role as a client-side function argument — which proves nothing
 * about server-side authorization. This version:
 *   - mints tagged probe employees (E2E_PROBE_*, @e2e-test.invalid) directly
 *     via pg (the only legitimate fixture path);
 *   - attacks through REAL authenticated sessions (GoTrue sign-in) and the
 *     anon key, never via spoofable client arguments;
 *   - verifies the victim's state is untouched after every attack;
 *   - removes every probe trace afterwards.
 */

let attacker: ProbeEmployee; // standard employee
let victim: ProbeEmployee; // employee the attacker targets
let pg: ReturnType<typeof pgConnect>;

test.beforeAll(async () => {
  pg = pgConnect();
  await pg.connect();
  attacker = await createProbeEmployee(pg, {
    name: "E2E_PROBE_RBAC_Attacker",
    annualCtc: 900000,
  });
  victim = await createProbeEmployee(pg, {
    name: "E2E_PROBE_RBAC_Victim",
    annualCtc: 900000,
  });
});

test.afterAll(async () => {
  if (attacker) await cleanupProbe(attacker);
  if (victim) await cleanupProbe(victim);
  if (pg) await pg.end();
});

async function victimProfile() {
  const r = await pg.query(
    `SELECT status, offboarding_date FROM public.profiles WHERE id = $1`,
    [victim.id]
  );
  return r.rows[0];
}

async function victimFnfCount() {
  const r = await pg.query(
    `SELECT count(*)::int AS n FROM public.fnf_settlements WHERE employee_id = $1`,
    [victim.id]
  );
  return r.rows[0].n;
}

test.describe("RBAC Iron Wall: live penetration tests", () => {
  test("1. Signed-in standard EMPLOYEE cannot offboard a colleague (no 403 bypass)", async () => {
    // Attack through a REAL authenticated employee session — not a client arg.
    const attackerClient = await signInOrFail(attacker.email, attacker.password);
    let rejected = false;
    let rawBody: unknown = null;
    const { data, error } = await attackerClient.rpc("process_employee_fnf_settlement", {
      p_employee_id: victim.id,
      p_last_working_day: "2026-09-20",
      p_notice_shortfall_days: 0,
      p_settled_by: attacker.id,
    });
    if (error) {
      rejected = true;
      rawBody = error.message;
    } else {
      rawBody = data;
      // SECURITY DEFINER RPCs may return 200 with a jsonb error envelope —
      // only treat success:false as a block. Never accept success:true.
      const obj = data as { success?: boolean; status?: number; error?: string } | null;
      if (obj && obj.success === false) rejected = true;
    }

    expect(rejected, `expected employee FnF attack to be rejected, got: ${JSON.stringify(rawBody)}`).toBe(true);

    // Victim must remain fully untouched.
    const profile = await victimProfile();
    expect(profile).toBeDefined();
    expect(profile.status).toBe("active");
    expect(profile.offboarding_date).toBeNull();
    expect(await victimFnfCount()).toBe(0);
  });

  test("2. RLS Iron Wall: anon client cannot read another user's payslips", async () => {
    const anon = anonClient();
    const { data: payslips, error } = await anon
      .from("payslips")
      .select("employee_id, gross, net")
      .eq("employee_id", victim.id);

    expect(error).toBeNull();
    // RLS filters the rows: an anonymous caller must see NOTHING, regardless
    // of whether the victim happens to have payslips.
    expect(payslips ?? []).toHaveLength(0);
  });

  test("3. Fully ANONYMOUS caller cannot trigger FnF settlement", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("process_employee_fnf_settlement", {
      p_employee_id: victim.id,
      p_last_working_day: "2026-09-20",
      p_notice_shortfall_days: 0,
      p_settled_by: null,
    });

    // Either PostgREST error (P0001 from auth trigger) or a jsonb envelope —
    // any shape is acceptable EXCEPT success:true.
    if (!error) {
      const obj = data as { success?: boolean } | null;
      expect(obj?.success).not.toBe(true);
    }

    const profile = await victimProfile();
    expect(profile.status).toBe("active");
    expect(profile.offboarding_date).toBeNull();
    expect(await victimFnfCount()).toBe(0);
  });
});
