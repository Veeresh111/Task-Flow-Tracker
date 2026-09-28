/* Live verification: which parts of migration 20260921000009 actually applied?
   Env is injected by the caller: set -a && source .env.local; set +a; node script */
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

  const checks = [
    ['A. Migration 9 recorded?', `SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '20260921000009%'`],
    ['B. Cron-path payroll uses canonical calculate_tds?', `SELECT pg_get_functiondef(p.oid) ~ 'public\\.calculate_tds' AS uses_canonical_tds FROM pg_proc p WHERE p.proname='auto_process_monthly_payroll_idempotent'`],
    ['C. Consistency guard trigger exists?', `SELECT tgname FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal`],
    ['D. Drift rows remaining (terminated + active)?', `SELECT count(*)::int AS drift_rows FROM public.profiles WHERE employment_status='terminated' AND status='active'`],
    ['E. calculate_pt_gross exists?', `SELECT count(*)::int AS n FROM pg_proc WHERE proname='calculate_pt_gross'`],
    ['F. payslips algorithm_version column?', `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='payslips' AND column_name='algorithm_version'`],
  ];

  for (const [label, sql] of checks) {
    try {
      const r = await client.query(sql);
      console.log(label, JSON.stringify(r.rows));
    } catch (e) {
      console.log(label, 'QUERY_ERROR:', e.message);
    }
  }

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
