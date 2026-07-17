import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: si } = await a.auth.signInWithPassword({
    email: "admin@example.com", password: "changeme",
  });
  if (!si?.session) { console.log("signin failed"); return; }
  const admin = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${si.session.access_token}` } },
  });

  // Check profiles columns
  const { data: p } = await admin.from("profiles").select("*").limit(1);
  if (p && p.length > 0) {
    console.log("profiles columns:", Object.keys(p[0]).join(", "));
  } else {
    console.log("no profiles found, trying via email filter");
    const { data: p2 } = await admin.from("profiles").select("*").eq("email", "admin@example.com").limit(1);
    if (p2 && p2.length > 0) {
      console.log("profiles columns:", Object.keys(p2[0]).join(", "));
    }
  }

  // Check candidates columns
  const { data: c } = await admin.from("candidates").select("*").limit(1);
  if (c && c.length > 0) {
    console.log("candidates columns:", Object.keys(c[0]).join(", "));
  } else {
    console.log("candidates table exists but no rows");
  }
}

main().catch(console.error);
