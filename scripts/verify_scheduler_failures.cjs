/* Live investigation: scheduled-job failure records (clockout / absentee).
   Read-only. Env injected by caller. */
const { Client } = require('pg');

async function q(client, label, sql) {
  try {
    const r = await client.query(sql);
    console.log(label, JSON.stringify(r.rows));
  } catch (e) {
    console.log(label, 'QUERY_ERROR:', e.message);
  }
}

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

  // Find any failure/exception tables and their shape
  await q(client, 'A. Failure-ish tables:',
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND (
       table_name ~ '(failure|exception|error|dead|job|task|reminder|absent)' )`);

  await q(client, 'B. Cron jobs live:',
    `SELECT jobid, schedule, jobname, active FROM cron.job ORDER BY jobid`);

  await q(client, 'C. Recent cron run statuses:',
    `SELECT jobid, status, count(*)::int AS n, max(end_time) AS last_end
     FROM cron.job_run_details WHERE start_time > now() - interval '7 days'
     GROUP BY jobid, status ORDER BY jobid`);

  await q(client, 'D. Failed run details (sample):',
    `SELECT jobid, status, left(COALESCE(return_message,''),160) AS msg, end_time
     FROM cron.job_run_details
     WHERE status='failed' AND start_time > now() - interval '7 days'
     ORDER BY end_time DESC LIMIT 12`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
