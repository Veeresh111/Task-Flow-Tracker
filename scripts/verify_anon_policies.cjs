/* Live DB check: full policy definitions for exam-path tables (read-only). */
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

  const p = await client.query(
    `SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
     FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('proctoring_logs','assessment_attempts')
     ORDER BY tablename, policyname`);
  p.rows.forEach(r => {
    console.log(`\n[${r.tablename}] ${r.policyname} (${r.cmd}) roles=${r.roles}`);
    console.log(`  USING: ${r.qual || '-'}`);
    console.log(`  WITH CHECK: ${r.with_check || '-'}`);
  });

  await client.end();
}

main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
