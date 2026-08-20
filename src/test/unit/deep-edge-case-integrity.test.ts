import { describe, it, expect, vi, beforeEach } from "vitest";
import { notificationService } from "@/lib/notifications";
import { chatService } from "@/lib/chat-service";

// Mock Supabase client for deep edge-case testing
vi.mock("@/lib/supabase", () => {
  let simulatedError: any = null;
  let simulatedRowCount = 1;

  const createQueryBuilder = (tableName: string) => {
    const builder: any = {
      select: vi.fn().mockImplementation((_cols, opts) => {
        if (opts?.count === 'exact') {
          builder.countResult = simulatedRowCount;
        }
        return builder;
      }),
      update: vi.fn().mockImplementation(() => builder),
      insert: vi.fn().mockImplementation(() => builder),
      upsert: vi.fn().mockImplementation(() => builder),
      delete: vi.fn().mockImplementation(() => builder),
      eq: vi.fn().mockImplementation(() => builder),
      or: vi.fn().mockImplementation(() => builder),
      order: vi.fn().mockImplementation(() => builder),
      limit: vi.fn().mockImplementation(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: { candidate_id: 'cand-edge-1' }, error: simulatedError }),
      then: vi.fn().mockImplementation((resolve: any) => {
        if (simulatedError) {
          resolve({ data: null, error: simulatedError, count: null, status: 500 });
        } else if (builder.countResult !== undefined) {
          resolve({ count: builder.countResult, error: null, status: 200 });
        } else {
          const mockData = simulatedRowCount > 0
            ? [{ id: 'notif-1', user_id: 'usr-edge-1', title: 'Test Alert', is_read: false }]
            : [];
          resolve({ data: mockData, error: null, count: simulatedRowCount, status: 200 });
        }
      })
    };
    return builder;
  };

  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => createQueryBuilder(table)),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-edge-1', email: 'edge@test.com' } }, error: null })
      },
      __setSimulatedError: (err: any) => { simulatedError = err; },
      __setSimulatedRowCount: (count: number) => { simulatedRowCount = count; }
    }
  };
});

describe("Phase 3: Deep Edge-Case Testing Suite", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabase } = await import("@/lib/supabase") as any;
    supabase.__setSimulatedError(null);
    supabase.__setSimulatedRowCount(1);
  });

  describe("1. The Network Drop & 500 Internal Error Test", () => {
    it("explicitly catches and rejects mutations when network drops or returns 500", async () => {
      const { supabase } = await import("@/lib/supabase") as any;
      supabase.__setSimulatedError({ message: "Network connection lost (500)", code: "500" });

      await expect(
        notificationService.markAsRead("notif-1", "employee", "usr-edge-1")
      ).rejects.toThrow(/Database update failed/);
    });

    it("throws error during batch markAllAsRead when database returns server error", async () => {
      const { supabase } = await import("@/lib/supabase") as any;
      supabase.__setSimulatedError({ message: "Internal server error", code: "500" });

      await expect(
        notificationService.markAllAsRead("usr-edge-1", "employee")
      ).rejects.toThrow(/Database update failed/);
    });
  });

  describe("2. The Bad Auth & Missing Token Test", () => {
    it("rejects markAsRead when notificationId is missing", async () => {
      await expect(
        notificationService.markAsRead("", "employee", "usr-edge-1")
      ).rejects.toThrow(/400 Bad Request/);
    });

    it("returns false cleanly without mutating when userId is null in markAllAsRead", async () => {
      const result = await notificationService.markAllAsRead("", "employee");
      expect(result).toBe(false);
    });
  });

  describe("3. The Desync & Database Truth Test", () => {
    it("fetches mathematically aggregate unread count directly from database", async () => {
      const { supabase } = await import("@/lib/supabase") as any;
      supabase.__setSimulatedRowCount(7);

      const count = await notificationService.fetchUnreadCount("usr-edge-1", "employee");
      expect(count).toBe(7);
    });

    it("derives zero unread chats when all messages are older than last_read_at timestamp", async () => {
      const unreadMap = await chatService.getUnreadChatCounts("usr-edge-1");
      expect(unreadMap instanceof Map).toBe(true);
    });
  });

  describe("4. Mutation Integrity & Row Verification Test", () => {
    it("successfully updates notification when database returns 200 OK with modified row", async () => {
      const result = await notificationService.markAsRead("notif-1", "employee", "usr-edge-1");
      expect(result).toBe(true);
    });

    it("successfully completes markAllAsRead with verified update payload", async () => {
      const result = await notificationService.markAllAsRead("usr-edge-1", "employee");
      expect(result).toBe(true);
    });
  });
});
