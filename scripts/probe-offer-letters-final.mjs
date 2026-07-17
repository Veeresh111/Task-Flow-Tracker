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

  // Get offer_letters columns by trying different inserts
  // First try: minimal insert with only what we know exists
  const tryInsert = async (payload: Record<string, any>) => {
    const { data, error } = await admin.from("offer_letters").insert(payload).select("*").single();
    if (data) {
      await admin.from("offer_letters").delete().eq("id", data.id);
      return { columns: Object.keys(data), row: data, error: null };
    }
    return { columns: null, row: null, error: error?.message || "unknown" };
  };

  // Probe 1: candidate_name + candidate_email + job_title
  const r1 = await tryInsert({
    candidate_name: "Probe1", candidate_email: "p1@test.com", job_title: "Engineer", status: "Pending Approval",
  });
  console.log("Probe 1 (name+email+title):", r1.error || `columns=${r1.columns?.join(", ")}`);

  // If probe 1 succeeded, we know the base columns. Let's try adding offered_ctc
  if (!r1.error) {
    const r2 = await tryInsert({
      candidate_name: "Probe2", candidate_email: "p2@test.com", job_title: "Engineer",
      offered_ctc: 100000, status: "Pending Approval",
    });
    console.log("Probe 2 (+offered_ctc):", r2.error ? `FAIL: ${r2.error}` : `columns=${r2.columns?.join(", ")}`);

    const r3 = await tryInsert({
      candidate_name: "Probe3", candidate_email: "p3@test.com", job_title: "Engineer",
      application_id: crypto.randomUUID(), status: "Pending Approval",
    });
    console.log("Probe 3 (+application_id):", r3.error ? `FAIL: ${r3.error}` : `columns=${r3.columns?.join(", ")}`);

    const r4 = await tryInsert({
      candidate_name: "Probe4", candidate_email: "p4@test.com", job_title: "Engineer",
      candidate_id: crypto.randomUUID(), status: "Pending Approval",
    });
    console.log("Probe 4 (+candidate_id):", r4.error ? `FAIL: ${r4.error}` : `columns=${r4.columns?.join(", ")}`);
  }
}

main().catch(console.error);
