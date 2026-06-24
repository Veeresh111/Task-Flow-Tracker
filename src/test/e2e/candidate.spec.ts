import { test, expect } from "@playwright/test";
import { navigateAndCapture, setupCapture } from "./helpers";

test.describe("Candidate Workflow", () => {
  test("Browse jobs (public careers) loads", async ({ page }) => {
    const result = await navigateAndCapture(page, "/candidate/careers");
    console.log(`  /candidate/careers -> ${page.url()}, blank: ${result.blankPage}`);
  });

  test("Candidate dashboard redirects to login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/candidate");
    expect(page.url()).toContain("/login");
    expect(result.blankPage).toBe(false);
  });

  test("Active assessments redirects to login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/candidate/assessments");
    expect(page.url()).toContain("/login");
  });

  test("Candidate interviews redirects to login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/candidate/interviews");
    expect(page.url()).toContain("/login");
  });

  test("Candidate notifications redirects to login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/candidate/notifications");
    expect(page.url()).toContain("/login");
  });

  test("Public assessment access page loads", async ({ page }) => {
    const result = await navigateAndCapture(page, "/assessment");
    console.log(`  /assessment -> ${page.url()}, blank: ${result.blankPage}`);
  });

  test("Public assessment with token loads", async ({ page }) => {
    const result = await navigateAndCapture(page, "/assessment/test-token-123");
    console.log(`  /assessment/test-token-123 -> ${page.url()}, blank: ${result.blankPage}`);
  });

  test("Apply for job page loads (public)", async ({ page }) => {
    const result = await navigateAndCapture(page, "/apply/test-job-123");
    console.log(`  /apply/test-job-123 -> ${page.url()}, blank: ${result.blankPage}`);
  });

  test("Candidate messages redirects to login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/candidate/messages");
    expect(page.url()).toContain("/login");
  });
});
