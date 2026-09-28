/* Live DB check: assessment_tokens policy ground truth (read-only). */
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
    `SELECT policyname, cmd, roles::text AS roles, qual, with_check
     FROM pg_policies
     WHERE schemaname='public' AND tablename='assessment_tokens'
     ORDER BY policyname`);
  p.rows.forEach(r => {
    console.log(`\n${r.policyname} (${r.cmd}) roles=${r.roles}`);
    console.log(`  USING: ${(r.qual || '-').slice(0, 200)}`);
    console.log(`  WC: ${(r.with_check || '-').slice(0, 200)}`);
  });

  await client.end();
}

main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
