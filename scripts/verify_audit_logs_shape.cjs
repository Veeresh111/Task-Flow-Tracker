/* Read-only: audit_logs shape + resignation column check before migration 10. */
const { Client } = require('pg');

async function q(client, label, sql) {
  try {
    const r = await client.query(sql);
    console.log(label, JSON.stringify(r.rows));
  } catch (e) {
    console.log(label, 'QUERY_ERROR:', e.message);
  }
}

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

  await q(client, 'A. audit_logs columns:',
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position`);

  await q(client, 'B. resignations columns:',
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='resignations' ORDER BY ordinal_position`);

  await q(client, 'C. candidates awaiting offboarding:',
    `SELECT count(*)::int AS pending FROM public.resignations r
     JOIN public.profiles p ON p.id = r.user_id
     WHERE r.status='Approved' AND r.expected_last_day < CURRENT_DATE
       AND (p.role IS DISTINCT FROM 'ARCHIVED' OR p.status IS DISTINCT FROM 'inactive'
            OR p.employment_status IS DISTINCT FROM 'terminated')`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
