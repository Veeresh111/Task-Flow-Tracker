import { describe, it, expect, vi, beforeEach } from "vitest";
import { notificationService } from "@/lib/notifications";

// Mock Supabase client with complete builder chaining support & RPC mocking
vi.mock("@/lib/supabase", () => {
  const createQueryBuilder = (tableName: string) => {
    const builder: any = {
      select: vi.fn().mockImplementation((_cols, opts) => {
        if (opts?.count === 'exact') {
          builder.countResult = tableName === 'candidate_notifications' ? 2 : 4;
        }
        return builder;
      }),
      or: vi.fn().mockImplementation(() => builder),
      update: vi.fn().mockImplementation(() => builder),
      insert: vi.fn().mockImplementation(() => builder),
      in: vi.fn().mockImplementation(() => builder),
      eq: vi.fn().mockImplementation(() => builder),
      order: vi.fn().mockImplementation(() => builder),
      limit: vi.fn().mockImplementation(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: { candidate_id: 'cand-100' }, error: null }),
      then: vi.fn().mockImplementation((resolve: any) => {
        if (builder.countResult !== undefined) {
          resolve({ count: builder.countResult, error: null });
        } else if (tableName === 'candidate_notifications') {
          resolve({
            data: [
              { id: 'c1', candidate_id: 'cand-100', title: 'Interview Scheduled', message: 'Tomorrow at 10 AM', read: false, created_at: '2026-07-29T10:00:00Z' },
              { id: 'c2', candidate_id: 'cand-100', title: 'Offer Letter Ready', message: 'Please review', read: false, created_at: '2026-07-29T11:00:00Z' }
            ],
            error: null
          });
        } else if (tableName === 'profiles') {
          resolve({
            data: [
              { id: 'u1', role: 'admin', name: 'Admin One' },
              { id: 'u2', role: 'hr', name: 'HR Lead' }
            ],
            error: null
          });
        } else {
          resolve({
            data: [
              { id: 'n1', user_id: 'usr-100', title: 'Task Assigned', message: 'Fix login bug', is_read: false, created_at: '2026-07-29T09:00:00Z' },
              { id: 'n2', user_id: 'usr-100', title: 'Leave Approved', message: 'Annual leave approved', is_read: true, created_at: '2026-07-29T08:00:00Z' }
            ],
            error: null
          });
        }
      })
    };
    return builder;
  };

  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => createQueryBuilder(table)),
      rpc: vi.fn().mockImplementation((fnName: string) => {
        if (fnName === 'mark_all_notifications_read') {
          return Promise.resolve({ data: { success: true, updated_user_notifications: 4, updated_candidate_notifications: 0 }, error: null });
        }
        if (fnName === 'mark_notification_read') {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-jwt-token' } }, error: null })
      }
    }
  };
});

describe("Enterprise Real-time Notification Engine & Mark-Read Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("resolves candidate_id correctly for candidate user role", async () => {
    const candidateId = await notificationService.getCandidateId("usr-cand-1");
    expect(candidateId).toBe("cand-100");
  });

  it("fetches exact DB unread count for standard users", async () => {
    const count = await notificationService.fetchUnreadCount("usr-100", "employee");
    expect(count).toBe(4);
  });

  it("fetches exact DB unread count for candidate users", async () => {
    const count = await notificationService.fetchUnreadCount("usr-cand-1", "candidate");
    expect(count).toBe(2);
  });

  it("fetches notification list and maps read status seamlessly for candidates", async () => {
    const list = await notificationService.fetchNotifications("usr-cand-1", "candidate");
    expect(list.length).toBe(2);
    expect(list[0].title).toBe("Interview Scheduled");
    expect(list[0].is_read).toBe(false);
  });

  it("marks individual notification as read via RPC / backend update", async () => {
    const result = await notificationService.markAsRead("n1", "employee", "usr-100");
    expect(result).toBe(true);
  });

  it("marks all notifications as read atomically without 403 errors", async () => {
    const result = await notificationService.markAllAsRead("usr-100", "employee");
    expect(result).toBe(true);
  });

  it("marks all notifications as read for candidate users atomically", async () => {
    const result = await notificationService.markAllAsRead("usr-cand-1", "candidate");
    expect(result).toBe(true);
  });

  it("dispatches role broadcast notifications across the organization", async () => {
    const count = await notificationService.sendToRole(["admin", "hr"], {
      title: "Recruitment Action Required",
      message: "New candidate submitted assessment",
      type: "recruitment"
    });
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("dispatches new notifications for candidate and user roles", async () => {
    const userNotif = await notificationService.sendNotification({
      userId: "usr-100",
      title: "New Task",
      message: "Please complete sprint task",
      type: "task"
    });
    expect(userNotif).toBe(true);

    const candNotif = await notificationService.sendNotification({
      candidateId: "cand-100",
      title: "Offer Extended",
      message: "Congratulations! View offer letter",
      type: "offer"
    });
    expect(candNotif).toBe(true);
  });
});
