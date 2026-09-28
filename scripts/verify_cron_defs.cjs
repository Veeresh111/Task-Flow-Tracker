/* Read-only: exact cron commands + table shapes for failing jobs. Env injected. */
const { Client } = require('pg');

async function q(client, label, sql) {
  try {
    const r = await client.query(sql);
    console.log(label, JSON.stringify(r.rows, null, 1).slice(0, 3000));
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

  await q(client, 'A. Cron commands 1,2,10:',
    `SELECT jobid, jobname, command FROM cron.job WHERE jobid IN (1,2,10)`);

  await q(client, 'B. work_logs columns:',
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='work_logs' ORDER BY ordinal_position`);

  await q(client, 'C. attendance-ish tables:',
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name ~ '(attendance|work_log|clock)'`);

  await q(client, 'D. auto-clockout-ish functions:',
    `SELECT proname FROM pg_proc WHERE proname ~ '(clock|absent)'`);

  await q(client, 'E. prevent_self_role_change def:',
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname='prevent_self_role_change'`);

  await q(client, 'F. offboarding function (job1 target):',
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p
     WHERE pg_get_functiondef(p.oid) LIKE '%daily_offboarding%' OR proname ~ 'offboard' LIMIT 1`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
