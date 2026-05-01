import { supabase } from "@/lib/supabase";

export type ChatMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
};

export async function listConversation(userId: string, otherUserId: string) {
  return supabase
    .from("chat_messages")
    .select("*")
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`
    )
    .order("created_at", { ascending: true })
    .returns<ChatMessageRow[]>();
}

export async function sendMessage(input: { senderId: string; recipientId: string; content: string }) {
  return supabase
    .from("chat_messages")
    .insert([{ sender_id: input.senderId, recipient_id: input.recipientId, content: input.content }])
    .select("*")
    .single()
    .returns<ChatMessageRow>();
}

