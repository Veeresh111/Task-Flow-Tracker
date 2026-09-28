/* Live DB check: exam-path RLS + RPC inventory (read-only). */
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

  const tables = ['assessment_attempts', 'proctoring_logs', 'candidate_biometrics', 'assessment_attempt_answers'];
  for (const t of tables) {
    const r = await client.query(
      `SELECT policyname, cmd, roles, qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_withcheck
       FROM pg_policies WHERE schemaname='public' AND tablename=$1 ORDER BY policyname`, [t]);
    console.log(`\n=== POLICIES ${t} (${r.rowCount}) ===`);
    r.rows.forEach(p => console.log(` ${p.policyname} | ${p.cmd} | roles=${p.roles} | using=${p.has_using} | withcheck=${p.has_withcheck}`));
    const rls = await client.query(
      `SELECT c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=$1`, [t]);
    console.log(` RLS enabled=${rls.rows[0]?.relrowsecurity} forced=${rls.rows[0]?.relforcerowsecurity}`);
  }

  const fns = await client.query(
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname ILIKE '%biometric%' OR p.proname ILIKE '%proctor%' OR p.proname ILIKE '%attempt%' OR p.proname ILIKE '%grade%' OR p.proname ILIKE '%assessment%')
     ORDER BY p.proname`);
  console.log(`\n=== FUNCTIONS (assessment/biometric/proctor) ===`);
  fns.rows.forEach(f => console.log(` ${f.proname}(${f.args})`));

  // Attempt ownership columns
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='assessment_attempts' ORDER BY ordinal_position`);
  console.log(`\n=== assessment_attempts COLUMNS ===`);
  cols.rows.forEach(c => console.log(` ${c.column_name} ${c.data_type} null=${c.is_nullable}`));

  await client.end();
}

main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
