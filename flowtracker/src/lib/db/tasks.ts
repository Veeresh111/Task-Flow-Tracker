import { supabase } from "@/lib/supabase";

export type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assignee_id: string;
  status: "not_started" | "in_progress" | "blocked" | "completed";
  priority: "low" | "medium" | "high";
  deadline: string | null;
  hours_spent: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskWithRefs = TaskRow & {
  projects?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; email: string } | null;
};

export async function listMyTasks(userId: string) {
  return supabase
    .from("tasks")
    .select(
      "*, projects(id,name), assignee:profiles!tasks_assignee_id_fkey(id,name,email)"
    )
    .eq("assignee_id", userId)
    .order("created_at", { ascending: false })
    .returns<TaskWithRefs[]>();
}

export async function listTasksForTeamLead(_teamLeadId: string) {
  // RLS enforces which rows the team lead can see.
  return supabase
    .from("tasks")
    .select("*, projects(id,name), assignee:profiles!tasks_assignee_id_fkey(id,name,email)")
    .order("created_at", { ascending: false })
    .returns<TaskWithRefs[]>();
}

export async function listTasksAdmin() {
  return supabase
    .from("tasks")
    .select("*, projects(id,name), assignee:profiles!tasks_assignee_id_fkey(id,name,email)")
    .order("created_at", { ascending: false })
    .returns<TaskWithRefs[]>();
}

export async function createTask(input: {
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: "low" | "medium" | "high";
  deadline: string | null;
  createdBy: string;
}) {
  return supabase
    .from("tasks")
    .insert([
      {
        project_id: input.projectId,
        title: input.title,
        description: input.description,
        assignee_id: input.assigneeId,
        priority: input.priority,
        deadline: input.deadline,
        created_by: input.createdBy,
      },
    ])
    .select("*, projects(id,name), assignee:profiles!tasks_assignee_id_fkey(id,name,email)")
    .single()
    .returns<TaskWithRefs>();
}

export async function updateTaskStatus(taskId: string, status: TaskRow["status"]) {
  return supabase.from("tasks").update({ status }).eq("id", taskId);
}

