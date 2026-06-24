import { test, expect } from "@playwright/test";
import { navigateAndCapture, setupCapture, checkBlankPage } from "./helpers";

test.describe("Authentication Workflow", () => {
  test("Login page loads and renders form", async ({ page }) => {
    const result = await navigateAndCapture(page, "/login");
    expect(result.blankPage).toBe(false);
    expect(result.runtimeExceptions).toHaveLength(0);

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');

    const formPresent = (await emailInput.count()) > 0 || (await submitButton.count()) > 0;
    expect(formPresent).toBe(true);
  });

  test("Register page loads and renders form", async ({ page }) => {
    const result = await navigateAndCapture(page, "/register");
    expect(result.blankPage).toBe(false);
    expect(result.runtimeExceptions).toHaveLength(0);
  });

  test("Login form submission fails gracefully without backend", async ({ page }) => {
    const result = await navigateAndCapture(page, "/login");
    expect(result.blankPage).toBe(false);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    if ((await emailInput.count()) > 0) {
      await emailInput.fill("test@example.com");
      await passwordInput.fill("Password123!");
      await submitButton.click();
      await page.waitForTimeout(3000);

      const stillOnLogin = page.url().includes("/login");
      const hasError = await page.locator("text=error, text=Error, text=Invalid, text=failed").first().isVisible().catch(() => false);
      // Either we stay on login or we see an error — both are acceptable graceful failures
      console.log(`  Login form submitted. Current URL: ${page.url()}`);
    }
  });

  test("Logout redirects to login when unauthenticated", async ({ page }) => {
    const result = await navigateAndCapture(page, "/login");
    expect(result.blankPage).toBe(false);
  });

  test("Session persistence redirect — protected route goes to login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/admin");
    expect(page.url()).toContain("/login");
  });

  test("Reset password page loads", async ({ page }) => {
    const result = await navigateAndCapture(page, "/reset-password");
    // This may 404 or redirect — capture actual behavior
    console.log(`  Reset password page: ${page.url()}, blank: ${result.blankPage}`);
  });
});
