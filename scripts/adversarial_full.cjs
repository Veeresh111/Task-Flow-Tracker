/* Full adversarial battery using the EXISTING minted E2E token artifact.
   Does NOT mint a new token (the E2E flow needs it unused). Read-only on the
   token; creates proctoring session/challenges for the probe token only. */
require('./env-loader.cjs');
const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const rawToken = fs.readFileSync('.e2e_raw_token', 'utf8').trim();
  const db = new Client({ host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await db.connect();
  const results = [];
  const log = (pass, name, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} → ${detail}`); };

  // 1. session start
  let r = await db.query(`SELECT public.start_proctoring_session($1) AS r`, [rawToken]);
  const s = r.rows[0].r;
  log(s.success === true, 'S1: session start', JSON.stringify(s).slice(0, 90));
  const sessionId = s.session_id;

  // 2. single-active invariant
  r = await db.query(`SELECT public.start_proctoring_session($1) AS r`, [rawToken]);
  log(r.rows[0].r.success === false, 'S2: second active session denied', JSON.stringify(r.rows[0].r).slice(0, 80));

  // 3. heartbeat
  r = await db.query(`SELECT public.proctor_heartbeat($1,$2) AS r`, [rawToken, sessionId]);
  log(r.rows[0].r.success === true, 'S3: heartbeat ok', JSON.stringify(r.rows[0].r).slice(0, 60));

  // 4. challenge issue + wrong nonce + replay
  r = await db.query(`SELECT public.issue_liveness_challenge($1,$2) AS r`, [rawToken, sessionId]);
  const ch = r.rows[0].r;
  log(ch.success === true, 'S4: challenge issued', ch.action);
  r = await db.query(`SELECT public.submit_liveness_challenge($1,$2,$3,'wrong-nonce') AS r`, [rawToken, sessionId, ch.challenge_id]);
  log(r.rows[0].r.success === false, 'S5: wrong nonce rejected', JSON.stringify(r.rows[0].r).slice(0, 70));
  r = await db.query(`SELECT public.submit_liveness_challenge($1,$2,$3,$4) AS r`, [rawToken, sessionId, ch.challenge_id, ch.nonce]);
  log(r.rows[0].r.success === false, 'S6: replay rejected', JSON.stringify(r.rows[0].r).slice(0, 70));

  // 5. events: accept/dup/unknown/severity clamp
  const seq = Math.floor(Date.now() / 1000) % 100000;
  r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'TAB_HIDDEN','LOW') AS r`, [rawToken, sessionId, seq]);
  log(r.rows[0].r.success === true, 'S7: event accepted', `seq=${seq}`);
  r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'TAB_HIDDEN','LOW') AS r`, [rawToken, sessionId, seq]);
  log(r.rows[0].r.success === false, 'S8: duplicate seq rejected', JSON.stringify(r.rows[0].r).slice(0, 60));
  r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'HACKED_EVENT','LOW') AS r`, [rawToken, sessionId, seq + 2]);
  log(r.rows[0].r.success === false, 'S9: unknown event type rejected', '');
  await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'WINDOW_BLUR','CRITICAL') AS r`, [rawToken, sessionId, seq + 1]);
  const sev = (await db.query(`SELECT severity FROM public.proctoring_events WHERE session_id=$1 AND sequence_number=$2`, [sessionId, seq + 1])).rows[0]?.severity;
  log(sev === 'INFO', 'S10: severity clamped', `stored=${sev}`);

  // 6. biometric first-wins on token (already enrolled? try)
  const good = JSON.stringify(Array.from({ length: 128 }, (_, i) => Math.cos(i)));
  r = await db.query(`SELECT public.enroll_candidate_biometric_token($1,$2::jsonb,0.9) AS r`, [rawToken, good]);
  const e1 = r.rows[0].r;
  log(e1.success === true, 'S11: token enrollment', `already=${e1.already_enrolled}`);
  r = await db.query(`SELECT public.enroll_candidate_biometric_token($1,'${JSON.stringify(Array(128).fill(0.5))}'::jsonb,0.9) AS r`, [rawToken]);
  log(r.rows[0].r.already_enrolled === true, 'S12: first-wins (no overwrite)', '');

  // 7. verify: same descriptor should pass
  r = await db.query(`SELECT public.verify_candidate_biometric_face_token($1,$2::jsonb,0.363) AS r`, [rawToken, good]);
  const v = r.rows[0].r;
  log(v.enrolled === true && v.verified === true, 'S13: SFace verify (same embedding passes)', `sim=${v.similarity}`);
  r = await db.query(`SELECT public.verify_candidate_biometric_face_token($1,'${JSON.stringify(Array(128).fill(-Math.cos(1)))}'::jsonb,0.363) AS r`, [rawToken]);
  log(r.rows[0].r.verified === false, 'S14: mismatching embedding rejected', `sim=${r.rows[0].r.similarity}`);

  // 8. finalize + terminal enforcement
  r = await db.query(`SELECT public.finalize_proctoring_session($1,$2) AS r`, [rawToken, sessionId]);
  log(r.rows[0].r.success === true, 'S15: finalize + report', `state=${r.rows[0].r.final_state}`);
  r = await db.query(`SELECT public.record_proctoring_event($1,$2,$3,'TAB_HIDDEN','LOW') AS r`, [rawToken, sessionId, seq + 9]);
  log(r.rows[0].r.success === false, 'S16: events after termination rejected', '');
  r = await db.query(`SELECT public.issue_liveness_challenge($1,$2) AS r`, [rawToken, sessionId]);
  log(r.rows[0].r.success === false, 'S17: challenge after termination rejected', '');

  const fails = results.filter(x => !x).length;
  console.log(`\nRESULT: ${results.length - fails}/${results.length} pass`);
  await db.end();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
