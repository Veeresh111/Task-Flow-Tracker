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

  // Try with candidate_email (no offered_ctc)
  const { data: ins1, error: e1 } = await admin
    .from("offer_letters")
    .insert({ candidate_email: "test@test.com", status: "Pending Approval" })
    .select("*")
    .single();
  console.log(
    "Insert email+status (no offered_ctc):",
    e1 ? "FAIL: " + e1.message : "OK",
  );
  if (ins1) {
    console.log("  row columns:", Object.keys(ins1).join(", "));
    await admin.from("offer_letters").delete().eq("id", ins1.id);
  }

  // Try with candidate_email + offered_ctc
  const { data: ins2, error: e2 } = await admin
    .from("offer_letters")
    .insert({
      candidate_email: "test2@test.com",
      offered_ctc: 100000,
      status: "Pending Approval",
    })
    .select("*")
    .single();
  console.log(
    "Insert email+ctc+status:",
    e2 ? "FAIL: " + e2.message : "OK",
  );
  if (ins2) {
    console.log("  row columns:", Object.keys(ins2).join(", "));
    await admin.from("offer_letters").delete().eq("id", ins2.id);
  }

  // Try with candidate_email + offer_date
  const { data: ins3, error: e3 } = await admin
    .from("offer_letters")
    .insert({
      candidate_email: "test3@test.com",
      offer_date: new Date().toISOString().split("T")[0],
      status: "Pending Approval",
    })
    .select("*")
    .single();
  console.log(
    "Insert email+date+status:",
    e3 ? "FAIL: " + e3.message : "OK",
  );
  if (ins3) {
    console.log("  row columns:", Object.keys(ins3).join(", "));
    await admin.from("offer_letters").delete().eq("id", ins3.id);
  }
}

main().catch(console.error);
