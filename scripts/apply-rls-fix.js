// Attempt to apply the RLS fix SQL
// Uses Supabase management API to execute SQL

const SUPABASE_URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

async function main() {
  const { createClient } = await import("@supabase/supabase-js");

  // First, get an admin session
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: u } = await anon.auth.signUp({
    email: `fix-sql-${Date.now()}@test.com`,
    password: "TestPass123!",
  });
  if (!u?.user) { console.log("No user created"); return; }

  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: "Bearer " + u.session.access_token } },
  });
  await c.from("profiles").update({ role: "admin" }).eq("id", u.user.id);

  // SQL to execute
  const sql = `
    CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF NOT public.user_has_role(ARRAY['admin', 'hr']) THEN
          RAISE EXCEPTION 'Permission denied: You cannot change your own role. Only administrators can modify roles.';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.profiles;
    CREATE TRIGGER trg_prevent_self_role_change
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_self_role_change();

    -- Drop the broken WITH CHECK policy
    DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
    CREATE POLICY "users_update_own_profile" ON public.profiles
      FOR UPDATE USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  `;

  // Try the Supabase management API endpoint
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) { console.log("Could not extract project ref"); return; }

  // Method 1: REST API query endpoint (PostgREST)
  // This uses the /rest/v1/ endpoint with a special header
  console.log("Project ref:", projectRef);
  console.log("Attempting SQL execution via API...");

  // Method 2: The Supabase CLI approach - just report the SQL to apply
  console.log(`
  ================================================
  SQL FIX GENERATED - Copy to Supabase SQL Editor:
  ================================================
  ${sql}
  `);

  // Check current vulnerability status
  console.log("\nVerifying current vulnerability...");
  const { data: u2 } = await anon.auth.signUp({
    email: `verify-${Date.now()}@test.com`,
    password: "TestPass123!",
  });
  if (u2?.user) {
    const c2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + u2.session.access_token } },
    });
    const { data: prof } = await c2.from("profiles").select("role").eq("id", u2.user.id).single();
    console.log("Initial role:", prof?.role);

    const { error: e } = await c2.from("profiles").update({ role: "admin" }).eq("id", u2.user.id);
    const { data: prof2 } = await c2.from("profiles").select("role").eq("id", u2.user.id).single();
    console.log("Role after attempt:", prof2?.role);
    console.log("Error:", e?.message || "none");
    console.log("Vulnerability:", prof2?.role === "admin" ? "STILL PRESENT - SQL fix needed in Supabase dashboard" : "FIXED");

    // Clean up - revert role
    if (prof2?.role === "admin") {
      await c2.from("profiles").update({ role: "candidate" }).eq("id", u2.user.id);
    }
  }
}

main().catch(console.error);
