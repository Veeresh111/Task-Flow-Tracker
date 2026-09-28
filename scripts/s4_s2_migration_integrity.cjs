/* S4-S2: Migration deployment-integrity verifier.
   INVARIANT: migration recorded → schema objects exist → behavioral probe passes.
   Usage: node scripts/s4_s2_migration_integrity.cjs
   Exit code 0 = all invariants hold; 1 = silent-failure detected. */
const { Client } = require('pg');

const REQUIRED = [
  {
    id: '20260921000009_payroll_audit_fixes',
    objects: [
      ['function calculate_pt_gross', `SELECT 1 FROM pg_proc WHERE proname='calculate_pt_gross'`],
      ['payslips.algorithm_version', `SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='algorithm_version'`],
      ['trigger consistency', `SELECT 1 FROM pg_trigger WHERE tgname='trg_profile_employment_consistency' AND NOT tgisinternal`],
      ['cron fn uses canonical tds', `SELECT 1 FROM pg_proc p WHERE p.proname='auto_process_monthly_payroll_idempotent' AND pg_get_functiondef(p.oid) ~ 'public\\.calculate_tds'`],
    ],
    probe: `SELECT (public.calculate_pt_gross(20000, 200) = 200) AS pt_ok`,
    expect: (rows) => rows[0].pt_ok === true,
  },
  {
    id: '20260921000010_scheduler_repair',
    objects: [
      ['audit_logs table', `SELECT 1 FROM information_schema.tables WHERE table_name='audit_logs'`],
      ['auto_clock_out exists', `SELECT 1 FROM pg_proc WHERE proname='auto_clock_out'`],
      ['audit_logs RLS enabled', `SELECT 1 FROM pg_class c WHERE c.relname='audit_logs' AND c.relrowsecurity`],
    ],
    probe: `SELECT (public.auto_clock_out()->>'success')::boolean AS ok, (SELECT count(*)::int FROM public.work_logs WHERE clock_out IS NULL AND status='Active') AS open_logs`,
    expect: (rows) => rows[0].ok === true && rows[0].open_logs === 0,
  },
  {
    id: '20260921000011_offboarding_role_vocabulary',
    objects: [
      ['role check includes archived', `SELECT 1 FROM pg_constraint WHERE conname='profiles_role_check' AND pg_get_constraintdef(oid) LIKE '%archived%'`],
    ],
    probe: `SELECT count(*)::int AS stuck FROM public.resignations r JOIN public.profiles p ON p.id=r.user_id WHERE r.status='Approved' AND r.expected_last_day < CURRENT_DATE AND (p.role IS DISTINCT FROM 'archived' OR p.status IS DISTINCT FROM 'inactive' OR p.employment_status IS DISTINCT FROM 'terminated')`,
    expect: (rows) => rows[0].stuck === 0,
  },
  {
    id: '20260921000012_authenticated_biometric_enrollment',
    objects: [
      ['fn exists', `SELECT 1 FROM pg_proc WHERE proname='enroll_authenticated_biometric'`],
      ['anon cannot execute', `SELECT 1 WHERE has_function_privilege('anon', 'public.enroll_authenticated_biometric(jsonb,numeric)', 'EXECUTE')`],
    ],
    probe: `SELECT 1 FROM pg_proc WHERE proname='enroll_authenticated_biometric' AND pg_get_functiondef(oid) ~ 'auth\\.uid'`,
    expect: (rows) => rows.length === 1,
  },
  {
    id: '20260921000013_profile_directory_minimization',
    objects: [
      ['blanket ALL policy gone', `SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Authenticated users full access profiles'`],
      ['fan-out RPC exists', `SELECT 1 FROM pg_proc WHERE proname='get_profile_ids_for_roles'`],
      ['get_user_department pinned search_path', `SELECT 1 FROM pg_proc WHERE proname='get_user_department' AND pg_get_functiondef(oid) LIKE '%search_path%'`],
    ],
    probe: `SELECT count(*)::int AS n FROM pg_policies WHERE tablename='profiles' AND cmd='ALL'`,
    expect: (rows) => rows[0].n === 0,
  },
];

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

  let failures = 0;
  for (const m of REQUIRED) {
    const rec = await client.query(`SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`, [m.id.split('_')[0]]);
    const recorded = rec.rows.length > 0;
    let objFail = [];
    for (const [name, sql] of m.objects) {
      try {
        const r = await client.query(sql);
        // For "must be absent" checks we invert expectation by name prefix
        const mustBeAbsent = name.startsWith('anon cannot') || name.startsWith('blanket');
        const present = r.rows.length > 0;
        if (mustBeAbsent ? present : !present) objFail.push(name);
      } catch (e) { objFail.push(`${name} (${e.message})`); }
    }
    let probeOk = false, probeErr = null, probeRows = null;
    try {
      const r = await client.query(m.probe);
      probeRows = JSON.stringify(r.rows[0]);
      probeOk = m.expect(r.rows);
    } catch (e) { probeErr = e.message; }
    const pass = recorded && objFail.length === 0 && probeOk;
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${m.id} | recorded=${recorded} objects=[${objFail.join(';') || 'ok'}] probe=${probeErr ? 'ERR:' + probeErr : probeRows}`);
  }

  console.log(failures === 0 ? 'ALL MIGRATION INVARIANTS HOLD' : `SILENT-FAILURES DETECTED: ${failures}`);
  await client.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
