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

  // Try querying information_schema via REST API
  const { data: policies, error: pe } = await admin.rpc("get_policies_for_tables", {
    tbls: ["job_applications", "assessment_tokens", "offer_letters"],
  });
  if (!pe && policies) {
    console.log("Policies:", JSON.stringify(policies, null, 2));
  } else {
    // Try direct select on pg_policies
    const url = `${URL}/rest/v1/pg_policies?schemaname=eq.public&tablename=in.(job_applications,assessment_tokens,offer_letters)&select=policyname,tablename,cmd,qual`;
    const res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${si.session.access_token}`,
        Accept: "application/json",
      },
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      console.log("pg_policies via REST:", JSON.stringify(data, null, 2));
    } else {
      console.log("REST result:", JSON.stringify(data, null, 2));
      // Try the raw SQL endpoint
      const url2 = `${URL}/rest/v1/rpc/`;
      console.log("No access to pg_policies via anon key");
      console.log("\nInstead, testing by attempting DROP of known policy names...");
    }
  }
}

main().catch(console.error);
