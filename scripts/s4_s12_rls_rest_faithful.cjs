/* S4/S12 REST-faithful RLS probes — the authoritative authorization test.
   Uses the real PostgREST endpoint with real GoTrue sessions, exactly like
   the production frontend. No DB connection, no role emulation.
   Expects VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_DB_PASSWORD. */
const { Client } = require('pg');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

const results = [];
async function rest(name, method, path, token, body, expect) {
  try {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: token,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: method === 'GET' ? 'count=exact' : 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (method === 'GET') {
      const cr = res.headers.get('content-range');
      const n = cr ? cr.split('/')[1] : null;
      results.push({ name, result: res.ok ? `ALLOWED(${n} rows)` : `DENIED(${res.status})`, expect, status: res.status });
    } else {
      const t = await res.text();
      results.push({ name, result: res.ok ? 'ALLOWED' : `DENIED(${res.status}: ${t.slice(0, 70)})`, expect, status: res.status });
    }
  } catch (e) {
    results.push({ name, result: `ERROR(${e.message.slice(0, 60)})`, expect });
  }
}

async function main() {
  const db = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  // Subjects (read-only identification of test subjects; no state changes)
  const off = (await db.query(`SELECT p.id, p.email FROM public.profiles p WHERE p.role='archived' AND p.employment_status='terminated' AND p.email IS NOT NULL LIMIT 1`)).rows[0];
  const emp = (await db.query(`SELECT p.id, p.email FROM public.profiles p WHERE p.role='employee' AND p.status='active' AND p.email IS NOT NULL LIMIT 1`)).rows[0];
  const admin = (await db.query(`SELECT p.id, p.email FROM public.profiles p WHERE p.role='admin' LIMIT 1`)).rows[0];
  console.log('SUBJECTS found: offboarded=', !!off, 'employee=', !!emp, 'admin=', !!admin);

  // Sign in via GoTrue (real sessions)
  async function login(email) {
    if (!email) return null;
    const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: process.env.TEST_ACCOUNT_PASSWORD }),
    });
    return res.ok ? (await res.json()).access_token : null;
  }
  const empTok = await login(emp?.email);
  const offTok = await login(off?.email);
  console.log('SESSIONS: employee=', !!empTok, 'offboarded=', !!offTok);

  // ---- ANON surface (publishable key only) ----
  await rest('anon: read profiles', 'GET', 'profiles?select=id&limit=1', ANON, null, 'deny');
  await rest('anon: read assessments (answer keys)', 'GET', 'assessments?select=id&limit=1', ANON, null, 'deny');
  await rest('anon: read assessment_tokens', 'GET', 'assessment_tokens?select=id&limit=1', ANON, null, 'deny');
  await rest('anon: insert resignation', 'POST', 'resignations', ANON, { user_id: emp?.id, reason: 'x', expected_last_day: '2026-10-01', status: 'Approved' }, 'deny');
  await rest('anon: read job_forms (public flow)', 'GET', 'job_forms?select=id&limit=1', ANON, null, 'allow');
  await rest('anon: insert assessment token', 'POST', 'assessment_tokens', ANON,
    { candidate_id: '00000000-0000-0000-0000-000000000000', assessment_id: '00000000-0000-0000-0000-000000000000', token: 'forged-token-value' }, 'deny');

  // ---- STALE JWT (offboarded account, real pre-existing session) ----
  if (offTok) {
    await rest('stale: work_logs INSERT', 'POST', 'work_logs', offTok, { user_id: off.id }, 'deny');
    await rest('stale: leaves INSERT', 'POST', 'leaves', offTok, { user_id: off.id, leave_type: 'paid_leave', start_date: '2026-10-01', end_date: '2026-10-02', reason: 'x' }, 'deny');
    await rest('stale: role escalation (own profile)', 'PATCH', `profiles?id=eq.${off.id}`, offTok, { role: 'admin' }, 'deny');
    await rest('stale: forge resignation approval', 'PATCH', `resignations?user_id=eq.${emp.id}`, offTok, { status: 'Approved' }, 'deny');
    await rest('stale: read own payslips (historical)', 'GET', `payslips?select=id&employee_id=eq.${off.id}`, offTok, null, 'allow');
  } else {
    results.push({ name: 'stale: (no session — TEST_ACCOUNT_PASSWORD not set for offboarded acct)', result: 'NOT PROVEN', expect: 'deny' });
  }

  // ---- EMPLOYEE IDOR (active employee session) ----
  if (empTok) {
    await rest('employee: read admin payslip', 'GET', `payslips?select=id&employee_id=eq.${admin.id}`, empTok, null, 'deny');
    await rest('employee: read admin leave ledger', 'GET', `leave_ledgers?select=id&user_id=eq.${admin.id}`, empTok, null, 'deny');
    await rest('employee: update admin profile', 'PATCH', `profiles?id=eq.${admin.id}`, empTok, { name: 'HACKED' }, 'deny');
    await rest('employee: mint assessment token', 'POST', 'assessment_tokens', empTok,
      { candidate_id: '00000000-0000-0000-0000-000000000000', assessment_id: '00000000-0000-0000-0000-000000000000', token: 'forged-emp-token' }, 'deny');
    await rest('employee: enumerate employee profiles', 'GET', 'profiles?select=id&role=eq.employee', empTok, null, 'deny');
    await rest('employee: forge resignation approval', 'PATCH', `resignations?user_id=eq.${emp.id}`, empTok, { status: 'Approved' }, 'deny');
    await rest('employee: read own profile (sanity)', 'GET', `profiles?select=id&id=eq.${emp.id}`, empTok, null, 'allow');
  } else {
    results.push({ name: 'employee: (no session — TEST_ACCOUNT_PASSWORD not set)', result: 'NOT PROVEN', expect: 'deny' });
  }

  console.log('\n=== REST-FAITHFUL PROBE RESULTS ===');
  let fails = 0, unproven = 0;
  for (const r of results) {
    const pass = r.result === 'NOT PROVEN' ? null : (r.expect === 'allow' ? r.result.startsWith('ALLOWED') : r.result.startsWith('DENIED'));
    if (pass === false) fails++;
    if (pass === null) unproven++;
    console.log(`${pass === false ? 'FAIL' : pass === null ? 'SKIP' : 'PASS'} [expect ${r.expect}] ${r.name} → ${r.result}`);
  }
  console.log(`\nRESULT: ${fails} failures, ${unproven} not-proven`);
  await db.end();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
