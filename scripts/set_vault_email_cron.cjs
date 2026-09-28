/* Store email_cron_secret + supabase_fn_url into Supabase Vault (used by
 * public.invoke_email_worker). The secret value is generated here, written to
 * the vault, and echoed to stdout ONCE so it can be set as the matching
 * EMAIL_CRON_SECRET edge secret — never committed anywhere. */
const { Client } = require('pg');
const crypto = require('crypto');

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

  const secret = crypto.randomBytes(32).toString('hex');
  const fnUrl = process.env.SUPABASE_URL || `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co`;

  // Upsert both vault entries (create_vault_secret API via SQL is done with
  // vault extension functions through the pg crypto schema).
  await client.query(`SELECT vault.create_secret($1, 'email_cron_secret')`, [secret]);
  await client.query(`SELECT vault.create_secret($1, 'supabase_fn_url')`, [fnUrl]);

  console.log('VAULT_SECRET_WRITTEN (email_cron_secret value follows — set as EMAIL_CRON_SECRET edge secret):');
  console.log(secret);

  await client.end();
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
