/* Read-only: accrual function body + real schema for rewrite. */
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

  const f = await client.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='accrue_monthly_leaves_and_anniversaries'`);
  console.log(f.rows[0]?.def || 'NOT FOUND');

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND (column_name ~ 'join|start|hired|anniv')`);
  console.log('JOIN-DATE-LIKE COLUMNS:', JSON.stringify(cols.rows));

  const lb = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ~ '(leave|accrual)'`);
  console.log('LEAVE TABLES:', JSON.stringify(lb.rows));
  for (const t of lb.rows) {
    const c = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t.table_name]);
    console.log(t.table_name, '→', c.rows.map(x => x.column_name).join(', '));
  }
  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
