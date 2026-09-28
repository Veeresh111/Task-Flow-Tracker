/* Read-only: locate the real audit table. */
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
  const r = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ~ '(audit|log|activit|event|notif)'`);
  console.log('Audit-ish tables:', JSON.stringify(r.rows));
  for (const row of r.rows) {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [row.table_name]);
    console.log(row.table_name, '→', cols.rows.map(c => c.column_name).join(', '));
  }
  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
