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
  if (!si?.session) return;
  const admin = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${si.session.access_token}` },
    },
  });

  const { data: ins, error: e } = await admin
    .from("offer_letters")
    .insert({
      candidate_name: "Schema Probe",
      candidate_email: "probe@test.com",
      status: "Pending Approval",
    })
    .select("*")
    .single();
  if (e) {
    console.log("FAIL:", e.message);
  } else if (ins) {
    console.log("Columns in offer_letters:", Object.keys(ins).join(", "));
    console.log("Full row:", JSON.stringify(ins, null, 2));
    await admin.from("offer_letters").delete().eq("id", ins.id);
  }
}

main().catch(console.error);
