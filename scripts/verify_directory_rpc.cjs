/* Read-only: get_directory_profiles def + who writes profiles outside admin/hr policies. */
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
  const r = await client.query(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname='get_directory_profiles'`);
  console.log(r.rows[0]?.pg_get_functiondef || 'NOT FOUND');
  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
