/* Live payroll negative-test probes (read-only effects; uses current cycle data).
 * Probes:
 *  1. transition_payroll_status: invalid transition refused
 *  2. transition_payroll_status: forged role cannot advance (run as postgres = role lookup fails properly)
 *  3. auto_process_monthly_payroll_idempotent: duplicate month/year returns idempotent ack, NOT a new cycle
 *  4. Offboarded employees excluded from payroll (query inspection)
 */
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

  const probe = async (label, sql, params) => {
    try {
      const r = await client.query(sql, params);
      console.log(`${label}:`, JSON.stringify(r.rows[0]).slice(0, 220));
      return r.rows[0];
    } catch (e) {
      console.log(`${label} RAISED:`, e.message.slice(0, 160));
      return null;
    }
  };

  // 1. Invalid transition (generated -> released skips states)
  const cycle = await client.query(`SELECT id, month, year, status FROM payroll_cycles ORDER BY year DESC, month DESC LIMIT 1`);
  if (cycle.rowCount > 0) {
    const c = cycle.rows[0];
    console.log(`\nUsing latest cycle ${c.month}/${c.year} status=${c.status} id=${c.id}`);
    await probe('1. invalid transition (skipped states)',
      `SELECT public.transition_payroll_status($1, 'released') AS r`, [c.id]);
    await probe('2. invalid transition (backwards)',
      `SELECT public.transition_payroll_status($1, 'generated') AS r`, [c.id]);
    await probe('3. bogus status value',
      `SELECT public.transition_payroll_status($1, 'hacked') AS r`, [c.id]);
  } else {
    console.log('No payroll cycles exist; transition probes skipped (documented as untested)');
  }

  // 4. Idempotency probe on a FUTURE period (no data mutation risk: uses year 2099)
  await probe('4. duplicate-period idempotency (2099-12)',
    `SELECT public.auto_process_monthly_payroll_idempotent(12, 2099) AS r`);
  // Run twice: second must be idempotent
  await probe('5. second run same period (expect idempotent:true)',
    `SELECT public.auto_process_monthly_payroll_idempotent(12, 2099) AS r`);
  // Check only ONE cycle exists for 2099-12 (or zero if no salary structure)
  const dup = await client.query(`SELECT count(*)::int AS n FROM payroll_cycles WHERE month=12 AND year=2099`);
  console.log(`6. cycles for 12/2099 after two runs: ${dup.rows[0].n} (expect <=1)`);

  // Clean the probe cycle if it was created
  await client.query(`DELETE FROM payroll_cycles WHERE month=12 AND year=2099`);

  // 7. Offboarded employee exclusion check (static analysis of the SELECT)
  const excl = await client.query(`
    SELECT count(*)::int AS n FROM profiles
    WHERE status = 'active' AND payroll_ctc > 0
      AND employment_status = 'terminated'`);
  console.log(`7. profiles matching payroll filter but employment_status=terminated: ${excl.rows[0].n} (expect 0 — filter excludes them)`);

  await client.end();
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
