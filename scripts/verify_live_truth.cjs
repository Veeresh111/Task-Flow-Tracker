/* Live DB verification — read-only. Credentials come from env, never hardcoded. */
/* NOTE: .gitignore covers scripts/*.cjs — this file is local-only by policy. */
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

  const queries = [
    ['A. STATUS CHECK VOCABULARY', `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.job_applications'::regclass AND conname = 'chk_job_applications_status'`],
    ['B. TRIGGERS ON job_applications', `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.job_applications'::regclass AND NOT tgisinternal`],
    ['C. KEY FUNCTIONS (security definer?)', `SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('check_job_application_transition','guard_job_application_status_authority','issue_public_assessment_token','autosave_assessment_answers','guard_fnf_finalized_immutability') ORDER BY 1`],
    ['D. AUTOSAVE TABLE COLUMNS', `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='assessment_attempt_answers' ORDER BY ordinal_position`],
    ['E. TOKEN TABLE COLUMNS (B2 baseline)', `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='assessment_tokens' ORDER BY ordinal_position`],
    ['F. EMAIL IDEMPOTENCY INDEX', `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='pending_emails' AND indexname LIKE '%idempotency%'`],
    ['G. MONEY CHECK CONSTRAINTS', `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid IN ('public.payslips'::regclass,'public.fnf_settlements'::regclass) AND conname IN ('chk_payslips_money_positive','chk_fnf_net_nonnegative')`],
    ['H. F&F IMMUTABILITY TRIGGER', `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.fnf_settlements'::regclass AND NOT tgisinternal`],
    ['I. ANON POLICIES (public flows)', `SELECT tablename, policyname, cmd, array_to_string(roles, ',') AS roles FROM pg_policies WHERE schemaname='public' AND tablename IN ('job_applications','candidates','assessment_tokens') ORDER BY 1,2`],
    ['K. OPEN-POLICY SURVIVORS (B4 exposure audit)', `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND (qual='true' OR qual ILIKE '%(true)%') ORDER BY 1 LIMIT 40`],
    ['L. RPC GRANTS ON PUBLIC ISSUANCE', `SELECT p.proname, array_to_string(p.proacl, ',') AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('issue_public_assessment_token','autosave_assessment_answers')`],
    ['M. TOKEN ROW COUNT + SAMPLE STATUS (no values)', `SELECT status, count(*) FROM assessment_tokens GROUP BY 1`],
    ['N. MIGRATIONS NOW APPLIED (remote)', `SELECT version, name, applied_at FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3`],
  ];

  for (const [label, sql] of queries) {
    console.log(`\n=== ${label} ===`);
    try {
      const res = await client.query(sql);
      if (res.rows.length === 0) console.log('(no rows)');
      else console.table(res.rows.map(r => {
        const o = {};
        for (const k of Object.keys(r)) {
          let v = r[k];
          if (v !== null && typeof v === 'object') v = JSON.stringify(v).slice(0, 160);
          if (typeof v === 'string' && v.length > 220) v = v.slice(0, 220) + '…';
          o[k] = v;
        }
        return o;
      }));
    } catch (e) {
      console.log('QUERY ERROR:', e.message);
    }
  }

  await client.end();
}

main().catch(e => { console.error('CONNECT FAILED:', e.message); process.exit(1); });
