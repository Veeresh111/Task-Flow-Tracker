/* Read-only: current live profiles RLS policy state (post-hardening). */
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
    SELECT policyname, cmd, roles,
           left(COALESCE(qual,''), 300) AS using_clause,
           left(COALESCE(with_check,''), 300) AS check_clause
    FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
    ORDER BY policyname`);
  console.log(JSON.stringify(r.rows, null, 1));

  const g = await client.query(`
    SELECT grantee, privilege_type, column_name IS NOT NULL AS col_specific
    FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('anon','authenticated')
    LIMIT 40`);
  console.log('Column privileges:', JSON.stringify(g.rows));

  const d = await client.query(`SELECT count(*)::int FROM pg_proc WHERE proname='get_directory_profiles'`);
  console.log('get_directory_profiles exists:', d.rows[0]);
  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
