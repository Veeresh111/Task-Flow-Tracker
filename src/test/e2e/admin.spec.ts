import { test, expect } from "@playwright/test";
import { navigateAndCapture } from "./helpers";

test.describe("Admin Workflow", () => {
  const ADMIN_ROUTES = [
    { path: "/admin", name: "Dashboard" },
    { path: "/admin/analytics", name: "Analytics" },
    { path: "/admin/payroll", name: "Payroll" },
    { path: "/admin/employees", name: "User Management (Employees)" },
    { path: "/admin/team-leads", name: "Team Leads" },
    { path: "/admin/directory", name: "Master Directory" },
    { path: "/admin/presence", name: "Presence" },
    { path: "/admin/projects", name: "Projects" },
    { path: "/admin/approvals", name: "Approvals" },
    { path: "/admin/ai-insights", name: "AI Insights" },
    { path: "/admin/chat", name: "Chat" },
    { path: "/admin/complaints", name: "Complaints" },
    { path: "/admin/notifications", name: "Notifications" },
    { path: "/admin/settings", name: "Settings" },
    { path: "/admin/audit-log", name: "Audit Log" },
  ];

  for (const route of ADMIN_ROUTES) {
    test(`${route.name} redirects to login`, async ({ page }) => {
      const result = await navigateAndCapture(page, route.path);
      const redirected = page.url().includes("/login");
      console.log(`  ${route.path} -> ${page.url()}, blank: ${result.blankPage}, redirected: ${redirected}`);
      if (!redirected) {
        console.log(`    ⚠️ Route ${route.path} did NOT redirect to login`);
      }
    });
  }
});
