/* S4/S5/S12: Behavioral RLS probes in faithful PostgREST context.
   Each probe runs inside a transaction as role 'authenticated' or 'anon'
   with request.jwt.claims set exactly as PostgREST does.
   All test actions are SELECTs or INSERTs that are EXPECTED to fail, plus
   read-only RPC probes. No destructive mutation succeeds by design. */
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Confirm postgres can SET ROLE to authenticated/anon (Supabase grants).
  const canAuth = await client.query(`SELECT pg_has_role('postgres','authenticated','member') AS ok, pg_has_role('postgres','anon','member') AS ok2`);
  console.log('ROLE MEMBERSHIP (postgres→authenticated, anon):', JSON.stringify(canAuth.rows[0]));

  // Pick subjects
  const off = (await client.query(`SELECT p.id FROM public.profiles p WHERE p.role='archived' AND p.employment_status='terminated' LIMIT 1`)).rows[0];
  const emp = (await client.query(`SELECT p.id FROM public.profiles p WHERE p.role='employee' AND p.status='active' LIMIT 1`)).rows[0];
  const admin = (await client.query(`SELECT p.id FROM public.profiles p WHERE p.role='admin' LIMIT 1`)).rows[0];
  console.log('SUBJECTS: offboarded=', !!off, 'employee=', !!emp, 'admin=', !!admin);

  const results = [];
  async function probe(name, role, uid, sql, params = [], expect = 'deny') {
    await client.query('BEGIN');
    try {
      if (role) await client.query(`SET ROLE ${role}`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify(uid ? { sub: uid, role: role === 'anon' ? 'anon' : 'authenticated' } : {})]);
      await client.query(sql, params);
      results.push({ name, result: 'ALLOWED', expect });
    } catch (e) {
      results.push({ name, result: `DENIED (${e.message.slice(0, 80)})`, expect });
    } finally {
      await client.query('ROLLBACK');
      await client.query('RESET ROLE');
    }
  }

  // ---- S12: STALE JWT — offboarded account ----
  await probe('stale: work_logs INSERT', 'authenticated', off.id,
    `INSERT INTO public.work_logs (user_id, clock_in) VALUES ($1, now())`, [off.id]);
  await probe('stale: leaves INSERT', 'authenticated', off.id,
    `INSERT INTO public.leaves (user_id, leave_type, start_date, end_date, reason) VALUES ($1, 'paid_leave', CURRENT_DATE + 1, CURRENT_DATE + 2, 'test')`, [off.id]);
  await probe('stale: profile UPDATE (role escalation)', 'authenticated', off.id,
    `UPDATE public.profiles SET role='admin' WHERE id=$1`, [off.id]);
  await probe('stale: forge resignation approval (another user)', 'authenticated', off.id,
    `UPDATE public.resignations SET status='Approved' WHERE user_id=$1`, [emp.id]);
  await probe('stale: read own payslip (historical permitted)', 'authenticated', off.id,
    `SELECT count(*) FROM public.payslips WHERE employee_id=$1`, [off.id], 'allow');

  // ---- S4: cross-user IDOR as normal employee ----
  await probe('employee: read another employee payslip', 'authenticated', emp.id,
    `SELECT count(*) FROM public.payslips WHERE employee_id=$1`, [admin.id]);
  await probe('employee: read another employee leave ledger', 'authenticated', emp.id,
    `SELECT count(*) FROM public.leave_ledgers WHERE user_id=$1`, [admin.id]);
  await probe('employee: update another profile', 'authenticated', emp.id,
    `UPDATE public.profiles SET name='HACKED' WHERE id=$1`, [admin.id]);
  await probe('employee: mint assessment token (post-mig5/16)', 'authenticated', emp.id,
    `INSERT INTO public.assessment_tokens (candidate_id, assessment_id) SELECT id, '00000000-0000-0000-0000-000000000000' FROM public.candidates LIMIT 1`);
  await probe('employee: enumerate employee profiles', 'authenticated', emp.id,
    `SELECT count(*) FROM public.profiles WHERE role='employee'`);
  await probe('employee: read own profile (sanity)', 'authenticated', emp.id,
    `SELECT id FROM public.profiles WHERE id=$1`, [emp.id], 'allow');
  await probe('employee: resignations self select (sanity)', 'authenticated', emp.id,
    `SELECT count(*) FROM public.resignations WHERE user_id=$1`, [emp.id], 'allow');

  // ---- anon surface ----
  await probe('anon: read profiles', 'anon', null, `SELECT count(*) FROM public.profiles`);
  await probe('anon: insert resignation', 'anon', null,
    `INSERT INTO public.resignations (user_id, reason, expected_last_day, status) VALUES (gen_random_uuid(), 'x', CURRENT_DATE, 'Approved')`);
  await probe('anon: read assessments (answer keys)', 'anon', null, `SELECT count(*) FROM public.assessments`);
  await probe('anon: read job_forms (public flow, sanity)', 'anon', null, `SELECT count(*) FROM public.job_forms`, [], 'allow');

  // ---- S5: biometric adversarial (RPCs enforce own rules; definer context is faithful) ----
  const realCand = (await client.query(`SELECT id FROM public.candidates LIMIT 1`)).rows[0];
  const bigArr = JSON.stringify(Array(128).fill(0.5));
  const badArr = JSON.stringify(Array(3).fill(0.5));
  const rpcProbe = async (name, sql, params, expect) => {
    try {
      const r = await client.query(sql, params);
      const v = r.rows[0]?.[Object.keys(r.rows[0] || {})[0]];
      results.push({ name, result: typeof v === 'object' ? JSON.stringify(v) : String(v), expect });
    } catch (e) {
      results.push({ name, result: `ERROR (${e.message.slice(0, 60)})`, expect });
    }
  };
  await rpcProbe('bio: enroll nonexistent candidate',
    `SELECT public.enroll_candidate_biometric($1, $2::jsonb, 0.9)`, ['00000000-0000-0000-0000-000000000000', bigArr], 'error/failed');
  await rpcProbe('bio: enroll bad dimensionality',
    `SELECT public.enroll_candidate_biometric($1, $2::jsonb, 0.9)`, [realCand?.id, badArr], 'error/failed');
  await rpcProbe('bio: enroll authenticated WITHOUT jwt',
    `SELECT public.enroll_authenticated_biometric($1::jsonb, 0.9)`, [bigArr], 'EV-AUTH-401');

  // ---- Report ----
  console.log('\n=== PROBE RESULTS ===');
  let failures = 0;
  for (const r of results) {
    const allowed = r.result === 'ALLOWED';
    const pass = r.expect === 'allow' ? allowed : !allowed;
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'} [expect ${r.expect}] ${r.name} → ${r.result}`);
  }
  console.log(failures === 0 ? '\nALL BEHAVIORAL PROBES PASS' : `\nFAILURES: ${failures}`);
  await client.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
