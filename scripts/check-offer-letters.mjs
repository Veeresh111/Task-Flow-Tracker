import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: si } = await a.auth.signInWithPassword({
    email: "admin@example.com",
    password: "changeme",
  });
  if (!si?.session) {
    console.log("Sign in failed");
    return;
  }
  const admin = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${si.session.access_token}` },
    },
  });

  // Check offer_letters schema
  const { data: row } = await admin.from("offer_letters").select("*").limit(1);
  if (row && row.length > 0) {
    console.log("offer_letters columns:", Object.keys(row[0]).join(", "));
  } else {
    console.log("No rows found, checking columns via insert attempt...");
  }

  // Try insert with just candidate_name + status
  const { data: ins1, error: e1 } = await admin
    .from("offer_letters")
    .insert({ candidate_name: "SchemaTest", status: "Pending Approval" })
    .select("*")
    .single();
  console.log(
    "Insert name+status:",
    e1 ? "FAIL: " + e1.message : "OK, id=" + ins1?.id,
  );
  if (ins1?.id) {
    console.log("  row columns:", Object.keys(ins1).join(", "));
    // cleanup
    await admin.from("offer_letters").delete().eq("id", ins1.id);
  }
}

main().catch(console.error);
