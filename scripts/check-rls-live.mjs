import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const anon = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ts = Date.now();
  const email = `rls-audit-${ts}@test.com`;
  const { data: su, error: se } = await anon.auth.signUp({
    email,
    password: "changeme",
    options: { data: { name: "RLS Audit", registered_role: "candidate" } },
  });
  if (!su?.user || !su?.session) {
    console.log("SIGNUP FAILED:", se?.message);
    return;
  }
  console.log("Fresh user:", su.user.id);

  const client = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${su.session.access_token}` } },
  });

  // Try SELECT on assessment_tokens (should see 0 for fresh user if RLS works)
  const { data: tokens, error: te } = await client
    .from("assessment_tokens")
    .select("id, token", { count: "exact", head: false })
    .limit(5);
  console.log(
    `assessment_tokens SELECT: ${tokens?.length || 0} rows, err: ${te?.message || "none"}`,
  );
  console.log(
    `  RLS working? ${tokens && tokens.length === 0 ? "YES (0 rows)" : `NO (${tokens?.length} rows visible)`}`,
  );

  // Try SELECT on job_applications (should see 0 for fresh user if RLS works)
  const { data: apps, error: ae } = await client
    .from("job_applications")
    .select("id", { count: "exact", head: false })
    .limit(5);
  console.log(
    `job_applications SELECT: ${apps?.length || 0} rows, err: ${ae?.message || "none"}`,
  );
  console.log(
    `  RLS working? ${apps && apps.length === 0 ? "YES (0 rows)" : `NO (${apps?.length} rows visible)`}`,
  );

  // Try UPDATE on an existing application (should be BLOCKED)
  const { data: existingApps } = await anon
    .from("job_applications")
    .select("id, status")
    .limit(1);
  if (existingApps && existingApps.length > 0) {
    const targetId = existingApps[0].id;
    const { error: ue } = await client
      .from("job_applications")
      .update({ status: "Hacked" })
      .eq("id", targetId);
    console.log(
      `job_app UPDATE other's row: ${ue ? "BLOCKED (" + ue.message + ")" : "ALLOWED (vuln)"}`,
    );
  } else {
    console.log("No existing app found for UPDATE test");
  }

  // Try INSERT into job_applications (open to all per migration)
  const { data: ins, error: ie } = await client
    .from("job_applications")
    .insert({
      form_id: crypto.randomUUID(),
      candidate_id: su.user.id,
      candidate_name: "Test",
      candidate_email: email,
      status: "Applied",
      answers: {},
    })
    .select("id")
    .single();
  console.log(
    `job_app INSERT: ${ie ? "BLOCKED (" + ie.message + ")" : "ALLOWED (" + ins?.id + ")"}`,
  );

  await anon.auth.admin.deleteUser(su.user.id).catch(() => {});
  console.log("\nDone.");
}

main().catch(console.error);
