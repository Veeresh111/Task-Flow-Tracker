/* S4-S4: Global RLS backdoor scan + profiles policy matrix. Read-only. */
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

  // 1. Remaining permissive ALL policies anywhere
  const all = await client.query(`
    SELECT schemaname, tablename, policyname, roles,
           left(COALESCE(qual,''),150) AS using_clause,
           left(COALESCE(with_check,''),150) AS check_clause
    FROM pg_policies WHERE cmd='ALL' AND schemaname='public'
    ORDER BY tablename`);
  console.log('=== REMAINING ALL POLICIES ===');
  for (const r of all.rows) {
    console.log(`${r.tablename}.${r.policyname} | using=${r.using_clause} | check=${r.check_clause}`);
  }
  if (all.rows.length === 0) console.log('(none)');

  // 2. WITH CHECK(true)-style unconditional policies
  const open = await client.query(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname='public'
      AND (with_check ILIKE '%true%' AND with_check NOT ILIKE '%auth.uid()%')
      AND with_check != ''
    ORDER BY tablename`);
  console.log('=== UNCONDITIONAL WITH-CHECK POLICIES ===');
  if (open.rows.length === 0) console.log('(none)');
  for (const r of open.rows) console.log(`${r.tablename}.${r.policyname} (${r.cmd})`);

  // 3. Tables with RLS disabled (anon/authenticated reachable data path)
  const noRls = await client.query(`
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
    ORDER BY c.relname`);
  console.log('=== TABLES WITHOUT RLS ===');
  if (noRls.rows.length === 0) console.log('(none)');
  console.log(noRls.rows.map(r => r.table_name).join(', '));

  // 4. Profiles policy matrix (post-hardening)
  const p = await client.query(`
    SELECT policyname, cmd, left(COALESCE(qual,''),200) AS using_clause,
           left(COALESCE(with_check,''),200) AS check_clause
    FROM pg_policies WHERE tablename='profiles' ORDER BY policyname`);
  console.log('=== PROFILES POLICY MATRIX ===');
  for (const r of p.rows) console.log(`${r.policyname} [${r.cmd}] using=${r.using_clause} check=${r.check_clause}`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
