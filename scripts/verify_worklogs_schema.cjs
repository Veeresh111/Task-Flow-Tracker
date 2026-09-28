/* Read-only: work_logs full schema detail for safe auto_clock_out design. */
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

  await q(client, 'A. work_logs columns (nullable):',
    `SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='work_logs' ORDER BY ordinal_position`);

  await q(client, 'B. work_logs check constraints:',
    `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
     WHERE conrelid='public.work_logs'::regclass`);

  await q(client, 'C. work_logs triggers:',
    `SELECT tgname FROM pg_trigger WHERE tgrelid='public.work_logs'::regclass AND NOT tgisinternal`);

  await q(client, 'D. distinct status values:',
    `SELECT status, count(*)::int FROM public.work_logs GROUP BY status ORDER BY 2 DESC LIMIT 15`);

  await q(client, 'E. currently open logs:',
    `SELECT count(*)::int FROM public.work_logs WHERE clock_out IS NULL`);

  await q(client, 'F. leaves date column types (absentee scan check):',
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='leaves' AND column_name IN ('start_date','end_date','status')`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
