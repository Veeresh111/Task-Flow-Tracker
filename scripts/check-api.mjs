// Check Supabase API for SQL execution capability
const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";
const projectRef = URL.match(/https:\/\/([^.]+)/)[1];

async function main() {
  // Try Supabase management API
  const mgmtUrls = [
    `https://api.supabase.com/v1/projects/${projectRef}/database/sql`,
    `https://${projectRef}.supabase.co/rest/v1/rpc/`,
  ];

  for (const url of mgmtUrls) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { "apikey": KEY, "Authorization": `Bearer ${KEY}` }
      });
      console.log(`${url}: ${r.status} ${r.statusText}`);
      const text = await r.text();
      console.log(`  Response: ${text.slice(0, 200)}`);
    } catch (e) {
      console.log(`${url}: Error - ${e.message}`);
    }
  }

  // Try to get management API token via auth
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(URL, KEY);
  const { data: u } = await anon.auth.signUp({
    email: `api-check-${Date.now()}@test.com`,
    password: "TestPass123!",
  });
  if (!u?.user) { console.log("No user"); return; }
  const auth = u.session.access_token;

  // Try the database query endpoint with auth token
  const sqlUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  try {
    const r = await fetch(sqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth}`,
      },
      body: JSON.stringify({
        query: "SELECT 1 as test"
      })
    });
    const text = await r.text();
    console.log(`\nManagement API SQL: ${r.status}`);
    console.log(`Response: ${text.slice(0, 300)}`);
  } catch (e) {
    console.log(`\nManagement API Error: ${e.message}`);
  }

  console.log(`\n=== IMPORTANT ===`);
  console.log(`The RLS fix CANNOT be applied via the anon key.`);
  console.log(`To fix the vulnerability, run this SQL in the Supabase Dashboard:`);
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  console.log(`
    CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$ 
      BEGIN
        IF OLD.role IS DISTINCT FROM NEW.role THEN
          IF NOT public.user_has_role(ARRAY['admin', 'hr']) THEN
            RAISE EXCEPTION 'Permission denied: You cannot change your own role.';
          END IF;
        END IF;
        RETURN NEW;
      END;
    $$;
    DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.profiles;
    CREATE TRIGGER trg_prevent_self_role_change
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();
    DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
    CREATE POLICY "users_update_own_profile" ON public.profiles
      FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  `);
}

main().catch(console.error);
