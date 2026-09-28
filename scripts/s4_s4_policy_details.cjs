/* S4-S4b: full definitions of flagged policies + payslips self-read check. */
const { Client } = require('pg');

const FLAGGED = [
  ['resignations', 'Authenticated users full access resignations'],
  ['assessment_tokens', 'Allow authenticated insert assessment tokens'],
  ['assessments', 'Allow assessment insert'],
  ['assessments', 'Allow HR to publish assessments'],
  ['candidate_onboarding', 'HR can manage onboarding'],
  ['candidate_onboarding', 'Temporary Allow Insert'],
  ['complaints', 'Authenticated users full access complaints'],
  ['tasks', 'Authenticated users full access tasks'],
  ['projects', 'Authenticated users full access projects'],
  ['job_forms', 'job_forms_open_policy'],
  ['employee_analytics', 'Allow authenticated users employee analytics'],
  ['recruitment_announcements', 'hr manage announcements'],
  ['applications', 'applications_insert'],
  ['job_applications', 'applications_insert'],
  ['candidate_hr_messages', 'candidate_hr_messages_policy'],
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

  for (const [table, policy] of FLAGGED) {
    const r = await client.query(
      `SELECT tablename, policyname, cmd, roles,
              COALESCE(qual,'') AS using_clause, COALESCE(with_check,'') AS check_clause
       FROM pg_policies WHERE tablename=$1 AND policyname=$2`, [table, policy]);
    if (r.rows.length) {
      const p = r.rows[0];
      console.log(`\n### ${p.tablename} :: ${p.policyname} [${p.cmd}] roles=${JSON.stringify(p.roles)}`);
      console.log(`  USING: ${p.using_clause.slice(0, 260)}`);
      console.log(`  CHECK: ${p.check_clause.slice(0, 260)}`);
    } else {
      console.log(`\n### ${table} :: ${policy} — NOT FOUND`);
    }
  }

  // payslips: can employees read their own?
  const ps = await client.query(`SELECT policyname, cmd, COALESCE(qual,'') AS using_clause FROM pg_policies WHERE tablename='payslips'`);
  console.log('\n=== PAYSLIPS POLICIES ===');
  for (const r of ps.rows) console.log(`${r.policyname} [${r.cmd}] ${r.using_clause.slice(0, 160)}`);

  const ll = await client.query(`SELECT policyname, cmd, COALESCE(qual,'') AS using_clause FROM pg_policies WHERE tablename='leave_ledgers'`);
  console.log('\n=== LEAVE_LEDGERS POLICIES ===');
  for (const r of ll.rows) console.log(`${r.policyname} [${r.cmd}] ${r.using_clause.slice(0, 160)}`);

  // Any other policies on the flagged tables that provide legit access
  for (const t of ['resignations', 'complaints', 'tasks', 'projects', 'candidate_onboarding']) {
    const o = await client.query(`SELECT policyname, cmd FROM pg_policies WHERE tablename=$1 ORDER BY policyname`, [t]);
    console.log(`\nOTHER ${t} policies:`, o.rows.map(r => `${r.policyname}[${r.cmd}]`).join(', ') || '(none)');
  }

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
