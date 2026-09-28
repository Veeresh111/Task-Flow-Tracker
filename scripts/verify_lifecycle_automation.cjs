/* Live DB check: lifecycle automation arrows — what fires when business events happen.
 * Read-only: inspects triggers, functions, tables, and probe-invokes safe paths. */
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

  const q = async (label, sql) => {
    try {
      const r = await client.query(sql);
      console.log(`\n=== ${label} (${r.rowCount}) ===`);
      r.rows.forEach(x => console.log(' ', Object.values(x).join(' | ').slice(0, 160)));
    } catch (e) { console.log(`\n=== ${label} ERROR ===\n ${e.message.slice(0, 140)}`); }
  };

  // 1. All event triggers on lifecycle tables
  await q('TRIGGERS on job_applications',
    `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.job_applications'::regclass AND NOT tgisinternal`);
  await q('TRIGGERS on assessment_attempts',
    `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.assessment_attempts'::regclass AND NOT tgisinternal`);
  await q('TRIGGERS on offer_letters',
    `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.offer_letters'::regclass AND NOT tgisinternal`);
  await q('TRIGGERS on profiles',
    `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal`);
  await q('TRIGGERS on resignations',
    `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.resignations'::regclass AND NOT tgisinternal`);

  // 2. Lifecycle-relevant functions
  await q('FUNCTIONS (interview/offer/hire/activate/onboard/fnf/offboard/resign)',
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname ~ '(interview|offer|hire|hiring|activat|onboard|fnf|settle|offboard|resign)')
     ORDER BY p.proname`);

  // 3. Tables in the lifecycle
  await q('LIFECYCLE TABLES',
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND (c.relname ~ '(interview|offer|hiring|activation|onboard|fnf|settle|offboard|resign|employee|attendance|leave|payroll|payslip)')
     ORDER BY c.relname`);

  // 4. Cron registry with last/next run
  await q('CRON JOBS with run stats',
    `SELECT j.jobname, j.schedule, j.command,
       (SELECT max(start_time)::date FROM cron.job_run_details rd WHERE rd.jobid=j.jobid) AS last_run,
       (SELECT count(*) FROM cron.job_run_details rd WHERE rd.jobid=j.jobid AND rd.status='failed') AS failures
     FROM cron.job j ORDER BY j.jobname`);

  await client.end();
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
