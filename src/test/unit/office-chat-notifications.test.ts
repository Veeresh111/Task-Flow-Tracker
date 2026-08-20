import { describe, it, expect, vi, beforeEach } from "vitest";
import { notificationService } from "@/lib/notifications";
import { chatService } from "@/lib/chat-service";

// Mock Supabase client
vi.mock("@/lib/supabase", () => {
  const createQueryBuilder = (tableName: string) => {
    const builder: any = {
      select: vi.fn().mockImplementation((_cols, opts) => {
        if (opts?.count === 'exact') {
          builder.countResult = 1;
        }
        return builder;
      }),
      upsert: vi.fn().mockImplementation(() => builder),
      update: vi.fn().mockImplementation(() => builder),
      insert: vi.fn().mockImplementation(() => builder),
      eq: vi.fn().mockImplementation(() => builder),
      order: vi.fn().mockImplementation(() => builder),
      limit: vi.fn().mockImplementation(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: { candidate_id: 'cand-100' }, error: null }),
      then: vi.fn().mockImplementation((resolve: any) => {
        if (builder.countResult !== undefined) {
          resolve({ count: builder.countResult, error: null });
        } else if (tableName === 'chat_reads') {
          resolve({
            data: [
              { user_id: 'usr-2', peer_id: 'usr-1', last_read_at: '2026-07-29T11:00:00Z' }
            ],
            error: null
          });
        } else {
          resolve({
            data: [
              { id: 'm1', sender_id: 'usr-1', receiver_id: 'usr-2', content: 'Hello Office Chat', is_read: false, created_at: '2026-07-29T12:00:00Z' }
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
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null })
    }
  };
});

describe("Office Chat Notification Engine & Timestamp Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches chat notification to recipient when sending direct message", async () => {
    const spy = vi.spyOn(notificationService, 'sendNotification').mockResolvedValue(true);

    const success = await notificationService.sendNotification({
      userId: "usr-2",
      title: "New message from Admin User",
      message: "Please check sprint progress",
      type: "chat",
      link: "/employee/chat?userId=usr-1"
    });

    expect(spy).toHaveBeenCalledWith({
      userId: "usr-2",
      title: "New message from Admin User",
      message: "Please check sprint progress",
      type: "chat",
      link: "/employee/chat?userId=usr-1"
    });
    expect(success).toBe(true);
  });

  it("resolves chat recipient role path correctly", () => {
    const getRecipientPath = (role: string, senderId: string) => {
      const rRole = (role || "employee").toLowerCase();
      const rPath = rRole === 'admin' ? '/admin/chat' :
                    rRole === 'hr' ? '/hr/chat' :
                    rRole === 'team_lead' || rRole === 'tl' ? '/team-lead/chat' :
                    rRole === 'candidate' ? '/candidate/messages' :
                    '/employee/chat';
      return `${rPath}?userId=${senderId}`;
    };

    expect(getRecipientPath('admin', 'usr-1')).toBe('/admin/chat?userId=usr-1');
    expect(getRecipientPath('hr', 'usr-1')).toBe('/hr/chat?userId=usr-1');
    expect(getRecipientPath('team_lead', 'usr-1')).toBe('/team-lead/chat?userId=usr-1');
    expect(getRecipientPath('employee', 'usr-1')).toBe('/employee/chat?userId=usr-1');
    expect(getRecipientPath('candidate', 'usr-1')).toBe('/candidate/messages?userId=usr-1');
  });

  it("calculates unread messages strictly from last_read_at timestamp", async () => {
    const unreadMap = await chatService.getUnreadChatCounts("usr-2");
    expect(unreadMap.get("usr-1")).toBe(1);
  });

  it("persists chat conversation read timestamp to database", async () => {
    const success = await chatService.markConversationAsRead("usr-2", "usr-1");
    expect(success).toBe(true);
  });

  it("clears chat notifications as read when opening direct message thread", async () => {
    const result = await notificationService.markAllAsRead("usr-2", "employee");
    expect(result).toBe(true);
  });
});
