import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: si } = await a.auth.signInWithPassword({
    email: "prakashmulge912@gmail.com", password: "veeresh123",
  });
  if (!si?.session) return;
  const admin = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${si.session.access_token}` } },
  });

  async function tryInsert(payload) {
    const { data, error } = await admin.from("offer_letters").insert(payload).select("*").single();
    if (data) {
      await admin.from("offer_letters").delete().eq("id", data.id);
      return { columns: Object.keys(data), row: data, error: null };
    }
    return { columns: null, row: null, error: error?.message || "unknown" };
  }

  const r1 = await tryInsert({
    candidate_name: "Probe1", candidate_email: "p1@test.com", job_title: "Engineer", status: "Pending Approval",
  });
  console.log("Probe 1 (name+email+title):", r1.error || "OK columns=" + r1.columns?.join(", "));

  if (!r1.error) {
    const r2 = await tryInsert({
      candidate_name: "Probe2", candidate_email: "p2@test.com", job_title: "Engineer",
      offered_ctc: 100000, status: "Pending Approval",
    });
    console.log("Probe 2 (+offered_ctc):", r2.error ? "FAIL: " + r2.error : "OK");

    const r3 = await tryInsert({
      candidate_name: "Probe3", candidate_email: "p3@test.com", job_title: "Engineer",
      application_id: crypto.randomUUID(), status: "Pending Approval",
    });
    console.log("Probe 3 (+application_id):", r3.error ? "FAIL: " + r3.error : "OK");

    const r4 = await tryInsert({
      candidate_name: "Probe4", candidate_email: "p4@test.com", job_title: "Engineer",
      candidate_id: crypto.randomUUID(), status: "Pending Approval",
    });
    console.log("Probe 4 (+candidate_id):", r4.error ? "FAIL: " + r4.error : "OK");

    const r5 = await tryInsert({
      candidate_name: "Probe5", candidate_email: "p5@test.com", job_title: "Engineer",
      offer_date: "2026-06-28", status: "Pending Approval",
    });
    console.log("Probe 5 (+offer_date):", r5.error ? "FAIL: " + r5.error : "OK");
  }
}
main().catch(console.error);
