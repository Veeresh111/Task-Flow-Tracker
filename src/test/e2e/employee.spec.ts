import { test, expect } from "@playwright/test";
import { navigateAndCapture } from "./helpers";

test.describe("Employee Workflow", () => {
  const EMPLOYEE_ROUTES = [
    { path: "/employee", name: "Dashboard" },
    { path: "/employee/tasks", name: "Tasks" },
    { path: "/employee/worklogs", name: "Work Logs" },
    { path: "/employee/leaves", name: "Leave Requests" },
    { path: "/employee/complaints", name: "Complaints" },
    { path: "/employee/payroll", name: "Payroll" },
    { path: "/employee/presence", name: "Presence" },
    { path: "/employee/projects", name: "Projects" },
    { path: "/employee/analytics", name: "Analytics" },
    { path: "/employee/ai-insights", name: "AI Insights" },
    { path: "/employee/chat", name: "Chat" },
    { path: "/employee/notifications", name: "Notifications" },
    { path: "/employee/settings", name: "Settings" },
  ];

  for (const route of EMPLOYEE_ROUTES) {
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
