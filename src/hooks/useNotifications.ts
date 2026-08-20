import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { notificationService, NotificationItem } from "@/lib/notifications";

// Global Window Event Identifiers
export const NOTIF_CLEARED_EVENT = 'fwc:notifications-cleared';
export const NOTIF_SINGLE_READ_EVENT = 'fwc:notification-single-read';

export function useNotifications(userId?: string | null, role?: string | null) {
  const queryClient = useQueryClient();
  const currentRole = (role || 'employee').toLowerCase();
  const isCandidate = currentRole === 'candidate';

  const notifQueryKey = ['notifications', userId, currentRole];
  const countQueryKey = ['notification-count', userId, currentRole];

  // =========================================================================
  // 1. Server-Side Aggregate Initial Mount Query (Strict Mathematical Truth)
  // =========================================================================
  const { data: unreadCount = 0, refetch: refetchCount } = useQuery<number>({
    queryKey: countQueryKey,
    queryFn: async () => {
      if (!userId) return 0;
      return await notificationService.fetchUnreadCount(userId, currentRole);
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 10,
  });

  // Query: Notification List
  const { data: notifications = [], isLoading: loading, refetch: refetchList } = useQuery<NotificationItem[]>({
    queryKey: notifQueryKey,
    queryFn: async () => {
      if (!userId) return [];
      return await notificationService.fetchNotifications(userId, currentRole);
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 10,
  });

  const refresh = useCallback(async () => {
    await Promise.all([refetchCount(), refetchList()]);
  }, [refetchCount, refetchList]);

  // =========================================================================
  // 2. Real-Time Synchronization (Supabase WebSocket Subscriptions)
  // =========================================================================
  useEffect(() => {
    if (!userId) return;

    const uniqueId = Math.random().toString(36).substring(2, 9);
    const channelName = isCandidate 
      ? `realtime-notif-cand-${userId}-${uniqueId}`
      : `realtime-notif-user-${userId}-${uniqueId}`;

    const channel = supabase.channel(channelName);

    if (isCandidate) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidate_notifications' },
        (payload) => {
          console.log("[REALTIME_SYNC] Received candidate notification event:", payload.eventType);
          queryClient.invalidateQueries({ queryKey: notifQueryKey });
          queryClient.invalidateQueries({ queryKey: countQueryKey });
        }
      );
    } else {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log("[REALTIME_SYNC] Received notification table event:", payload.eventType);
          queryClient.invalidateQueries({ queryKey: notifQueryKey });
          queryClient.invalidateQueries({ queryKey: countQueryKey });
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isCandidate, queryClient]);

  // =========================================================================
  // 3. Strict Mutations with Bulletproof Optimistic Updates & Rollback
  // =========================================================================
  
  // Single Mark as Read Mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return await notificationService.markAsRead(id, currentRole, userId || undefined);
    },
    onMutate: async (id: string) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: notifQueryKey });
      await queryClient.cancelQueries({ queryKey: countQueryKey });

      // Snapshot previous state for rollback
      const prevNotifs = queryClient.getQueryData<NotificationItem[]>(notifQueryKey) || [];
      const prevCount = queryClient.getQueryData<number>(countQueryKey) || 0;

      // Optimistically update notifications list
      queryClient.setQueryData<NotificationItem[]>(notifQueryKey, (old = []) =>
        old.map(item => item.id === id ? { ...item, is_read: true } : item)
      );

      // Optimistically decrement unread count
      queryClient.setQueryData<number>(countQueryKey, (old = 0) => Math.max(0, old - 1));

      window.dispatchEvent(new CustomEvent(NOTIF_SINGLE_READ_EVENT, { detail: { id } }));

      return { prevNotifs, prevCount };
    },
    onError: (err, id, context) => {
      console.warn("[MUTATION_ERROR] markAsRead failed, rolling back snapshot:", err);
      if (context) {
        queryClient.setQueryData(notifQueryKey, context.prevNotifs);
        queryClient.setQueryData(countQueryKey, context.prevCount);
      }
    },
    onSettled: () => {
      // Explicitly invalidate cache to force fetch absolute database truth
      queryClient.invalidateQueries({ queryKey: notifQueryKey });
      queryClient.invalidateQueries({ queryKey: countQueryKey });
    }
  });

  // Mark All As Read Mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return false;
      return await notificationService.markAllAsRead(userId, currentRole);
    },
    onMutate: async () => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: notifQueryKey });
      await queryClient.cancelQueries({ queryKey: countQueryKey });

      // Snapshot previous state
      const prevNotifs = queryClient.getQueryData<NotificationItem[]>(notifQueryKey) || [];
      const prevCount = queryClient.getQueryData<number>(countQueryKey) || 0;

      // Optimistically clear badge & set all items to read
      queryClient.setQueryData<NotificationItem[]>(notifQueryKey, (old = []) =>
        old.map(item => ({ ...item, is_read: true }))
      );
      queryClient.setQueryData<number>(countQueryKey, 0);

      window.dispatchEvent(new CustomEvent(NOTIF_CLEARED_EVENT, { detail: { userId } }));

      return { prevNotifs, prevCount };
    },
    onError: (err, _vars, context) => {
      console.warn("[MUTATION_ERROR] markAllAsRead failed, rolling back snapshot:", err);
      if (context) {
        queryClient.setQueryData(notifQueryKey, context.prevNotifs);
        queryClient.setQueryData(countQueryKey, context.prevCount);
      }
    },
    onSettled: () => {
      // Invalidate to force sync with database
      queryClient.invalidateQueries({ queryKey: notifQueryKey });
      queryClient.invalidateQueries({ queryKey: countQueryKey });
    }
  });

  // =========================================================================
  // 4. Debouncing & Race Condition Handlers
  // =========================================================================
  const isExecutingRef = useRef(false);

  const markAsRead = async (id: string) => {
    if (!id || !userId) return;
    markAsReadMutation.mutate(id);
  };

  const markAllAsRead = async () => {
    if (!userId || isExecutingRef.current || markAllAsReadMutation.isPending) return;
    isExecutingRef.current = true;
    try {
      await markAllAsReadMutation.mutateAsync();
    } finally {
      setTimeout(() => {
        isExecutingRef.current = false;
      }, 300); // 300ms leading-edge debouncing lock
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
    isMarkingRead: markAllAsReadMutation.isPending || markAsReadMutation.isPending
  };
}
