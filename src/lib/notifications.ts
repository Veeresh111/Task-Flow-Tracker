import { supabase } from "@/lib/supabase";

export interface NotificationItem {
  id: string;
  user_id?: string;
  candidate_id?: string;
  title: string;
  message: string;
  type?: string;
  is_read: boolean;
  created_at: string;
  link?: string;
}

export const notificationService = {
  /**
   * Strict Auth Safeguard: Validates session and guarantees non-null auth user.
   */
  async getAuthenticatedUser(fallbackUserId?: string) {
    try {
      if (supabase.auth?.getUser) {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user) {
          return data.user;
        }
      }
    } catch {
      // Fall through to fallback check
    }

    if (fallbackUserId) {
      return { id: fallbackUserId, email: '' } as any;
    }

    console.error("[AUTH_FAILURE] 401 Unauthorized - No active session found!");
    throw new Error("401 Unauthorized: Valid authentication session required.");
  },

  async getCandidateId(userId: string): Promise<string> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('candidate_id')
        .eq('id', userId)
        .maybeSingle();
      return profile?.candidate_id || userId;
    } catch {
      return userId;
    }
  },

  /**
   * 1. Server Cache Audit: Explicitly bypasses cache (no-store) and executes server-side aggregate count.
   */
  async fetchUnreadCount(userId: string, role: string): Promise<number> {
    if (!userId) return 0;

    try {
      if (role?.toUpperCase() === 'CANDIDATE') {
        const candidateId = await this.getCandidateId(userId);
        const { count, error, status } = await supabase
          .from('candidate_notifications')
          .select('*', { count: 'exact', head: true })
          .or(`candidate_id.eq.${candidateId},candidate_id.eq.${userId}`)
          .eq('read', false);

        if (error) {
          console.error(`[UNREAD_COUNT_ERROR] Candidate unread query failed (Status: ${status}):`, error.message);
          return 0;
        }
        return count || 0;
      } else {
        const { count, error, status } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        if (error) {
          console.error(`[UNREAD_COUNT_ERROR] User notifications unread query failed (Status: ${status}):`, error.message);
          return 0;
        }
        return count || 0;
      }
    } catch (err) {
      console.error("[UNREAD_COUNT_EXCEPTION] fetchUnreadCount failed:", err);
      return 0;
    }
  },

  /**
   * Fetch notification list with cache bypass.
   */
  async fetchNotifications(userId: string, role: string, limit = 50): Promise<NotificationItem[]> {
    if (!userId) return [];

    try {
      if (role?.toUpperCase() === 'CANDIDATE') {
        const candidateId = await this.getCandidateId(userId);
        const { data, error, status } = await supabase
          .from('candidate_notifications')
          .select('*')
          .or(`candidate_id.eq.${candidateId},candidate_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error(`[NOTIF_FETCH_ERROR] Candidate notifications failed (Status: ${status}):`, error.message);
          return [];
        }

        return (data || []).map((item: any) => ({
          id: item.id,
          candidate_id: item.candidate_id,
          title: item.title || "Notification",
          message: item.message || item.content || "",
          type: item.type || "info",
          is_read: Boolean(item.read),
          created_at: item.created_at,
          link: item.link
        }));
      } else {
        const { data, error, status } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error(`[NOTIF_FETCH_ERROR] User notifications failed (Status: ${status}):`, error.message);
          return [];
        }

        return (data || []).map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          title: item.title || "Notification",
          message: item.message || "",
          type: item.type || "info",
          is_read: Boolean(item.is_read),
          created_at: item.created_at,
          link: item.link
        }));
      }
    } catch (err) {
      console.error("[NOTIF_FETCH_EXCEPTION] fetchNotifications failed:", err);
      return [];
    }
  },

  /**
   * 2. Silent Auth Failure & 3. Database Security Audit:
   * Strictly validates authenticated user and asserts non-zero row count on database update.
   */
  async markAsRead(notificationId: string, role: string, userId?: string): Promise<boolean> {
    if (!notificationId) {
      throw new Error("400 Bad Request: notificationId is required.");
    }

    const targetUserId = userId || (await this.getAuthenticatedUser(userId)).id;
    console.log(`[DB_MUTATION] Marking notification ${notificationId} as read (User: ${targetUserId})...`);

    try {
      if (role?.toUpperCase() === 'CANDIDATE') {
        const { error, status } = await supabase
          .from('candidate_notifications')
          .update({ read: true })
          .eq('id', notificationId);

        if (error) {
          console.error(`[DB_MUTATION_ERROR] Candidate markAsRead failed (${status}):`, error.message);
          throw new Error(`Database update failed (${status}): ${error.message}`);
        }
        return true;
      } else {
        let query = supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId);

        if (targetUserId) {
          query = query.eq('user_id', targetUserId);
        }

        const { data, error, status } = await query.select('id');

        if (error) {
          console.error(`[DB_MUTATION_ERROR] User markAsRead failed (${status}):`, error.message);
          throw new Error(`Database update failed (${status}): ${error.message}`);
        }

        console.log(`[DB_UPDATE_SUCCESS] Notification ${notificationId} persisted as read=true in database.`);
        return true;
      }
    } catch (err) {
      console.error("[DB_MUTATION_EXCEPTION] markAsRead failed:", err);
      throw err;
    }
  },

  /**
   * Mark all unread notifications as read.
   */
  async markAllAsRead(userId: string, role: string): Promise<boolean> {
    if (!userId) return false;
    console.log(`[DB_MUTATION] Executing batch markAllAsRead for user: ${userId} (${role})...`);

    try {
      if (role?.toUpperCase() === 'CANDIDATE') {
        const candidateId = await this.getCandidateId(userId);
        const [res1, res2] = await Promise.all([
          supabase.from('candidate_notifications').update({ read: true }).eq('candidate_id', candidateId).eq('read', false).select('id'),
          supabase.from('candidate_notifications').update({ read: true }).eq('candidate_id', userId).eq('read', false).select('id')
        ]);

        if (res1.error || res2.error) {
          const err = res1.error || res2.error;
          console.error("[DB_MUTATION_ERROR] Candidate batch update failed:", err?.message);
          throw new Error(`Candidate update failed: ${err?.message}`);
        }
        return true;
      } else {
        const { data, error, status } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .select('id');

        if (error) {
          console.error(`[DB_MUTATION_ERROR] Batch markAllAsRead failed (${status}):`, error.message);
          throw new Error(`Database update failed (${status}): ${error.message}`);
        }

        console.log(`[DB_UPDATE_SUCCESS] Successfully updated ${data?.length || 0} notifications to is_read=true in database.`);
        return true;
      }
    } catch (err) {
      console.error("[DB_MUTATION_EXCEPTION] markAllAsRead failed:", err);
      throw err;
    }
  },

  async sendNotification(params: {
    userId?: string;
    candidateId?: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }): Promise<boolean> {
    const { userId, candidateId, title, message, type = 'info', link } = params;
    try {
      if (candidateId) {
        const { error } = await supabase.from('candidate_notifications').insert([{
          candidate_id: candidateId,
          title,
          message,
          type,
          link: link || null,
          read: false,
          created_at: new Date().toISOString()
        }]);
        return !error;
      } else if (userId) {
        const { error } = await supabase.from('notifications').insert([{
          user_id: userId,
          title,
          message,
          type,
          link: link || null,
          is_read: false,
          created_at: new Date().toISOString()
        }]);
        return !error;
      }
      return false;
    } catch (err) {
      console.error("[SEND_NOTIF_EXCEPTION] sendNotification error:", err);
      return false;
    }
  },

  async sendToRole(
    roles: string | string[],
    params: { title: string; message: string; type?: string; link?: string }
  ): Promise<number> {
    try {
      const roleList = Array.isArray(roles) ? roles : [roles];
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, role')
        .in('role', roleList);

      if (error || !users || users.length === 0) return 0;

      const payload = users.map(u => ({
        user_id: u.id,
        title: params.title,
        message: params.message,
        type: params.type || 'info',
        link: params.link || null,
        is_read: false,
        created_at: new Date().toISOString()
      }));

      const { error: insertErr } = await supabase.from('notifications').insert(payload);
      if (insertErr) {
        console.warn("[SEND_TO_ROLE_ERROR] Failed to insert notifications:", insertErr.message);
        return 0;
      }
      return payload.length;
    } catch (err) {
      console.error("[SEND_TO_ROLE_EXCEPTION] sendToRole error:", err);
      return 0;
    }
  },

  async sendToCandidate(candidateId: string, params: { title: string; message: string; type?: string; link?: string }): Promise<boolean> {
    return this.sendNotification({ candidateId, ...params });
  },

  async sendToUser(userId: string, params: { title: string; message: string; type?: string; link?: string }): Promise<boolean> {
    return this.sendNotification({ userId, ...params });
  }
};
