/* Read-only: full bodies of failing scheduler functions + find real clockout fn. */
const { Client } = require('pg');

async function q(client, label, sql) {
  try {
    const r = await client.query(sql);
    for (const row of r.rows) {
      const def = Object.values(row)[0];
      console.log(`\n===== ${label} =====\n${typeof def === 'string' ? def : JSON.stringify(row)}`);
    }
    if (r.rows.length === 0) console.log(`\n===== ${label} ===== (none)`);
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

  await q(client, 'auto_offboard_employees',
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname='auto_offboard_employees'`);

  await q(client, 'flag_daily_absentees',
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname='flag_daily_absentees'`);

  await q(client, 'functions referencing work_logs',
    `SELECT p.proname FROM pg_proc p
     WHERE pg_get_functiondef(p.oid) ~* 'work_logs' AND p.pronamespace='public'::regclass`);

  await q(client, 'functions updating profiles (offboarding-ish)',
    `SELECT p.proname FROM pg_proc p
     WHERE pg_get_functiondef(p.oid) ~* 'archived|terminated' AND p.pronamespace='public'::regclass`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
