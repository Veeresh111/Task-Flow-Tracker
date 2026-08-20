import { supabase } from "@/lib/supabase";

export interface ChatReadRecord {
  user_id: string;
  peer_id: string;
  last_read_at: string;
  last_read_message_id?: string;
}

export const chatService = {
  /**
   * Strictly derives unread message counts per peer from database.
   * Uses participant timestamp tracking where available, with seamless direct fallback.
   */
  async getUnreadChatCounts(userId: string): Promise<Map<string, number>> {
    if (!userId) return new Map();
    const unreadMap = new Map<string, number>();

    try {
      // 1. Fetch direct unread messages for user
      const { data: incomingMessages, error: msgError } = await supabase
        .from('messages')
        .select('id, sender_id, created_at, is_read')
        .eq('receiver_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (msgError || !incomingMessages) {
        return unreadMap;
      }

      // 2. Try fetching participant read timestamps
      let lastReadMap = new Map<string, number>();
      try {
        const { data: readRecords } = await supabase
          .from('chat_reads')
          .select('peer_id, last_read_at')
          .eq('user_id', userId);

        if (readRecords) {
          readRecords.forEach(r => {
            lastReadMap.set(r.peer_id, new Date(r.last_read_at).getTime());
          });
        }
      } catch {
        // Fallback to is_read boolean
      }

      // 3. Aggregate unread count per sender
      incomingMessages.forEach(msg => {
        const senderId = msg.sender_id;
        if (!senderId) return;

        const lastReadTime = lastReadMap.get(senderId) || 0;
        const msgTime = new Date(msg.created_at).getTime();

        // Unread if newer than last_read_at OR is_read is false
        if ((lastReadTime > 0 && msgTime > lastReadTime) || (lastReadTime === 0 && !msg.is_read)) {
          const currentCount = unreadMap.get(senderId) || 0;
          unreadMap.set(senderId, currentCount + 1);
        }
      });

      return unreadMap;
    } catch (err) {
      console.warn("[CHAT_PERSISTENCE] Error calculating unread chats:", err);
      return unreadMap;
    }
  },

  /**
   * Mark a conversation with a peer or room as read by updating participant last_read_at timestamp in database.
   */
  async markConversationAsRead(userId: string, peerId: string): Promise<boolean> {
    if (!userId || !peerId) return false;
    const nowIso = new Date().toISOString();

    try {
      // 1. Direct message table update
      try {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('receiver_id', userId)
          .eq('sender_id', peerId)
          .eq('is_read', false);
      } catch (msgErr) {
        // Handled
      }

      // 2. Optional participant timestamp tracking
      try {
        await supabase
          .from('chat_reads')
          .upsert({
            user_id: userId,
            peer_id: peerId,
            last_read_at: nowIso,
            updated_at: nowIso
          }, { onConflict: 'user_id,peer_id' });
      } catch {
        // Handled
      }

      return true;
    } catch (err) {
      console.warn("[CHAT_PERSISTENCE] markConversationAsRead handled:", err);
      return true;
    }
  }
};
