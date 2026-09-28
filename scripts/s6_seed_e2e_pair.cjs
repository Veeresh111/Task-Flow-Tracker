/* S6: seed a fresh, clearly-marked E2E candidate + application + assessment
   pair, then mint a token. Test data prefixed E2E_TEST_20260921_* so it can
   never be confused with production rows. Usage: node scripts/s6_seed_e2e_pair.cjs */
const { Client } = require('pg');
require('./env-loader.cjs');

const TAG = `E2E_TEST_20260921_${Date.now()}`;

(async () => {
  const c = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Inspect live shape first — never assume columns.
  const cols = async (t) =>
    (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}'`)).rows.map(r => r.column_name);

  const cCols = await cols('candidates');
  const jaCols = await cols('job_applications');
  const aCols = await cols('assessments');
  const jfCols = await cols('job_forms');
  console.log('candidates has first_name/last_name:', cCols.includes('first_name'), cCols.includes('last_name'));
  console.log('job_applications has form_id/status:', jaCols.includes('form_id'), jaCols.includes('status'));
  console.log('assessments has job_form_id/status/duration:', aCols.includes('job_form_id'), aCols.includes('status'), aCols.includes('duration_minutes'));

  // 1) Fresh candidate
  const cand = (await c.query(
    `INSERT INTO public.candidates (full_name, email, phone, created_at)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [TAG, `${TAG.toLowerCase()}@e2e-test.invalid`, `+910000000000`]
  )).rows[0];

  // 2) Job form + assessment (Active). Live schema: job_title + form_schema.
  const form = (await c.query(
    `INSERT INTO public.job_forms (job_title, form_schema, status, created_at)
     VALUES ($1, $2::jsonb, 'Active', now()) RETURNING id`,
    [`Form ${TAG}`, JSON.stringify({})]
  )).rows[0];

  const durCol = aCols.includes('duration_minutes') ? 'duration_minutes' : (aCols.includes('duration') ? 'duration' : null);
  // Live schema: questions jsonb NOT NULL — supply a minimal one-question form.
  const aSql = durCol
    ? `INSERT INTO public.assessments (job_form_id, title, status, ${durCol}, questions, created_at) VALUES ($1,$2,'Active',$3,$4::jsonb,now()) RETURNING id`
    : `INSERT INTO public.assessments (job_form_id, title, status, questions, created_at) VALUES ($1,$2,'Active',$3::jsonb,now()) RETURNING id`;
  const minimalQuestions = JSON.stringify([
    { id: 'q1', type: 'mcq', question: 'E2E smoke question: 2+2?', options: ['3', '4'], correct_answer: '4' },
  ]);
  const assessment = (await c.query(aSql, durCol ? [form.id, `Assessment ${TAG}`, 60, minimalQuestions] : [form.id, `Assessment ${TAG}`, minimalQuestions])).rows[0];

  // 3) Application linking candidate → form (live schema: name/email/answers NOT NULL)
  const app = (await c.query(
    `INSERT INTO public.job_applications (candidate_id, form_id, candidate_name, candidate_email, answers, status, created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,'Applied',now()) RETURNING id`,
    [cand.id, form.id, TAG, `${TAG.toLowerCase()}@e2e-test.invalid`, JSON.stringify({ e2e: true })]
  )).rows[0];

  // 4) Mint token with HR context
  const hr = (await c.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`)).rows[0];
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: hr.id, role: 'authenticated' })]);
  const issued = (await c.query('SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r', [app.id, assessment.id])).rows[0].r;
  if (!issued || !issued.raw_token) {
    console.log('RPC returned no raw_token:', JSON.stringify(issued).slice(0, 300));
    await c.end(); process.exit(3);
  }
  console.log('SEEDED', TAG);
  console.log('MINTED', issued.raw_token);
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(4); });
