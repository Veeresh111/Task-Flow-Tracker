import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: admin } = await a.auth.signInWithPassword({
    email: "admin@example.com", password: "changeme",
  });
  if (!admin?.session) return;
  const adminClient = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${admin.session.access_token}` } },
  });

  const { data: apps } = await adminClient.from("job_applications").select("id, status").limit(3);
  if (!apps || apps.length === 0) return;
  const targetId = apps[0].id;
  const origStatus = apps[0].status;
  console.log(`Target: ${targetId}, status: ${origStatus}`);

  const ts = Date.now();
  const email = `probe2-${ts}@test.com`;
  const { data: su } = await a.auth.signUp({
    email, password: "changeme",
    options: { data: { name: "Probe2", registered_role: "candidate" } },
  });
  if (!su?.user || !su?.session) return;
  console.log(`Candidate: ${su.user.id}`);

  const canClient = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${su.session.access_token}` } },
  });

  // Verify status BEFORE
  const { data: before } = await adminClient.from("job_applications").select("status").eq("id", targetId).single();
  console.log(`Before update: ${before?.status}`);

  // Try UPDATE WITHOUT .select() — no RETURNING clause
  const { error: updErr } = await canClient
    .from("job_applications")
    .update({ status: "Hacked" })
    .eq("id", targetId);
  console.log(`UPDATE error: ${updErr ? updErr.code + ": " + updErr.message : "NONE"}`);
  console.log(`BLOCKED? ${!!updErr ? "YES" : "NO — UPDATE EXECUTED"}`);

  // Check status AFTER using admin client
  const { data: after } = await adminClient.from("job_applications").select("status").eq("id", targetId).single();
  console.log(`After update: ${after?.status}`);
  console.log(`Status changed? ${after?.status !== before?.status ? "YES — row was modified!" : "NO — unchanged"}`);

  // Restore
  if (after?.status !== origStatus) {
    await adminClient.from("job_applications").update({ status: origStatus }).eq("id", targetId);
    console.log(`Restored to: ${origStatus}`);
  }
}
main().catch(console.error);
