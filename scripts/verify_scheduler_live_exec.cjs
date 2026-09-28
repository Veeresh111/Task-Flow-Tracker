/* Live execution proof of the three repaired scheduler functions.
   Read-only EXCEPT the deliberate invocation of the production scheduled
   jobs themselves — same code path pg_cron uses (direct SELECT of the fn).
   Env injected by caller. */
const { Client } = require('pg');

async function q(client, label, sql) {
  try {
    const r = await client.query(sql);
    console.log(label, JSON.stringify(r.rows));
    return r;
  } catch (e) {
    console.log(label, 'QUERY_ERROR:', e.message);
    return null;
  }
}

async function main() {
  const client = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    password: process.env.SUPABASE_DB_PASSWORD,
    user: 'postgres',
    port: 5432,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // BEFORE state
  await q(client, 'BEFORE stuck offboardings:',
    `SELECT count(*)::int FROM public.resignations r JOIN public.profiles p ON p.id=r.user_id
     WHERE r.status='Approved' AND r.expected_last_day < CURRENT_DATE
       AND (p.role IS DISTINCT FROM 'archived' OR p.status IS DISTINCT FROM 'inactive'
            OR p.employment_status IS DISTINCT FROM 'terminated')`);

  await q(client, 'BEFORE open work_logs:', `SELECT count(*)::int FROM public.work_logs WHERE clock_out IS NULL AND status='Active'`);

  // Execute the scheduled jobs (same invocation pg_cron performs)
  await q(client, 'EXEC auto_offboard_employees:', `SELECT public.auto_offboard_employees()`);
  await q(client, 'EXEC auto_clock_out:', `SELECT public.auto_clock_out()`);
  await q(client, 'EXEC flag_daily_absentees:', `SELECT public.flag_daily_absentees()`);

  // AFTER state
  await q(client, 'AFTER stuck offboardings:',
    `SELECT count(*)::int FROM public.resignations r JOIN public.profiles p ON p.id=r.user_id
     WHERE r.status='Approved' AND r.expected_last_day < CURRENT_DATE
       AND (p.role IS DISTINCT FROM 'archived' OR p.status IS DISTINCT FROM 'inactive'
            OR p.employment_status IS DISTINCT FROM 'terminated')`);

  await q(client, 'AFTER open work_logs:', `SELECT count(*)::int FROM public.work_logs WHERE clock_out IS NULL AND status='Active'`);

  await q(client, 'AFTER audit rows:', `SELECT action, count(*)::int FROM public.audit_logs GROUP BY action`);

  await q(client, 'AFTER idempotency (re-run absentee):', `SELECT public.flag_daily_absentees()`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
