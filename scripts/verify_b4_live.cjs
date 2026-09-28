/* Live verification of migration 13 (B4 completion). Read-only. */
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

  const p = await client.query(`
    SELECT policyname, cmd,
           left(COALESCE(qual,''),120) AS using_clause,
           left(COALESCE(with_check,''),120) AS check_clause
    FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
    ORDER BY policyname`);
  console.log('POLICIES:', JSON.stringify(p.rows, null, 1));

  const blanket = p.rows.find(r => r.policyname === 'Authenticated users full access profiles');
  console.log(blanket ? 'FAIL: blanket ALL policy still present' : 'OK: blanket ALL policy removed');

  // RPC projections callable by owner
  try {
    const hr = await client.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`);
    if (hr.rows[0]) {
      const fan = await client.query(`SELECT * FROM public.get_profile_ids_for_roles(ARRAY['hr','admin'])`);
      console.log('OK: get_profile_ids_for_roles resolves staff:', JSON.stringify(fan.rows));
    }
  } catch (e) { console.log('FANOUT_PROBE_ERROR:', e.message); }

  // Gating probe: emulate non-staff caller via JWT-less role check should NOT
  // resolve employee list. (auth.uid() is null in this session → function
  // returns nothing for non-staff path; staff path also requires auth.uid for
  // non-privileged. Verify it returns 0 rows here — proves no anonymous use.)
  const gated = await client.query(`SELECT count(*)::int FROM public.get_profile_ids_for_roles(ARRAY['employee'])`);
  console.log('Gating probe (no-JWT employee list):', gated.rows[0], '(expect 0)');

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
