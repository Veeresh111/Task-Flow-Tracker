/* Read-only: tasks schema for policy scoping. */
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
  const c = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' ORDER BY ordinal_position`);
  console.log('tasks columns:', c.rows.map(r => `${r.column_name}:${r.data_type}`).join(', '));
  const a = await client.query(`SELECT policyname, cmd, COALESCE(qual,'') AS q, COALESCE(with_check,'') AS w FROM pg_policies WHERE tablename='tasks'`);
  for (const r of a.rows) console.log(`${r.policyname} [${r.cmd}] using=${r.q.slice(0,180)} check=${r.w.slice(0,180)}`);
  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
