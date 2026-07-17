import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: si } = await a.auth.signInWithPassword({
    email: "prakashmulge912@gmail.com",
    password: "changeme",
  });
  if (!si?.session) return;
  const admin = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${si.session.access_token}` },
    },
  });

  // Try all three required cols
  const { data: ins, error: e } = await admin
    .from("offer_letters")
    .insert({
      candidate_name: "Schema Probe",
      candidate_email: "probe@test.com",
      job_title: "Engineer",
      status: "Pending Approval",
    })
    .select("*")
    .single();
  if (e) {
    console.log("FAIL:", e.message);
    console.log("Code:", e.code);
  } else if (ins) {
    console.log("Columns:", Object.keys(ins).join(", "));
    console.log("Row:", JSON.stringify(ins, null, 2));
    await admin.from("offer_letters").delete().eq("id", ins.id);
  }

  // Check existing rows
  const { data: existing } = await admin
    .from("offer_letters")
    .select("*")
    .limit(3);
  if (existing && existing.length > 0) {
    console.log("\nExisting row columns:", Object.keys(existing[0]).join(", "));
    console.log("Existing row:", JSON.stringify(existing[0], null, 2));
  } else {
    console.log("\nNo existing rows found");
    // Try insert without specifying any of the known required cols
    const { data: x } = await admin
      .from("offer_letters")
      .insert({ candidate_name: "Test", candidate_email: "t@t.com", job_title: "T", status: "Pending Approval" })
      .select("id,candidate_name,candidate_email,job_title,status,created_at")
      .single();
    if (x) {
      console.log("Minimal insert succeeded:", JSON.stringify(x));
      await admin.from("offer_letters").delete().eq("id", x.id);
    }
  }
}

main().catch(console.error);
