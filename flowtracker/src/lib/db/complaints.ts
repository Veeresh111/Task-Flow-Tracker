import { supabase } from "@/lib/supabase";

export type ComplaintRow = {
  id: string;
  title: string;
  description: string;
  raised_by: string;
  assigned_to: string | null;
  status: "pending" | "resolved" | "closed";
  created_at: string;
  resolved_at: string | null;
  raised_by_profile?: { id: string; name: string; email: string; role: string } | null;
  assigned_to_profile?: { id: string; name: string; email: string } | null;
};

export async function listComplaints() {
  return supabase
    .from("complaints")
    .select(
      "*, raised_by_profile:profiles!complaints_raised_by_fkey(id,name,email,role), assigned_to_profile:profiles!complaints_assigned_to_fkey(id,name,email)"
    )
    .order("created_at", { ascending: false })
    .returns<ComplaintRow[]>();
}

export async function listMyComplaints(userId: string) {
  return supabase
    .from("complaints")
    .select("*")
    .eq("raised_by", userId)
    .order("created_at", { ascending: false })
    .returns<ComplaintRow[]>();
}

export async function createComplaint(input: { title: string; description: string; raisedBy: string }) {
  return supabase
    .from("complaints")
    .insert([{ title: input.title, description: input.description, raised_by: input.raisedBy }])
    .select("*")
    .single()
    .returns<ComplaintRow>();
}

export async function updateComplaintStatus(id: string, status: ComplaintRow["status"]) {
  const patch: any = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  return supabase.from("complaints").update(patch).eq("id", id);
}

