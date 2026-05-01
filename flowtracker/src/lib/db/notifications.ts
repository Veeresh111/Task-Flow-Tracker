import { supabase } from "@/lib/supabase";

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  sender_id: string;
  recipient_id: string;
  read: boolean;
  created_at: string;
  sender?: { id: string; name: string; email: string } | null;
};

export async function listMyNotifications(userId: string) {
  return supabase
    .from("notifications")
    .select("*, sender:profiles!notifications_sender_id_fkey(id,name,email)")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .returns<NotificationRow[]>();
}

export async function createNotification(input: {
  title: string;
  message: string;
  senderId: string;
  recipientId: string;
}) {
  return supabase
    .from("notifications")
    .insert([{ title: input.title, message: input.message, sender_id: input.senderId, recipient_id: input.recipientId }])
    .select("*")
    .single()
    .returns<NotificationRow>();
}

export async function markNotificationRead(id: string) {
  return supabase.from("notifications").update({ read: true }).eq("id", id);
}

