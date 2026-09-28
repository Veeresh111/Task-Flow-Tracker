/**
 * E2E probe-user helper.
 *
 * Creates EXPLICITLY TAGGED disposable test users (E2E_PROBE_*, @e2e-test.invalid)
 * directly via the postgres connection — never via anon API upserts (RLS forbids
 * that, and anon seeding was fake-data anti-pattern, removed in session 6).
 *
 * Every probe is a REAL auth.users row: it can sign in through GoTrue like any
 * real employee, which lets specs hold a genuine pre-state session (e.g. an
 * active-employee JWT) and later prove the backend still denies it after
 * state changes. Cleanup removes every trace.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import * as fs from "fs";
import * as crypto from "crypto";

const ENV_PATH = ".env.local";
const env: Record<string, string> = { ...process.env } as Record<string, string>;
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) env[m[1]] = m[2];
  }
}

export function pgConnect(): pg.Client {
  const ref = env.SUPABASE_PROJECT_REF;
  if (!ref || !env.SUPABASE_DB_PASSWORD) {
    throw new Error("SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD missing — backend specs cannot run honestly");
  }
  return new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

export function supabaseEnv() {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing");
  return { url, key };
}

export interface ProbeEmployee {
  id: string;
  email: string;
  password: string;
  client: pg.Client;
}

/** Mint a real, tagged, disposable employee (auth row + identity + profile + leave ledger). */
export async function createProbeEmployee(
  client: pg.Client,
  opts: { name: string; annualCtc: number; leaveBalance?: number; joinedYearsAgo?: number; role?: string }
): Promise<ProbeEmployee> {
  const uid = crypto.randomUUID();
  const email = `e2e-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e-test.invalid`;
  const password = `Pr${crypto.randomBytes(9).toString("base64url")}!1`;
  const role = opts.role ?? "employee";

  await client.query(
    `INSERT INTO auth.users
       (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change, phone_change)
     VALUES ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated', $2::text,
       crypt($3::text, gen_salt('bf',10)), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('sub', $1::uuid::text, 'name', $4::text, 'role', $5::text, 'email', $2::text, 'email_verified', true),
       now(), now(), '', '', '', '', '')`,
    [uid, email, password, opts.name, role]
  );
  // provider_id must be unique per (provider) — real GoTrue stores the email here.
  await client.query(
    `INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     VALUES ($1::uuid, $1::uuid, $2::text,
       jsonb_build_object('sub', $1::uuid::text, 'email', $2::text, 'email_verified', true),
       'email', now(), now(), now())`,
    [uid, email]
  );

  // The live trigger on_auth_user_created auto-creates the profile row —
  // UPDATE it instead of INSERTing (an INSERT collides on profiles_pkey).
  // Introspect profile columns — never assume the live schema.
  const colRes = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'`
  );
  const cols = new Set(colRes.rows.map((r) => r.column_name));
  const sets: string[] = [];
  const values: unknown[] = [uid];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  push("role", role);
  push("status", "active");
  push("name", opts.name);
  if (cols.has("employment_status")) push("employment_status", "active");
  if (cols.has("payroll_ctc")) push("payroll_ctc", opts.annualCtc);
  const doj = new Date(Date.UTC(2026, 8, 1)); // Sept 1 anchor
  doj.setUTCFullYear(2026 - (opts.joinedYearsAgo ?? 0));
  if (cols.has("employment_start_date")) push("employment_start_date", doj.toISOString());
  if (cols.has("date_of_joining")) push("date_of_joining", doj.toISOString());
  // The profile-protection trigger rejects role modification from an
  // anonymous context — impersonate service_role for this admin action
  // (same pattern as scripts/auth-row-repro.mjs), then reset.
  await client.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await client.query(`UPDATE public.profiles SET ${sets.join(", ")} WHERE id = $1`, values);
  await client.query(`SELECT set_config('request.jwt.claims', '', false)`);

  if (opts.leaveBalance && opts.leaveBalance > 0) {
    await client.query(
      `INSERT INTO leave_ledgers (user_id, transaction_type, leave_type, amount, balance_after, fiscal_year, month, notes)
       VALUES ($1, 'monthly_accrual', 'paid_leave', $2, $2, 2026, 9, 'E2E probe pre-state accrual')`,
      [uid, opts.leaveBalance]
    );
  }
  return { id: uid, email, password, client };
}

/** Build a fresh anon-key client (one per actor — never share sessions). */
export function anonClient(): SupabaseClient {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function signInOrFail(email: string, password: string): Promise<SupabaseClient> {
  const s = anonClient();
  const { error } = await s.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Probe sign-in failed for ${email}: ${error.message}`);
  return s;
}

/** Remove every trace of a probe employee. */
export async function cleanupProbe(probe: ProbeEmployee): Promise<void> {
  await probe.client.query(`DELETE FROM leave_ledgers WHERE user_id = $1`, [probe.id]);
  await probe.client.query(`DELETE FROM fnf_settlements WHERE employee_id = $1`, [probe.id]);
  await probe.client.query(`DELETE FROM payslips WHERE employee_id = $1`, [probe.id]);
  await probe.client.query(`DELETE FROM profiles WHERE id = $1`, [probe.id]);
  await probe.client.query(`DELETE FROM auth.identities WHERE user_id = $1`, [probe.id]);
  await probe.client.query(`DELETE FROM auth.users WHERE id = $1`, [probe.id]);
}
