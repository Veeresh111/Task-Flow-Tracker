/* Live DB check: email pipeline wiring (read-only) — vault secrets present,
 * cron job command, queue state distribution. */
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

  const vault = await client.query(
    `SELECT name, length(decrypted_secret) AS len FROM vault.decrypted_secrets WHERE name IN ('email_cron_secret','supabase_fn_url')`);
  console.log('=== VAULT ===');
  vault.rows.forEach(r => console.log(` ${r.name}: present, ${r.len} chars`));

  const cron = await client.query(`SELECT jobname, schedule, command FROM cron.job`);
  console.log('\n=== CRON ===');
  cron.rows.forEach(r => console.log(` ${r.jobname} [${r.schedule}]: ${r.command.slice(0, 80)}`));

  const q = await client.query(`SELECT status, count(*)::int AS n FROM pending_emails GROUP BY status ORDER BY n DESC`);
  console.log('\n=== EMAIL QUEUE STATES ===');
  q.rows.forEach(r => console.log(` ${r.status}: ${r.n}`));

  await client.end();
}

main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
