import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: si } = await a.auth.signInWithPassword({
    email: "prakashmulge912@gmail.com", password: "changeme",
  });
  if (!si?.session) return;
  const admin = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${si.session.access_token}` } },
  });

  // 1. Check if user_has_role function exists
  const { data: funcTest, error: funcErr } = await admin.rpc("user_has_role", { role_array: ["admin"] });
  console.log("user_has_role exists:", funcErr ? "NO (" + funcErr.message + ")" : "YES, returned=" + funcTest);

  // 2. Count offer_letters rows
  const { count, error: countErr } = await admin
    .from("offer_letters")
    .select("*", { count: "exact", head: true });
  console.log("offer_letters row count:", countErr ? "ERR: " + countErr.message : count);

  // 3. Get live DB offer_letters status values
  const { data: statuses } = await admin
    .from("offer_letters")
    .select("status")
    .limit(20);
  if (statuses && statuses.length > 0) {
    const unique = [...new Set(statuses.map(s => s.status))];
    console.log("Existing statuses:", unique.join(", "));
  } else {
    console.log("No offer_letter rows exist (expected)");
  }

  // 4. Check if job_applications has form_id FK constraint
  const { data: ja } = await admin
    .from("job_applications")
    .select("id, form_id, candidate_id, status")
    .limit(1);
  if (ja && ja.length > 0) {
    console.log("job_applications sample: form_id=" + ja[0].form_id + " candidate_id=" + ja[0].candidate_id);
  }

  // 5. Verify the candidate_id column exists in various tables
  const checkCol = async (table) => {
    const { data, error } = await admin.from(table).select("candidate_id").limit(1);
    return error ? "NO" : "YES";
  };
  console.log("job_applications has candidate_id:", await checkCol("job_applications"));
  console.log("assessment_tokens has candidate_id:", await checkCol("assessment_tokens"));

  // 6. Does the migration-style status check constraint exist on offer_letters?
  // Try inserting an invalid status
  const { error: badStatus } = await admin.from("offer_letters").insert({
    candidate_name: "BadStatus", candidate_email: "bs@t.com", job_title: "T", status: "InvalidStatus"
  });
  console.log("offer_letters status constraint:", badStatus && badStatus.message?.includes("violates") ? "YES (has CHECK)" : "NO or trigger (err=" + (badStatus?.message || "none") + ")");
}

main().catch(console.error);
