/* Read-only: profiles role CHECK constraint. */
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
  const r = await client.query(`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND contype='c'`);
  console.log(JSON.stringify(r.rows, null, 1));
  const v = await client.query(`SELECT DISTINCT role FROM public.profiles`);
  console.log('Distinct roles in use:', JSON.stringify(v.rows));
  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
