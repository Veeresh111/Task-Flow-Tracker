/* Live deep-dive: exact policy definitions for exposed tables + who can abuse them. Read-only. */
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const queries = [
    ['PROFILES POLICIES (full definitions)',
     `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles'`],
    ['JOB_APPLICATIONS POLICIES (full definitions)',
     `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='job_applications'`],
    ['CANDIDATES POLICIES (full definitions)',
     `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='candidates'`],
    ['MESSAGES/CHAT POLICIES',
     `SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('messages','chat_messages','chat_reads','candidate_hr_messages') ORDER BY 1`],
    ['NOTIFICATIONS POLICIES',
     `SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('notifications','candidate_notifications') ORDER BY 1`],
    ['PAYROLL POLICIES',
     `SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('payroll_cycles','payroll_audit','salary_structures','salary_components') ORDER BY 1`],
    ['JOBS/CRON REGISTERED',
     `SELECT jobname, schedule, command FROM cron.job ORDER BY jobname`],
    ['PG_NET EXTENSION',
     `SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_net','pg_cron')`],
    ['RECENT EMAILS BY STATUS',
     `SELECT status, count(*) FROM pending_emails GROUP BY 1`],
    ['HIRING OPERATIONS STATE',
     `SELECT status, count(*) FROM candidate_hiring_operations GROUP BY 1`],
    ['STORAGE BUCKETS',
     `SELECT id, name, public FROM storage.buckets ORDER BY name`],
  ];

  for (const [label, sql] of queries) {
    console.log(`\n=== ${label} ===`);
    try {
      const res = await client.query(sql);
      if (res.rows.length === 0) console.log('(no rows)');
      else console.table(res.rows.map(r => {
        const o = {};
        for (const k of Object.keys(r)) {
          let v = r[k];
          if (v !== null && typeof v === 'object') v = JSON.stringify(v);
          if (typeof v === 'string' && v.length > 260) v = v.slice(0, 260) + '…';
          o[k] = v;
        }
        return o;
      }));
    } catch (e) { console.log('QUERY ERROR:', e.message); }
  }
  await client.end();
}
main().catch(e => { console.error('CONNECT FAILED:', e.message); process.exit(1); });
