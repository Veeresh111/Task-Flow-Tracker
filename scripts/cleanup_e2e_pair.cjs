/* Cleanup for tagged proctoring E2E fixtures created by s6_seed_e2e_pair.cjs.
 * Pattern: E2E_TEST_2026* (candidates, applications, assessments, job forms)
 * plus every dependent artifact (tokens, biometrics, proctoring sessions,
 * events, challenges, logs). Never touches untagged real data.
 * Usage: node scripts/cleanup_e2e_pair.cjs */
const { Client } = require('pg');
require('./env-loader.cjs');

const CAND_LIKE = 'e2e_test_2026%@e2e-test.invalid';
const TAG_LIKE = 'E2E_TEST_2026%';

(async () => {
  const c = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const cands = (await c.query(
    `SELECT id, full_name FROM public.candidates WHERE email LIKE $1 OR full_name LIKE $2`,
    [CAND_LIKE, TAG_LIKE]
  )).rows;
  console.log('FIXTURE CANDIDATES:', cands.length);

  if (cands.length > 0) {
    // Dynamically discover EVERY table that FK-references candidates (never
    // assume a fixed list — the schema grew across 94 migrations).
    const refs = (await c.query(
      `SELECT DISTINCT conrelid::regclass::text AS child, a.attname AS col
       FROM pg_constraint cn
       JOIN pg_attribute a ON a.attrelid = cn.conrelid AND a.attnum = ANY(cn.conkey)
       WHERE cn.confrelid = 'public.candidates'::regclass AND cn.contype = 'f'`
    )).rows;
    console.log('FK CHILD TABLES:', refs.map(r => `${r.child}.${r.col}`).join(', '));

    const ids = cands.map(x => x.id);
    // Multi-pass: grandchildren first; repeat until nothing else deletes.
    for (let pass = 0; pass < 6; pass++) {
      let removed = 0;
      for (const r of refs) {
        const d = await c.query(
          `DELETE FROM ${r.child} WHERE ${r.col} = ANY($1::uuid[])`,
          [ids]
        );
        removed += d.rowCount;
      }
      console.log('PASS ' + (pass + 1) + ' removed FK children:', removed);
      if (removed === 0) break;
    }

    for (const cand of cands) {
      await c.query(`DELETE FROM candidates WHERE id = $1`, [cand.id]);
      console.log('CLEANED candidate', cand.full_name);
    }
  }

  // Assessment/form fixtures (only those no longer referenced by anything).
  await c.query(
    `DELETE FROM assessments WHERE title LIKE $1
       AND id NOT IN (SELECT assessment_id FROM assessment_tokens WHERE assessment_id IS NOT NULL)`,
    [`Assessment ${TAG_LIKE}%`]
  );
  await c.query(
    `DELETE FROM job_forms WHERE job_title LIKE $1
       AND id NOT IN (SELECT job_form_id FROM assessments WHERE job_form_id IS NOT NULL)
       AND id NOT IN (SELECT form_id FROM job_applications WHERE form_id IS NOT NULL)`,
    [`Form ${TAG_LIKE}%`]
  );

  // Verification sweep — every count must be 0. Each query binds exactly
  // the params it uses (pg reuses prepared statements by query text; mixed
  // arities on identical text break binding).
  const checks = {
    candidates: [`SELECT count(*)::int AS n FROM candidates WHERE email LIKE $1 OR full_name LIKE $2`, [CAND_LIKE, TAG_LIKE]],
    applications: [`SELECT count(*)::int AS n FROM job_applications WHERE candidate_name LIKE $1`, [TAG_LIKE]],
    tokens: [`SELECT count(*)::int AS n FROM assessment_tokens WHERE candidate_id IN (SELECT id FROM candidates WHERE full_name LIKE $1)`, [TAG_LIKE]],
    biometrics: [`SELECT count(*)::int AS n FROM candidate_biometrics WHERE candidate_id IN (SELECT id FROM candidates WHERE full_name LIKE $1)`, [TAG_LIKE]],
    sessions: [`SELECT count(*)::int AS n FROM proctoring_sessions WHERE candidate_id IN (SELECT id FROM candidates WHERE full_name LIKE $1)`, [TAG_LIKE]],
    assessments: [`SELECT count(*)::int AS n FROM assessments WHERE title LIKE $1`, [`Assessment ${TAG_LIKE}%`]],
    forms: [`SELECT count(*)::int AS n FROM job_forms WHERE job_title LIKE $1`, [`Form ${TAG_LIKE}%`]],
  };
  const verify = {};
  for (const [k, [sql, params]] of Object.entries(checks)) {
    const r = await c.query(sql, params);
    verify[k] = r.rows[0].n;
  }
  console.log('RESIDUE CHECK:', JSON.stringify(verify));
  const clean = Object.values(verify).every((n) => n === 0);
  console.log(clean ? 'CLEANUP VERIFIED: zero residue' : 'WARNING: residue remains (see counts)');
  await c.end();
  process.exit(clean ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(4); });
