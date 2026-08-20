import { createClient } from "@supabase/supabase-js";

export default async function globalSetup() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://txwxtsdsbuddqfrtllsf.supabase.co";
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB";

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log("[GLOBAL_ROBOT_SETUP] Initializing dummy enterprise company dataset...");

  const demoCompany = [
    {
      id: "a1111111-1111-4111-a111-111111111111",
      name: "Sarah Jenkins (HR Lead)",
      email: "hr.sarah@flowtracker.internal",
      role: "hr",
      status: "active",
      department: "Human Resources",
      payroll_ctc: 1800000,
      date_of_joining: "2022-01-10T00:00:00Z",
      experience: 6.0
    },
    {
      id: "b2222222-2222-4222-b222-222222222222",
      name: "Alex Rivera (Senior Engineer)",
      email: "alex.dev@flowtracker.internal",
      role: "employee",
      status: "active",
      department: "Engineering",
      payroll_ctc: 1440000, // 120,000 / mo
      date_of_joining: "2023-09-01T00:00:00Z", // Exactly 3 years as of Sept 2026
      experience: 4.0
    },
    {
      id: "c3333333-3333-4333-c333-333333333333",
      name: "Elena Rostova (Frontend Engineer)",
      email: "elena.ui@flowtracker.internal",
      role: "employee",
      status: "active",
      department: "Engineering",
      payroll_ctc: 960000, // 80,000 / mo
      date_of_joining: "2025-09-01T00:00:00Z", // Exactly 1-year anniversary as of Sept 2026
      experience: 2.0
    },
    {
      id: "d4444444-4444-4444-d444-444444444444",
      name: "Marcus Vance (Associate Engineer)",
      email: "marcus.v@flowtracker.internal",
      role: "employee",
      status: "active",
      department: "Quality Assurance",
      payroll_ctc: 600000, // 50,000 / mo
      date_of_joining: "2026-06-01T00:00:00Z", // 3 months tenure as of Sept 2026
      experience: 0.5
    }
  ];

  for (const emp of demoCompany) {
    try {
      await supabase.from("profiles").upsert(emp, { onConflict: "id" });
    } catch {
      // Handled
    }
  }

  // Seed sample 3-day approved unpaid leave (LWP) for Marcus Vance
  try {
    await supabase.from("leaves").upsert({
      id: "e5555555-5555-4555-e555-555555555555",
      user_id: "d4444444-4444-4444-d444-444444444444",
      type: "unpaid_leave",
      start_date: "2026-08-10",
      end_date: "2026-08-12",
      days_count: 3,
      status: "Approved",
      reason: "Personal Emergency (LWP)"
    }, { onConflict: "id" });
  } catch {
    // Handled
  }

  console.log("[GLOBAL_ROBOT_SETUP] Company dataset seeded successfully.");
}
