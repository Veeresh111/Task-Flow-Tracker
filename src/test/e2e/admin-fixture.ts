// Test admin fixture — read pre-created admin credentials from environment
// To configure, create a .env.test file in the project root:
//
//   TEST_ADMIN_EMAIL=admin@yourdomain.com
//   TEST_ADMIN_PASSWORD=your-admin-password
//
// Or set these as environment variables when running tests.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

export interface AdminFixture {
  user: { id: string; email: string };
  client: SupabaseClient;
}

/**
 * Initialize the admin fixture by signing in as a pre-created admin.
 * 
 * If no admin credentials are configured, creates a new user and
 * writes setup instructions to the console.
 */
export async function getAdminFixture(): Promise<AdminFixture> {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (email && password) {
    const a = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await a.auth.signInWithPassword({ email, password });
    if (!error && data?.session) {
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      });
      return { user: { id: data.user.id, email: data.user.email! }, client: c };
    }
  }

  // No configured admin — create one and print setup instructions
  const a = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminEmail = `test-admin-${Date.now()}@test.com`;
  const { data: u, error: r } = await a.auth.signUp({
    email: adminEmail,
    password: "TestPass123!",
    options: { data: { name: "Test Admin", registered_role: "admin" } },
  });
  if (r || !u?.user) throw new Error(`Admin signup failed: ${r?.message}`);

  console.log(`
  ─────────────────────────────────────────────────────────────
  ⚠ A test admin user was created but could NOT be promoted
    to admin role because the RLS trigger blocks self-elevation.

  To create a permanent admin fixture:
  1. Run in Supabase SQL Editor:
     UPDATE profiles SET role = 'admin' WHERE id = '${u.user.id}';
  2. Set env vars:
     TEST_ADMIN_EMAIL=${adminEmail}
     TEST_ADMIN_PASSWORD=TestPass123!
  3. Re-run this test.
  ─────────────────────────────────────────────────────────────
  `);

  throw new Error(
    "No admin fixture available. " +
    "See console output above for setup instructions."
  );
}
