/* S5 P15: adversarial battery vs proctoring RPCs (live).
   Uses a real ACTIVE token if one exists; otherwise fabricates nothing and
   reports NOT PROVEN for token-dependent probes. Read-only except creating
   proctoring sessions/challenges for the probe token (test artifacts). */
const { Client } = require('pg');
require('./env-loader.cjs');

async function main() {
  const db = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  const results = [];
  const log = (pass, name, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} → ${detail}`); };

  // We need a raw token to drive the RPCs. assessment_tokens stores only
  // hashes — a raw token is not recoverable (that's the point). HR issuance
  // RPC returns the raw token once; simulate that path by minting via the
  // definer HR RPC with an HR actor context.
  const hr = (await db.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`)).rows[0];
  await db.query(`BEGIN`);
  await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: hr.id, role: 'authenticated' })]);

  // Find an active candidate+application to attach the token to
  const subj = (await db.query(`
    SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
    FROM public.candidates c
    JOIN public.job_applications ja ON ja.candidate_id = c.id
    JOIN public.assessments a ON a.job_form_id = ja.form_id
    WHERE a.status = 'Active' AND c.id IS NOT NULL
    LIMIT 1`)).rows[0];

  if (!subj) { console.log('NO ACTIVE assessment/application subject — token-dependent probes NOT PROVEN'); }

  let rawToken = null, tokenId = null, sessionId = null;
  if (subj) {
    const issued = await db.query(`SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r`,
      [subj.application_id, subj.assessment_id]);
    rawToken = issued.rows[0]?.r?.raw_token ?? null;
    if (!rawToken && issued.rows[0]?.r?.already_assigned) {
      // Idempotent re-issue returned no raw token (by design). The raw token
      // is unrecoverable from the hash — use a FRESH candidate that has no
      // token for this assessment yet.
      const fresh = (await db.query(`
        SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
        FROM public.candidates c
        JOIN public.job_applications ja ON ja.candidate_id = c.id
        JOIN public.assessments a ON a.job_form_id = ja.form_id
        WHERE a.status='Active'
          AND NOT EXISTS (SELECT 1 FROM public.assessment_tokens t WHERE t.candidate_id = c.id AND t.assessment_id = a.id)
        LIMIT 1`)).rows[0];
      if (fresh) {
        const iss2 = await db.query(`SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r`, [fresh.application_id, fresh.assessment_id]);
        rawToken = iss2.rows[0]?.r?.raw_token ?? null;
      }
    }
    tokenId = issued.rows[0]?.r?.token_id ?? null;
    console.log('token issued:', !!rawToken);
  }

  // A. Invalid token rejected everywhere
  let r = await db.query(`SELECT public.start_proctoring_session('totally-invalid-token-aaaaaaaaaa') AS r`);
  log(r.rows[0].r.success === false, 'A: invalid token start session', JSON.stringify(r.rows[0].r).slice(0, 90));

  // B. Challenge submit with wrong nonce
  let sess = null, challenge = null;
  if (rawToken) {
    r = await db.query(`SELECT public.start_proctoring_session($1) AS r`, [rawToken]);
    const ok = r.rows[0].r.success === true;
    sessionId = r.rows[0].r.session_id;
    log(ok, 'B: valid token starts session', JSON.stringify(r.rows[0].r).slice(0, 90));

    // C. single-active invariant: second start within window must fail
    r = await db.query(`SELECT public.start_proctoring_session($1) AS r`, [rawToken]);
    log(r.rows[0].r.success === false, 'C: second active session denied', JSON.stringify(r.rows[0].r).slice(0, 80));

    // D. issue challenge
    r = await db.query(`SELECT public.issue_liveness_challenge($1,$2) AS r`, [rawToken, sessionId]);
    challenge = r.rows[0].r;
    log(challenge.success === true, 'D: challenge issued', challenge.action);

    // E. wrong nonce → FAILED, cannot retry
    r = await db.query(`SELECT public.submit_liveness_challenge($1,$2,$3,'wrong-nonce-xxxx') AS r`, [rawToken, sessionId, challenge.challenge_id]);
    log(r.rows[0].r.success === false, 'E: wrong nonce rejected', JSON.stringify(r.rows[0].r).slice(0, 80));

    // F. replay with CORRECT nonce → still rejected (already consumed)
    r = await db.query(`SELECT public.submit_liveness_challenge($1,$2,$3,$4) AS r`, [rawToken, sessionId, challenge.challenge_id, challenge.nonce]);
    log(r.rows[0].r.success === false, 'F: challenge replay rejected', JSON.stringify(r.rows[0].r).slice(0, 80));

    // G. event sequence: duplicate rejected
    const seqBase = Math.floor(Date.now() / 1000) % 100000; // avoid collision with prior runs
    r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'TAB_HIDDEN','LOW') AS r`, [rawToken, sessionId, seqBase]);
    log(r.rows[0].r.success === true, 'G: event accepted', `seq=${seqBase}`);
    r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'TAB_HIDDEN','LOW') AS r`, [rawToken, sessionId, seqBase]);
    log(r.rows[0].r.success === false, 'H: duplicate sequence rejected', JSON.stringify(r.rows[0].r).slice(0, 70));

    // I. forged event type rejected (rejected BEFORE sequence uniqueness matters)
    r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'HACKED_EVENT','LOW') AS r`, [rawToken, sessionId, seqBase + 2]);
    log(r.rows[0].r.success === false, 'I: unknown event type rejected', JSON.stringify(r.rows[0].r).slice(0, 70));

    // J. client cannot claim CRITICAL severity (clamped)
    r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'WINDOW_BLUR','CRITICAL') AS r`, [rawToken, sessionId, seqBase + 1]);
    const sev = (await db.query(`SELECT severity FROM public.proctoring_events WHERE session_id=$1 AND sequence_number=$2`, [sessionId, seqBase + 1])).rows[0]?.severity;
    log(sev === 'INFO', 'J: client severity clamped (CRITICAL→INFO)', `stored=${sev}`);

    // K. cross-token session access (IDOR): second token cannot bind session
    const subj2 = (await db.query(`
      SELECT c.id AS candidate_id, ja.id AS application_id, a.id AS assessment_id
      FROM public.candidates c JOIN public.job_applications ja ON ja.candidate_id = c.id
      JOIN public.assessments a ON a.job_form_id = ja.form_id
      WHERE a.status='Active' AND c.id <> $1 LIMIT 1`, [subj.candidate_id])).rows[0];
    if (subj2) {
      const t2 = await db.query(`SELECT public.issue_hr_assessment_token($1::uuid,$2::uuid) AS r`, [subj2.application_id, subj2.assessment_id]);
      const raw2 = t2.rows[0]?.r?.raw_token;
      r = await db.query(`SELECT public.proctor_heartbeat($1,$2) AS r`, [raw2, sessionId]);
      log(r.rows[0].r.success === false, 'K: cross-token session access denied (IDOR)', JSON.stringify(r.rows[0].r).slice(0, 80));
    }

    // L. finalize → report; then further events rejected (terminal)
    r = await db.query(`SELECT public.finalize_proctoring_session($1,$2) AS r`, [rawToken, sessionId]);
    const rep = r.rows[0].r;
    log(rep.success === true && !!rep.final_state, 'L: server report generated', `state=${rep.final_state}`);
    r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'TAB_HIDDEN','LOW') AS r`, [rawToken, sessionId, seqBase + 9]);
    log(r.rows[0].r.success === false, 'M: events after termination rejected', JSON.stringify(r.rows[0].r).slice(0, 70));

    // N. biometric token-bound enrollment happy path + first-wins
    const good = JSON.stringify(Array(128).fill(0.42));
    r = await db.query(`SELECT public.enroll_candidate_biometric_token($1,$2::jsonb,0.9) AS r`, [rawToken, good]);
    log(r.rows[0].r.success === true, 'N: token-bound enrollment works', `already=${r.rows[0].r.already_enrolled}`);
    r = await db.query(`SELECT public.enroll_candidate_biometric_token($1,$2::jsonb,0.9) AS r`, [rawToken, JSON.stringify(Array(128).fill(0.99))]);
    log(r.rows[0].r.already_enrolled === true, 'O: first-wins (no descriptor swap)', '');
  }

  // P. legacy poisoning RPC unavailable to browsers (privilege check)
  const priv = await db.query(`SELECT has_function_privilege('anon','public.enroll_candidate_biometric(uuid,jsonb,numeric)','EXECUTE') AS anon_old`);
  log(priv.rows[0].anon_old === false, 'P: legacy client-id enrollment revoked from anon', `anon_exec=${priv.rows[0].anon_old}`);

  const fails = results.filter(x => !x).length;
  console.log(`\nRESULT: ${results.length - fails}/${results.length} pass`);
  await db.end();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
