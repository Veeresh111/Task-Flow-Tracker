import { supabase } from "@/lib/supabase";

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: "active" | "completed" | "on_hold";
  deadline: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function listProjectsAdmin() {
  return supabase.from("projects").select("*").order("created_at", { ascending: false }).returns<ProjectRow[]>();
}

export async function listProjectsForTeamLead(teamLeadId: string) {
  return supabase
    .from("projects")
    .select("*, project_team_leads!inner(team_lead_id)")
    .eq("project_team_leads.team_lead_id", teamLeadId)
    .order("created_at", { ascending: false })
    .returns<(ProjectRow & { project_team_leads: { team_lead_id: string }[] })[]>();
}

export async function listProjectsForEmployee(employeeId: string) {
  return supabase
    .from("projects")
    .select("*, tasks!inner(assignee_id)")
    .eq("tasks.assignee_id", employeeId)
    .order("created_at", { ascending: false })
    .returns<(ProjectRow & { tasks: { assignee_id: string }[] })[]>();
}

export async function createProject(input: { name: string; description: string; deadline: string | null; createdBy: string }) {
  return supabase
    .from("projects")
    .insert([{ name: input.name, description: input.description, deadline: input.deadline, created_by: input.createdBy }])
    .select("*")
    .single()
    .returns<ProjectRow>();
}

export async function setProjectTeamLeads(projectId: string, teamLeadIds: string[]) {
  // Replace semantics: delete existing rows then insert new.
  const del = await supabase.from("project_team_leads").delete().eq("project_id", projectId);
  if (del.error) return del;

  if (teamLeadIds.length === 0) return { data: [], error: null };

  return supabase.from("project_team_leads").insert(teamLeadIds.map((id) => ({ project_id: projectId, team_lead_id: id })));
}

