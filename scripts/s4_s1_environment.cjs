/* S4-S1: Environment inventory (read-only). */
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

  const q = async (label, sql) => {
    try { const r = await client.query(sql); console.log(label, JSON.stringify(r.rows)); }
    catch (e) { console.log(label, 'ERR', e.message); }
  };

  const mig = await client.query(`SELECT count(*)::int AS applied, max(version) AS latest FROM supabase_migrations.schema_migrations`);
  console.log('MIGRATIONS:', JSON.stringify(mig.rows[0]));

  const recent = await client.query(`SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260921' ORDER BY version`);
  console.log('SESSION MIGRATIONS:', JSON.stringify(recent.rows.map(r => r.version)));

  await q('CRON JOBS:', `SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid`);

  const lastRuns = await client.query(`
    SELECT jobid, status, max(end_time) AS last_end, count(*)::int AS runs_7d
    FROM cron.job_run_details WHERE start_time > now() - interval '7 days'
    GROUP BY jobid, status ORDER BY jobid, status`);
  console.log('CRON RUNS 7d:', JSON.stringify(lastRuns.rows));

  const fns = fs.readdirSync('supabase/functions', { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);
  console.log('EDGE FUNCTIONS IN REPO:', fns.join(', '));

  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('FRONTEND SCRIPTS:', Object.keys(pkg.scripts).join(', '));
  console.log('VERCEL CONFIG:', fs.existsSync('vercel.json') ? 'yes' : 'no',
              '| netlify:', fs.existsSync('netlify.toml') ? 'yes' : 'no');

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
