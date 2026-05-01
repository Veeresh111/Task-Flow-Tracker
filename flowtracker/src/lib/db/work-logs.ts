import { supabase } from "@/lib/supabase";

export type WorkLogRow = {
  id: string;
  task_id: string;
  user_id: string;
  summary: string;
  hours_spent: number;
  work_date: string;
  created_at: string;
  tasks?: { title: string } | null;
};

export async function listMyWorkLogs(userId: string) {
  return supabase
    .from("work_logs")
    .select("*, tasks(title)")
    .eq("user_id", userId)
    .order("work_date", { ascending: false })
    .returns<WorkLogRow[]>();
}

export async function createWorkLog(input: {
  taskId: string;
  userId: string;
  summary: string;
  hoursSpent: number;
  workDate: string | null;
}) {
  return supabase
    .from("work_logs")
    .insert([
      {
        task_id: input.taskId,
        user_id: input.userId,
        summary: input.summary,
        hours_spent: input.hoursSpent,
        work_date: input.workDate,
      },
    ])
    .select("*")
    .single()
    .returns<WorkLogRow>();
}
