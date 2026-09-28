/* Read-only diagnosis: contradiction between audit rows (7) and stuck count (7). */
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

  await q(client, 'A. Approved-past resignations with profile state:',
    `SELECT r.id AS res_id, r.user_id, r.expected_last_day,
            p.role, p.status, p.employment_status,
            (p.role IS DISTINCT FROM 'archived' OR p.status IS DISTINCT FROM 'inactive'
             OR p.employment_status IS DISTINCT FROM 'terminated') AS is_stuck
     FROM public.resignations r JOIN public.profiles p ON p.id = r.user_id
     WHERE r.status='Approved' AND r.expected_last_day < CURRENT_DATE
     ORDER BY r.id`);

  await q(client, 'B. distinct stuck users vs join rows:',
    `SELECT count(*)::int AS join_rows, count(DISTINCT r.user_id)::int AS distinct_users
     FROM public.resignations r JOIN public.profiles p ON p.id=r.user_id
     WHERE r.status='Approved' AND r.expected_last_day < CURRENT_DATE
       AND (p.role IS DISTINCT FROM 'archived' OR p.status IS DISTINCT FROM 'inactive'
            OR p.employment_status IS DISTINCT FROM 'terminated')`);

  await q(client, 'C. audit rows detail:',
    `SELECT entity_id, details->>'resignation_id' AS res_id, created_at
     FROM public.audit_logs WHERE action='employee.auto_offboarded' ORDER BY created_at`);

  await client.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
