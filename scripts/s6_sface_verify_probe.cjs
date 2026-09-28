/* S6: live probe of token-bound SFace cosine verification (migration 32).
   Re-runnable: if the picked candidate is already enrolled (first-wins),
   the probe verifies against the SERVER-stored descriptor (read as postgres
   purely for test setup). Properties proven are identical. */
const { Client } = require('pg');
const results = [];
const log = (ok, name, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' → ' + detail : ''}`); };

async function main() {
require('./env-loader.cjs');
  const db = new Client({ host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await db.connect();

  const subj = (await db.query(`
    SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
    FROM public.candidates c JOIN public.job_applications ja ON ja.candidate_id = c.id
    JOIN public.assessments a ON a.job_form_id = ja.form_id
    WHERE a.status='Active' AND NOT EXISTS (SELECT 1 FROM public.assessment_tokens t WHERE t.candidate_id=c.id AND t.assessment_id=a.id)
    ORDER BY random() LIMIT 1`)).rows[0];
  if (!subj) { console.log('NO SUBJECT — all eligible candidates have tokens; free probe tokens and rerun'); process.exit(2); }

  const hr = (await db.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`)).rows[0];
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: hr.id, role: 'authenticated' })]);

  const issued = (await db.query(`SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r`, [subj.application_id, subj.assessment_id])).rows[0].r;
  if (!issued.raw_token) { console.log('ISSUANCE FAILED', JSON.stringify(issued)); process.exit(2); }
  const raw = issued.raw_token;

  // Baseline vector for THIS run: stored descriptor if already enrolled,
  // else a fresh deterministic 128-d vector that we enroll now.
  let enrolledVec;
  const prior = (await db.query(`SELECT descriptor FROM public.candidate_biometrics WHERE candidate_id=$1`, [subj.candidate_id])).rows[0];
  if (prior?.descriptor) {
    enrolledVec = prior.descriptor;
    const enr = (await db.query(`SELECT public.enroll_candidate_biometric_token($1,$2::jsonb,0.95) AS r`, [raw, JSON.stringify(enrolledVec)])).rows[0].r;
    log(enr.success === true && enr.already_enrolled === true, 're-enrollment refused (first-wins holds)', `already_enrolled=${enr.already_enrolled}`);
  } else {
    enrolledVec = Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.11));
    const enr = (await db.query(`SELECT public.enroll_candidate_biometric_token($1,$2::jsonb,0.95) AS r`, [raw, JSON.stringify(enrolledVec)])).rows[0].r;
    log(enr.success === true && enr.already_enrolled === false, 'token-bound enrollment (SFace 128-d)', JSON.stringify(enr).slice(0, 60));
  }

  const v1 = (await db.query(`SELECT public.verify_candidate_biometric_face_token($1,$2::jsonb,0.363) AS r`, [raw, JSON.stringify(enrolledVec)])).rows[0].r;
  log(v1.enrolled === true && v1.verified === true, 'same-embedding verify → verified', `sim=${v1.similarity}`);

  const nearVec = enrolledVec.map((x, i) => x + (i % 7) * 0.01);
  const v2 = (await db.query(`SELECT public.verify_candidate_biometric_face_token($1,$2::jsonb,0.363) AS r`, [raw, JSON.stringify(nearVec)])).rows[0].r;
  log(v2.verified === true, 'near-embedding verify → verified', `sim=${v2.similarity}`);

  const orthoVec = Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.37));
  const v3 = (await db.query(`SELECT public.verify_candidate_biometric_face_token($1,$2::jsonb,0.363) AS r`, [raw, JSON.stringify(orthoVec)])).rows[0].r;
  log(v3.enrolled === true && v3.verified === false, 'different-embedding verify → denied truthfully', `sim=${v3.similarity}`);

  const v4 = (await db.query(`SELECT public.verify_candidate_biometric_face_token($1,$2::jsonb,0.363) AS r`, ['totally-invalid-token-aaaaaaaaaa', JSON.stringify(enrolledVec)])).rows[0].r;
  log(v4.enrolled === false && v4.verified === false && v4.reason === 'TOKEN_INVALID', 'invalid token → no identity oracle', v4.reason);

  const priv = await db.query(`SELECT has_function_privilege('anon','public.verify_candidate_biometric_face(uuid,jsonb,numeric)','EXECUTE') a`);
  log(priv.rows[0].a === false, 'legacy client-id verify revoked from anon', `anon_exec=${priv.rows[0].a}`);

  const v5 = (await db.query(`SELECT public.verify_candidate_biometric_face_token($1,$2::jsonb,0.363) AS r`, [raw, JSON.stringify(Array(128).fill(0))])).rows[0].r;
  log(v5.verified === false && v5.reason === 'DEGENERATE_VECTOR', 'zero-vector rejected as degenerate', v5.reason);

  const fails = results.filter(x => !x).length;
  console.log(`\nRESULT: ${results.length - fails}/${results.length} pass`);
  await db.end();
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
