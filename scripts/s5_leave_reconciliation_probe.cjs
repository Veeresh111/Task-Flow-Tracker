/* S5: leave-ledger reconciliation behavioral probe (transaction-isolated).
   Proves: approval → consumption row in SAME tx, first-wins idempotency,
   over-allocation rejection, HR override allowance, reversal on un-approval.
   All inside BEGIN...ROLLBACK — zero residue. */
const { Client } = require('pg');

const results = [];
function log(ok, name, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' → ' + detail : ''}`);
}

async function main() {
  const db = new Client({
    host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432,
    user: 'postgres', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  // Pick an active employee with no pending/approved leaves.
  const emp = (await db.query(`
    SELECT p.id FROM public.profiles p
    WHERE p.status='active' AND p.role IN ('employee','team_lead')
      AND NOT EXISTS (SELECT 1 FROM public.leaves l WHERE l.user_id = p.id)
    LIMIT 1`)).rows[0];
  if (!emp) { console.log('NO ELIGIBLE EMPLOYEE — probe NOT PROVEN'); process.exit(2); }

  await db.query('BEGIN');
  try {
    // Give the employee a known balance: 10 days.
    await db.query(`INSERT INTO public.leave_ledgers
      (user_id, transaction_type, leave_type, amount, balance_after, fiscal_year, month, notes)
      VALUES ($1, 'manual_adjustment', 'casual_leave', 10, 10, 2026, 9, 'PROBE opening balance')`, [emp.id]);

    // Create a leave request (3 days) directly as seed data — the probe
    // targets the approval-side trigger, not the request path.
    const leave = (await db.query(`
      INSERT INTO public.leaves (user_id, leave_type, start_date, end_date, reason, status)
      VALUES ($1, 'Casual', DATE '2026-10-05', DATE '2026-10-07', 'probe leave', 'Pending')
      RETURNING id`, [emp.id])).rows[0];

    // 1. Approval → consumption row in the SAME transaction.
    await db.query(`UPDATE public.leaves SET status='Approved' WHERE id=$1`, [leave.id]);
    const c1 = (await db.query(`SELECT amount, balance_after FROM public.leave_ledgers
      WHERE notes = 'LEAVE_CONSUMPTION:' || $1::text`, [leave.id])).rows[0];
    log(!!c1 && Number(c1.amount) === -3 && Number(c1.balance_after) === 7,
      'approval → atomic consumption row', JSON.stringify(c1));

    // 2. Idempotency: another status touch (Pending→Approved again is a
    //    different transition, but re-approving same row must not double-count).
    await db.query(`UPDATE public.leaves SET status='Approved' WHERE id=$1`, [leave.id]);
    const c2 = (await db.query(`SELECT count(*)::int n FROM public.leave_ledgers
      WHERE notes = 'LEAVE_CONSUMPTION:' || $1::text`, [leave.id])).rows[0];
    log(c2.n === 1, 'idempotent: no double consumption', `rows=${c2.n}`);

    // 3. Over-allocation rejection: 20-day leave on 7-day balance, non-HR actor.
    const leave2 = (await db.query(`
      INSERT INTO public.leaves (user_id, leave_type, start_date, end_date, reason, status)
      VALUES ($1, 'Casual', DATE '2026-11-02', DATE '2026-11-21', 'probe overdraft', 'Pending')
      RETURNING id`, [emp.id])).rows[0];
    // Non-HR context: clear the JWT claims (postgres actor).
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`);
    let rejected = false, msg = '';
    await db.query('SAVEPOINT overdraft_attempt');
    try {
      await db.query(`UPDATE public.leaves SET status='Approved' WHERE id=$1`, [leave2.id]);
    } catch (e) {
      rejected = true; msg = e.message.slice(0, 80);
      await db.query('ROLLBACK TO SAVEPOINT overdraft_attempt');
    }
    log(rejected, 'over-allocation rejected for non-HR actor', msg);

    // 4. HR override allowance.
    const hr = (await db.query(`SELECT id FROM public.profiles WHERE role='hr' LIMIT 1`)).rows[0];
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`,
      [JSON.stringify({ sub: hr.id, role: 'authenticated' })]);
    await db.query(`UPDATE public.leaves SET status='Approved' WHERE id=$1`, [leave2.id]);
    const c4 = (await db.query(`SELECT balance_after FROM public.leave_ledgers
      WHERE notes = 'LEAVE_CONSUMPTION:' || $1::text`, [leave2.id])).rows[0];
    log(!!c4, 'HR/admin explicit overdraft allowed', `balance_after=${c4?.balance_after}`);

    // 5. Reversal on un-approval.
    await db.query(`UPDATE public.leaves SET status='Rejected' WHERE id=$1`, [leave.id]);
    const c5 = (await db.query(`SELECT amount, balance_after FROM public.leave_ledgers
      WHERE notes = 'LEAVE_REVERSAL:' || $1::text`, [leave.id])).rows[0];
    log(!!c5 && Number(c5.amount) === 3,
      'un-approval → reversal row (history preserved)', JSON.stringify(c5));

  } finally {
    await db.query('ROLLBACK');
    console.log('rolled back — zero residue');
  }

  // Verify zero residue.
  const residue = (await db.query(`SELECT count(*)::int n FROM public.leave_ledgers
    WHERE notes LIKE 'PROBE%' OR notes LIKE 'LEAVE_CONSUMPTION%' OR notes LIKE 'LEAVE_REVERSAL%'`)).rows[0].n;
  log(residue === 0, 'zero residue after rollback', `rows=${residue}`);

  const fails = results.filter(x => !x).length;
  console.log(`\nRESULT: ${results.length - fails}/${results.length} pass`);
  await db.end();
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(2); });
