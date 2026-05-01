import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types";

export type ProfileSummary = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  department: string | null;
  role: UserRole;
  team_lead_id: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
};

export async function listTeamLeads() {
  return supabase
    .from("profiles")
    .select("id,email,name,phone,department,role,team_lead_id,approval_status,created_at")
    .eq("role", "team_lead")
    .order("created_at", { ascending: false })
    .returns<ProfileSummary[]>();
}

export async function listEmployees() {
  return supabase
    .from("profiles")
    .select("id,email,name,phone,department,role,team_lead_id,approval_status,created_at")
    .eq("role", "employee")
    .order("created_at", { ascending: false })
    .returns<ProfileSummary[]>();
}

export async function promoteEmployeeToTeamLead(profileId: string) {
  return supabase.from("profiles").update({ role: "team_lead" }).eq("id", profileId);
}

export async function demoteTeamLeadToEmployee(profileId: string) {
  return supabase.from("profiles").update({ role: "employee" }).eq("id", profileId);
}

export async function setApprovalStatus(profileId: string, approvalStatus: "approved" | "rejected") {
  return supabase.from("profiles").update({ approval_status: approvalStatus }).eq("id", profileId);
}

export async function assignEmployeeTeamLead(employeeId: string, teamLeadId: string | null) {
  return supabase.from("profiles").update({ team_lead_id: teamLeadId }).eq("id", employeeId);
}

export async function listPendingApprovalsForTeamLead(teamLeadId: string) {
  return supabase
    .from("profiles")
    .select("id,email,name,phone,department,role,team_lead_id,approval_status,created_at")
    .eq("role", "employee")
    .eq("team_lead_id", teamLeadId)
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false })
    .returns<ProfileSummary[]>();
}

