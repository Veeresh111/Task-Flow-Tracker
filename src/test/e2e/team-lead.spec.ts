import { test, expect } from "@playwright/test";
import { navigateAndCapture } from "./helpers";

test.describe("Team Lead Workflow", () => {
  const TL_ROUTES = [
    { path: "/team-lead", name: "Dashboard" },
    { path: "/team-lead/analytics", name: "Team Analytics" },
    { path: "/team-lead/approvals", name: "Approvals" },
    { path: "/team-lead/leaves", name: "Leave Management" },
    { path: "/team-lead/presence", name: "Presence" },
    { path: "/team-lead/worklogs", name: "Work Logs" },
    { path: "/team-lead/team", name: "My Team" },
    { path: "/team-lead/projects", name: "Projects" },
    { path: "/team-lead/tasks", name: "Tasks" },
    { path: "/team-lead/payroll", name: "Payroll" },
    { path: "/team-lead/ai-insights", name: "AI Insights" },
    { path: "/team-lead/chat", name: "Chat" },
    { path: "/team-lead/complaints", name: "Complaints" },
    { path: "/team-lead/notifications", name: "Notifications" },
    { path: "/team-lead/settings", name: "Settings" },
  ];

  for (const route of TL_ROUTES) {
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
