/* Live DB read-only: extract full payroll function definitions for line-by-line audit. */
const { Client } = require('pg');
const fs = require('fs');

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

  const fns = await client.query(
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname ILIKE '%payroll%' OR p.proname ILIKE '%payslip%')
     ORDER BY p.proname`);

  let out = '';
  for (const f of fns.rows) {
    const def = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS d
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=$1 AND pg_get_function_identity_arguments(p.oid)=$2`,
      [f.proname, f.args]);
    out += `\n-- ===== ${f.proname}(${f.args}) =====\n` + (def.rows[0]?.d || 'NOT FOUND') + '\n';
  }

  fs.writeFileSync('scripts/payroll_functions_dump.sql', out);
  console.log(`Extracted ${fns.rowCount} payroll functions to scripts/payroll_functions_dump.sql`);

  // Payroll table constraints
  for (const t of ['payroll_cycles', 'payslips', 'payroll_ledger']) {
    const cons = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'public.${t}'::regclass AND contype IN ('c','u','p','f')`);
    console.log(`\n=== ${t} CONSTRAINTS (${cons.rowCount}) ===`);
    cons.rows.forEach(r => console.log(` ${r.conname}: ${r.def.slice(0, 140)}`));
  }

  await client.end();
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
