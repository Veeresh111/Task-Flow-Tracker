import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  // Sign in as admin to get an application id
  const a = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: admin } = await a.auth.signInWithPassword({
    email: "admin@example.com", password: "changeme",
  });
  if (!admin?.session) { console.log("admin signin failed"); return; }
  const adminClient = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${admin.session.access_token}` } },
  });

  // Get an existing application to target
  const { data: apps } = await adminClient.from("job_applications").select("id, status").limit(3);
  if (!apps || apps.length === 0) { console.log("no apps found"); return; }
  const targetId = apps[0].id;
  const origStatus = apps[0].status;
  console.log(`Target app ${targetId}, current status: ${origStatus}`);

  // Sign up a fresh candidate who does NOT own this app
  const ts = Date.now();
  const email = `probe-${ts}@test.com`;
  const { data: su } = await a.auth.signUp({
    email, password: "changeme",
    options: { data: { name: "Probe", registered_role: "candidate" } },
  });
  if (!su?.user || !su?.session) { console.log("signup failed"); return; }
  console.log(`Fresh candidate: ${su.user.id}`);

  const canClient = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${su.session.access_token}` } },
  });

  // Test 1: Can the fresh candidate READ this app? (should be denied — no SELECT policy for candidates)
  const { data: readData, error: readErr } = await canClient
    .from("job_applications")
    .select("id, status")
    .eq("id", targetId)
    .maybeSingle();
  console.log(`\nREAD by candidate:`);
  console.log(`  data: ${JSON.stringify(readData)}`);
  console.log(`  error: ${readErr ? `${readErr.code}: ${readErr.message}` : "none"}`);
  console.log(`  BLOCKED? ${!readData && readErr ? "YES" : readData ? "NO (sees row)" : readErr ? "YES" : "NO (null)"}`);

  // Test 2: Can the fresh candidate UPDATE this app? (should be blocked by applications_update_hr)
  const { data: updData, error: updErr } = await canClient
    .from("job_applications")
    .update({ status: "Hacked" })
    .eq("id", targetId)
    .select("id, status")
    .maybeSingle();
  console.log(`\nUPDATE by candidate:`);
  console.log(`  data: ${JSON.stringify(updData)}`);
  console.log(`  error: ${updErr ? `${updErr.code}: ${updErr.message}` : "none"}`);
  console.log(`  BLOCKED? ${!!updErr ? "YES (" + updErr.message + ")" : "NO (ALLOWED)"}`);

  // Restore the original status if changed
  if (updData) {
    await adminClient.from("job_applications").update({ status: origStatus }).eq("id", targetId);
    console.log(`  (restored to ${origStatus})`);
  }

  console.log("\nDone.");
}
main().catch(console.error);
