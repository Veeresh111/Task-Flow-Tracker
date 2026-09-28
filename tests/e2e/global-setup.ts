/**
 * E2E global setup — VALIDATION ONLY.
 *
 * HISTORY (Session 6 hardening): this file previously seeded a "dummy
 * enterprise company dataset" (fake profiles + a fake leave row) into the
 * live database via the anon key. That is fake production data — prohibited.
 * The seeding is REMOVED. Tests must run against real backend state and mint
 * their own probe artifacts explicitly (and only where a test legitimately
 * requires them).
 */
export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL || "https://txwxtsdsbuddqfrtllsf.supabase.co";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    // Do not fail hard: specs that need a backend skip themselves when env is
    // absent (they must report NOT PROVEN, not fabricate results).
    console.log("[E2E_GLOBAL_SETUP] Backend env not fully set — backend-dependent specs will self-skip as NOT PROVEN.");
    return;
  }
  console.log(`[E2E_GLOBAL_SETUP] Backend target validated (no fake data seeded): ${url}`);
}
