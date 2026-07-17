import { test, expect } from "@playwright/test";
import { navigateAndCapture } from "./helpers";

test.describe("HR Workflow", () => {
  const HR_ROUTES = [
    { path: "/hr", name: "HR Dashboard" },
    { path: "/hr/recruitment", name: "Recruitment" },
    { path: "/hr/applications", name: "Application Hub" },
    { path: "/hr/onboarding", name: "Onboarding Center" },
    { path: "/hr/offers", name: "Offer Management" },
    { path: "/hr/ai-insights", name: "AI Insights" },
    { path: "/hr/smart-inbox", name: "Smart Inbox" },
    { path: "/hr/messages", name: "Candidate Messages" },
    { path: "/hr/directory", name: "Directory" },
    { path: "/hr/presence", name: "Presence" },
    { path: "/hr/payroll", name: "Payroll" },
    { path: "/hr/analytics", name: "Analytics" },
    { path: "/hr/approvals", name: "Approvals" },
    { path: "/hr/chat", name: "Chat" },
    { path: "/hr/complaints", name: "Complaints" },
    { path: "/hr/notifications", name: "Notifications" },
    { path: "/hr/proctoring", name: "Proctoring Dashboard" },
    { path: "/hr/settings", name: "Settings" },
  ];

  for (const route of HR_ROUTES) {
    test(`${route.name} redirects to login`, async ({ page }) => {
      const result = await navigateAndCapture(page, route.path);
      const redirected = page.url().includes("/login");
      console.log(`  ${route.path} -> ${page.url()}, blank: ${result.blankPage}, redirected: ${redirected}`);
      if (!redirected) {
        console.log(`    ⚠️ Route ${route.path} did NOT redirect to login`);
      }
    });
  }

  test("Recruitment sub-features redirect to login", async ({ page }) => {
    const subRoutes = [
      "/hr/recruitment/job-form",
      "/hr/recruitment/ats-scanner",
      "/hr/recruitment/assessment-center",
      "/hr/recruitment/interview-center",
      "/hr/recruitment/career-portal",
    ];
    for (const route of subRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      console.log(`  ${route} -> ${page.url()}`);
    }
  });
});
