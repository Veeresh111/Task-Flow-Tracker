/* S4-S3: Deep cron audit — every job's target function exists, historical
   runs, and idempotency evidence. Read-only. */
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

  // 1. Extract each job's target function and verify existence
  const jobs = await client.query(`SELECT jobid, jobname, command FROM cron.job ORDER BY jobid`);
  for (const j of jobs.rows) {
    const m = j.command.match(/public\.([a-zA-Z_0-9]+)/);
    const fn = m ? m[1] : null;
    let exists = null, def = null;
    if (fn) {
      const e = await client.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname=$1`, [fn]);
      exists = e.rows[0].n > 0;
      if (exists) {
        const d = await client.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname=$1`, [fn]);
        def = d.rows[0].def;
      }
    }
    console.log(`JOB ${j.jobid} ${j.jobname}: fn=${fn} exists=${exists}`);
    // Flag jobs whose function body references likely-missing columns (like the absentee 'date' bug)
    if (def && /work_logs/i.test(def) && /(\bdate\s*=|\bdate,|\(date\b)/i.test(def)) {
      console.log(`  ⚠ POSSIBLE SCHEMA MISMATCH: references bare 'date' on work_logs`);
    }
    if (def && /profiles/i.test(def) && /SET role|UPDATE public\.profiles/i.test(def) && !/set_config|request\.jwt/i.test(def)) {
      console.log(`  ⚠ PROFILE UPDATE WITHOUT AUTH-CONTEXT GUARD (cron JWT-less failure class)`);
    }
  }

  // 2. Run history for monthly jobs (8, 9) — did they ever run? succeed?
  const hist = await client.query(`
    SELECT jobid, status, count(*)::int AS n, max(end_time) AS last_end,
           max(left(COALESCE(return_message,''),120)) AS sample_msg
    FROM cron.job_run_details
    WHERE jobid IN (8, 9)
    GROUP BY jobid, status ORDER BY jobid`);
  console.log('MONTHLY JOB HISTORY:', JSON.stringify(hist.rows));

  // 3. Duration outliers (performance hazard check)
  const dur = await client.query(`
    SELECT jobid, round(avg(extract(epoch from (end_time - start_time)))::numeric, 2) AS avg_s,
           max(round(extract(epoch from (end_time - start_time)))::numeric) AS max_s
    FROM cron.job_run_details WHERE start_time > now() - interval '7 days'
    GROUP BY jobid ORDER BY jobid`);
  console.log('DURATIONS 7d (s):', JSON.stringify(dur.rows));

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
