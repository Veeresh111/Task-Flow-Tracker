/* Live DB check: proctoring_logs + candidate_biometrics schema + verify RPC def (read-only). */
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

  for (const t of ['proctoring_logs', 'candidate_biometrics']) {
    const cols = await client.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(`\n=== ${t} COLUMNS ===`);
    cols.rows.forEach(c => console.log(` ${c.column_name} ${c.data_type} null=${c.is_nullable}`));
  }

  const def = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='verify_candidate_biometric_face'`);
  console.log('\n=== verify_candidate_biometric_face DEF ===');
  console.log(def.rows[0]?.d || 'NOT FOUND');

  // Assessment tokens columns (attempt_id presence etc.)
  const tok = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='assessment_tokens' ORDER BY ordinal_position`);
  console.log('\n=== assessment_tokens COLUMNS ===');
  tok.rows.forEach(c => console.log(` ${c.column_name} ${c.data_type}`));

  await client.end();
}

main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
