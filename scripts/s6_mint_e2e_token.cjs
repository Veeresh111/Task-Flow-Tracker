/* S6: E2E token mint — with truthful diagnostics (no swallowed errors).
   Prints the exact failure reason (no eligible pair vs RPC error) and the
   raw token on success. Usage: node scripts/s6_mint_e2e_token.cjs */
const { Client } = require('pg');
require('./env-loader.cjs');

(async () => {
  const c = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 1) How does the live schema actually join assessments to applications?
  const aCols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='assessments' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
  console.log('assessments columns:', aCols.join(', '));

  // 2) Count eligible pairs under two candidate join shapes.
  const shapes = [
    ['via job_form_id', `SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
        FROM public.candidates c
        JOIN public.job_applications ja ON ja.candidate_id = c.id
        JOIN public.assessments a ON a.job_form_id = ja.form_id
        WHERE a.status='Active'
          AND NOT EXISTS (SELECT 1 FROM public.assessment_tokens t WHERE t.candidate_id=c.id AND t.assessment_id=a.id)`],
    ['via application_id', `SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
        FROM public.candidates c
        JOIN public.job_applications ja ON ja.candidate_id = c.id
        JOIN public.assessments a ON a.application_id = ja.id
        WHERE a.status='Active'
          AND NOT EXISTS (SELECT 1 FROM public.assessment_tokens t WHERE t.candidate_id=c.id AND t.assessment_id=a.id)`],
  ];
  let picked = null;
  for (const [name, sql] of shapes) {
    try {
      const rows = (await c.query(sql)).rows;
      console.log(`eligible pairs (${name}):`, rows.length);
      if (rows.length && !picked) picked = rows[0];
    } catch (e) {
      console.log(`shape ${name} invalid:`, e.message.split('\n')[0]);
    }
  }
  if (!picked) { console.log('VERDICT: pool dry — every eligible pair already has a token'); await c.end(); process.exit(2); }

  // 3) Mint with HR context — surface RPC errors instead of swallowing.
  const hr = (await c.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`)).rows[0];
  await c.query(`SELECT set_config($1, $2, false)`, ['request.jwt.claims', JSON.stringify({ sub: hr.id, role: 'authenticated' })]);
  let issued;
  try {
    issued = (await c.query('SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r', [picked.application_id, picked.assessment_id])).rows[0].r;
  } catch (e) {
    console.log('RPC ERROR:', e.message.split('\n')[0]);
    await c.end(); process.exit(3);
  }
  if (!issued || !issued.raw_token) {
    console.log('RPC returned no raw_token:', JSON.stringify(issued).slice(0, 300));
    await c.end(); process.exit(3);
  }
  console.log('MINTED', issued.raw_token);
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(4); });
