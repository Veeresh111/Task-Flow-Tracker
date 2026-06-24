import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const a = createClient(URL, KEY);
  const email = `fix-test-${Date.now()}@test.com`;
  const { data: u } = await a.auth.signUp({
    email,
    password: "Test123!",
    options: { data: { registered_role: "candidate", name: "Fix Test" } },
  });
  if (!u?.user) { console.log("no user"); return; }
  await new Promise(r => setTimeout(r, 2000));

  const c = createClient(URL, KEY, {
    global: { headers: { Authorization: "Bearer " + u.session.access_token } },
  });

  const { data: b } = await c.from("profiles").select("role").eq("id", u.user.id).single();
  console.log("Current role:", b?.role);

  const { error: e1 } = await c.from("profiles").update({ role: "admin" }).eq("id", u.user.id);
  console.log("Direct update error:", e1?.message || "NONE (vulnerable)");
}

main().catch(console.error);
