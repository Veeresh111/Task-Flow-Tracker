import { describe, it, expect, vi, beforeEach } from "vitest";

// Simulate the badge counting logic from DashboardLayout.tsx
// Inlined for test isolation

interface BadgeCounts {
  complaints: number;
  approvals: number;
  notifications: number;
  tasks: number;
}

function getStoredTime(userId: string, key: string): string {
  return (
    (typeof localStorage !== "undefined" &&
      localStorage.getItem(`last_viewed_${userId}_${key}`)) ||
    new Date(0).toISOString()
  );
}

function setStoredTime(userId: string, key: string): void {
  if (typeof localStorage !== "undefined") {
    const now = new Date();
    now.setSeconds(now.getSeconds() + 1);
    localStorage.setItem(`last_viewed_${userId}_${key}`, now.toISOString());
  }
}

function computeBadgeCounts(
  params: {
    role: string;
    pathname: string;
    storedTime: { approvals: string; complaints: string; tasks: string; notifications: string };
    dbCounts: { notifications: number; tasks: number; complaints: number; approvals: number };
  },
): BadgeCounts {
  let { notifications: bNotif, tasks: bTasks, complaints: bComp, approvals: bApp } = params.dbCounts;

  // If on the page itself, clear the badge
  if (params.pathname.includes("/approvals")) bApp = 0;
  if (params.pathname.includes("/complaints")) bComp = 0;
  if (params.pathname.includes("/tasks")) bTasks = 0;
  if (params.pathname.includes("/notifications")) bNotif = 0;

  return { complaints: bComp, approvals: bApp, notifications: bNotif, tasks: bTasks };
}

describe("Dashboard Badge Logic", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  describe("getStoredTime / setStoredTime", () => {
    it("returns epoch for never-viewed keys", () => {
      const time = getStoredTime("user-1", "notifications");
      expect(new Date(time).getTime()).toBe(0);
    });

    it("stores and retrieves time", () => {
      setStoredTime("user-1", "approvals");
      const time = getStoredTime("user-1", "approvals");
      expect(new Date(time).getTime()).toBeGreaterThan(0);
    });

    it("stores times independently per user", () => {
      setStoredTime("user-1", "approvals");
      setStoredTime("user-2", "complaints");
      const t1 = getStoredTime("user-1", "approvals");
      const t2 = getStoredTime("user-2", "approvals");
      expect(new Date(t1).getTime()).toBeGreaterThan(0);
      expect(new Date(t2).getTime()).toBe(0);
    });
  });

  describe("computeBadgeCounts", () => {
    it("clears notifications badge when on notifications page", () => {
      const result = computeBadgeCounts({
        role: "admin",
        pathname: "/admin/notifications",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 5, tasks: 0, complaints: 0, approvals: 0 },
      });
      expect(result.notifications).toBe(0);
    });

    it("shows notification badge count on other pages", () => {
      const result = computeBadgeCounts({
        role: "admin",
        pathname: "/admin/dashboard",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 3, tasks: 0, complaints: 0, approvals: 0 },
      });
      expect(result.notifications).toBe(3);
    });

    it("clears approvals badge when on approvals page", () => {
      const result = computeBadgeCounts({
        role: "admin",
        pathname: "/admin/approvals",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 0, tasks: 0, complaints: 0, approvals: 7 },
      });
      expect(result.approvals).toBe(0);
    });

    it("clears complaints badge on complaints page", () => {
      const result = computeBadgeCounts({
        role: "admin",
        pathname: "/admin/complaints",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 0, tasks: 0, complaints: 2, approvals: 0 },
      });
      expect(result.complaints).toBe(0);
    });

    it("clears tasks badge on tasks page", () => {
      const result = computeBadgeCounts({
        role: "employee",
        pathname: "/employee/tasks",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 0, tasks: 4, complaints: 0, approvals: 0 },
      });
      expect(result.tasks).toBe(0);
    });

    it("shows badges on a non-badge page", () => {
      const result = computeBadgeCounts({
        role: "admin",
        pathname: "/admin/settings",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 2, tasks: 3, complaints: 1, approvals: 4 },
      });
      expect(result.notifications).toBe(2);
      expect(result.tasks).toBe(3);
      expect(result.complaints).toBe(1);
      expect(result.approvals).toBe(4);
    });

    it("handles candidate role pathnames", () => {
      const result = computeBadgeCounts({
        role: "candidate",
        pathname: "/candidate/notifications",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 1, tasks: 0, complaints: 0, approvals: 0 },
      });
      expect(result.notifications).toBe(0);
    });

    it("handles team_lead role pathnames", () => {
      const result = computeBadgeCounts({
        role: "team_lead",
        pathname: "/team-lead",
        storedTime: { approvals: "0", complaints: "0", tasks: "0", notifications: "0" },
        dbCounts: { notifications: 5, tasks: 0, complaints: 3, approvals: 0 },
      });
      expect(result.notifications).toBe(5);
      expect(result.complaints).toBe(3);
    });
  });
});
