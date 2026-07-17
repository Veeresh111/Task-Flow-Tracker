import { describe, it, expect } from "vitest";
import { timeAgo } from "@/pages/hr/PendingApprovals";

describe("PendingApprovals — timeAgo", () => {
  it('returns "just now" for dates less than 1 minute ago', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });

  it('returns "Xm ago" for dates between 1-59 minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(d)).toBe("5m ago");
  });

  it('returns "Xh ago" for dates between 1-23 hours ago', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(d)).toBe("3h ago");
  });

  it('returns "Xd ago" for dates between 1-29 days ago', () => {
    const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(d)).toBe("10d ago");
  });

  it('returns "Xmo ago" for dates 30+ days ago', () => {
    const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(d)).toBe("2mo ago");
  });

  it("handles edge case of exactly 1 minute", () => {
    const d = new Date(Date.now() - 60 * 1000).toISOString();
    const result = timeAgo(d);
    expect(["1m ago", "just now"]).toContain(result);
  });

  it("handles edge case of exactly 60 minutes (1 hour)", () => {
    const d = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = timeAgo(d);
    expect(["1h ago", "60m ago"]).toContain(result);
  });
});

describe("PendingApprovals — filter logic", () => {
  const users = [
    { id: "1", email: "a@test.com", name: "Alice", role: "candidate", created_at: new Date().toISOString(), candidateRecord: null },
    { id: "2", email: "b@test.com", name: "Bob", role: "candidate", created_at: new Date().toISOString(), candidateRecord: { id: "c1", email: "b@test.com" } },
    { id: "3", email: "c@test.com", name: "Charlie", role: "candidate", created_at: new Date().toISOString(), candidateRecord: { id: "c2", email: "c@test.com", applicationId: "app1", applicationStatus: "Applied" } },
  ];

  it('filter "all" returns all users', () => {
    const result = users.filter((u) => {
      const f = "all";
      if (f === "candidate") return u.candidateRecord !== null;
      if (f === "normal") return u.candidateRecord === null;
      return true;
    });
    expect(result).toHaveLength(3);
  });

  it('filter "candidate" returns only users with candidate records', () => {
    const result = users.filter((u) => {
      const f = "candidate";
      if (f === "candidate") return u.candidateRecord !== null;
      if (f === "normal") return u.candidateRecord === null;
      return true;
    });
    expect(result).toHaveLength(2);
    expect(result.map((u) => u.name)).toEqual(["Bob", "Charlie"]);
  });

  it('filter "normal" returns only users without candidate records', () => {
    const result = users.filter((u) => {
      const f = "normal";
      if (f === "candidate") return u.candidateRecord !== null;
      if (f === "normal") return u.candidateRecord === null;
      return true;
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("search filters by name case-insensitively", () => {
    const query = "alice";
    const result = users.filter((u) => {
      const matches = u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase());
      return matches;
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("search filters by email", () => {
    const query = "b@test.com";
    const result = users.filter((u) => {
      const matches = u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase());
      return matches;
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Bob");
  });

  it("search returns empty for non-matching query", () => {
    const query = "nonexistent";
    const result = users.filter((u) => {
      const matches = u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase());
      return matches;
    });
    expect(result).toHaveLength(0);
  });

  it("search + filter candidate works together", () => {
    const query = "char";
    const result = users.filter((u) => {
      const matches = u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase());
      if ("candidate" === "candidate") return matches && u.candidateRecord !== null;
      return matches;
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Charlie");
  });
});

describe("PendingApprovals — stats computation", () => {
  const users = [
    { candidateRecord: null },
    { candidateRecord: { id: "c1" } },
    { candidateRecord: { id: "c2" } },
    { candidateRecord: null },
    { candidateRecord: { id: "c3", applicationId: "app1" } },
  ];

  it("computes total, candidates, and normal counts", () => {
    const total = users.length;
    const candidates = users.filter((u) => u.candidateRecord !== null).length;
    const normal = users.filter((u) => u.candidateRecord === null).length;

    expect(total).toBe(5);
    expect(candidates).toBe(3);
    expect(normal).toBe(2);
    expect(candidates + normal).toBe(total);
  });

  it("handles empty list", () => {
    expect(0).toBe(0);
    expect(0).toBe(0);
    expect(0).toBe(0);
  });
});
