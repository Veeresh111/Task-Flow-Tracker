/* S5 P12: submission-gate adversarial probe.
   Attack: call the deployed grade-assessment Edge Function with an empty
   proctorLog (forged deflation). Expected: the server counts its own
   persisted proctoring_logs rows for the attempt and disqualifies anyway.
   Setup uses service-role DB access ONLY to (a) mint a test token via the
   HR RPC, (b) seed authoritative incidents via the same SECURITY DEFINER
   RPC the real browser uses, and (c) verify final DB state. */
const { Client } = require('pg');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const results = [];
function log(ok, name, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' → ' + detail : ''}`);
}

async function main() {
  const db = new Client({
    host: `db.${PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  // 1. Find a subject: active candidate + application + active assessment
  //    with NO existing token for that pair (idempotent issuance contract).
  const subj = (await db.query(`
    SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
    FROM public.candidates c
    JOIN public.job_applications ja ON ja.candidate_id = c.id
    JOIN public.assessments a ON a.job_form_id = ja.form_id
    WHERE a.status='Active'
      AND NOT EXISTS (SELECT 1 FROM public.assessment_tokens t WHERE t.candidate_id = c.id AND t.assessment_id = a.id)
    ORDER BY random()
    LIMIT 1`)).rows[0];
  if (!subj) { console.log('NO SUBJECT — probe NOT PROVEN'); process.exit(2); }
  console.log('subject: candidate', subj.candidate_id, 'max_violations = 5 (grader default; assessments.max_violations is a phantom column)');

  // HR auth context, SESSION-scoped (is_local=false) so issuance works and
  // every statement AUTOCOMMITS — the grader runs as a separate HTTP service
  // and must observe committed rows (unlike the rollback-isolated battery).
  const hr = (await db.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`)).rows[0];
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: hr.id, role: 'authenticated' })]);

  // 2. Mint a token via the HR issuance RPC (returns raw once).
  const issued = await db.query(`SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r`,
    [subj.application_id, subj.assessment_id]);
  console.log('issuance response:', JSON.stringify(issued.rows[0]?.r));
  const raw = issued.rows[0]?.r?.raw_token;
  log(!!raw, 'token minted via HR RPC');
  const seedCount = 5; // grader default maxViolations
  let seeded = 0;
  for (let i = 0; i < seedCount; i++) {
    const r = await db.query(`SELECT public.log_proctoring_event($1,$2,$3,$4) AS r`,
      [raw, 'Tab Switch / Window Focus Lost', 'warning', `P12 seed incident ${i + 1}/${seedCount}`]);
    if (r.rows[0].r.success === true) seeded++;
  }
  log(seeded === seedCount, 'incidents seeded via token-bound RPC', `${seeded}/${seedCount}`);

  const serverCountRow = await db.query(
    `SELECT count(*)::int AS cnt FROM public.proctoring_logs WHERE candidate_id=$1`, [subj.candidate_id]);
  const serverCount = serverCountRow.rows[0]?.cnt;
  log(serverCount >= seedCount, 'server rows persisted', `server_count=${serverCount}`);

  // 4. Attack: deployed grader with FORGED EMPTY proctorLog.
  const res = await fetch(`https://${PROJECT_REF}.supabase.co/functions/v1/grade-assessment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ secureToken: raw, candidateAnswers: {}, violationCount: 0, proctorLog: [] }),
  });
  const body = await res.json().catch(() => ({}));
  log(res.status === 200 && body.disqualified === true,
    'grader with forged empty proctorLog → disqualified (server rows authoritative)',
    `status=${res.status} disqualified=${body.disqualified}`);

  // 5. Verify DB state after the attack.
  const tok = (await db.query(`SELECT status, used, server_violation_count FROM public.assessment_tokens
    WHERE token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [raw])).rows[0];
  log(tok?.status === 'Disqualified' && tok?.used === true,
    'token persisted Disqualified + used', `status=${tok?.status} used=${tok?.used}`);
  log((tok?.server_violation_count ?? 0) >= seedCount,
    'server_violation_count persisted', `count=${tok?.server_violation_count}`);
  const ev = (await db.query(`SELECT proctor_log FROM public.assessment_tokens
    WHERE token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [raw])).rows[0]?.proctor_log;
  log(Array.isArray(ev) && ev.length > 0, 'server evidence snapshot persisted for HR', `entries=${Array.isArray(ev) ? ev.length : 0}`);

  const fails = results.filter(x => !x).length;
  console.log(`\nRESULT: ${results.length - fails}/${results.length} pass`);
  await db.end();
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
