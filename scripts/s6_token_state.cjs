/* S6: report authoritative server state for an E2E raw token — token status,
   candidate binding, biometric presence, proctoring session(s). Never prints
   the token hash. Usage: node scripts/s6_token_state.cjs <rawToken> */
const { Client } = require('pg');
require('./env-loader.cjs');
const crypto = require('crypto');

(async () => {
  const raw = process.argv[2];
  if (!raw) { console.error('usage: node scripts/s6_token_state.cjs <rawToken>'); process.exit(1); }
  const c = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const tok = (await c.query(
    `SELECT id, status, expires_at, candidate_id, assessment_id
     FROM public.assessment_tokens WHERE token_hash = $1`, [hash]
  )).rows[0];
  if (!tok) { console.log('TOKEN: not found (hash mismatch)'); await c.end(); return; }
  console.log('TOKEN:', JSON.stringify({ status: tok.status, expired: new Date(tok.expires_at) < new Date(), candidate_id: tok.candidate_id, assessment_id: tok.assessment_id }));

  const bio = (await c.query(
    `SELECT id, created_at, confidence FROM public.candidate_biometrics WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 3`, [tok.candidate_id]
  )).rows;
  console.log('BIOMETRICS:', bio.length ? JSON.stringify(bio.map(b => ({ created: b.created_at, conf: b.confidence }))) : 'NONE');

  const sess = (await c.query(
    `SELECT id, status, risk_state, liveness_status, started_at, ended_at FROM public.proctoring_sessions
     WHERE token_id = $1 ORDER BY started_at DESC LIMIT 5`, [tok.id]
  )).rows;
  console.log('PROCTORING SESSIONS:', sess.length ? JSON.stringify(sess) : 'NONE');

  const ev = (await c.query(
    `SELECT pe.event_type, COUNT(*)::int AS n FROM public.proctoring_events pe
     JOIN public.proctoring_sessions ps ON ps.id = pe.session_id
     WHERE ps.token_id = $1 GROUP BY pe.event_type ORDER BY n DESC`, [tok.id]
  )).rows;
  console.log('EVENTS:', ev.length ? JSON.stringify(ev) : 'NONE');

  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(4); });
