import { describe, it, expect, vi, beforeEach } from "vitest";
import { enforceRoleGuard, withRoleGuard, SecurityForbiddenError } from "@/lib/rbac-guard";

describe("Strict RBAC Middleware & Security Guard", () => {
  it("allows access when user has permitted role ('admin')", async () => {
    const context = await enforceRoleGuard(["admin", "hr"], {
      userId: "usr-admin-1",
      role: "admin",
      department: "Management"
    });

    expect(context.userId).toBe("usr-admin-1");
    expect(context.role).toBe("admin");
  });

  it("allows access when user has permitted role ('hr')", async () => {
    const context = await enforceRoleGuard(["admin", "hr"], {
      userId: "usr-hr-1",
      role: "hr",
      department: "Human Resources"
    });

    expect(context.userId).toBe("usr-hr-1");
    expect(context.role).toBe("hr");
  });

  it("throws SecurityForbiddenError (403) when standard employee attempts administrative action", async () => {
    await expect(
      enforceRoleGuard(["admin", "hr"], {
        userId: "usr-emp-1",
        role: "employee",
        department: "Engineering"
      })
    ).rejects.toThrow(SecurityForbiddenError);
  });

  it("throws SecurityForbiddenError (403) when manager role attempts unauthorized action", async () => {
    await expect(
      enforceRoleGuard(["admin", "hr"], {
        userId: "usr-mgr-1",
        role: "manager",
        department: "Sales"
      })
    ).rejects.toThrow(/403 Forbidden/);
  });

  it("properly guards higher-order wrapped controller function", async () => {
    const protectedAction = withRoleGuard(["admin", "hr"], async (ctx, payload: string) => {
      return `Action executed by ${ctx.userId} for payload: ${payload}`;
    });

    // In unit test where session is empty, it rejects with auth required
    await expect(protectedAction("financial_batch_disburse")).rejects.toThrow();
  });
});
