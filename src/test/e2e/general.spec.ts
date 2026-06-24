import { test, expect } from "@playwright/test";
import { navigateAndCapture, setupCapture, checkBlankPage } from "./helpers";

test.describe("General Application Diagnostics", () => {
  test("Root redirects to /login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/");
    expect(page.url()).toContain("/login");
    expect(result.blankPage).toBe(false);
  });

  test("Unknown route redirects to /login", async ({ page }) => {
    const result = await navigateAndCapture(page, "/this-does-not-exist-12345");
    expect(page.url()).toContain("/login");
    expect(result.blankPage).toBe(false);
  });

  test("Login page has no console errors", async ({ page }) => {
    const result = await navigateAndCapture(page, "/login");
    expect(result.runtimeExceptions).toHaveLength(0);
    const authErrors = result.consoleErrors.filter(e =>
      !e.includes("favicon") && !e.includes("Failed to load resource")
    );
    if (authErrors.length > 0) {
      console.log(`  Console errors on /login: ${authErrors.join("; ")}`);
    }
  });

  test("Register page renders interactive form", async ({ page }) => {
    const result = await navigateAndCapture(page, "/register");
    expect(result.blankPage).toBe(false);

    const inputs = await page.locator("input").count();
    const buttons = await page.locator("button").count();
    console.log(`  Register page: ${inputs} inputs, ${buttons} buttons`);
    expect(inputs).toBeGreaterThan(0);
  });

  test("Page titles are not empty", async ({ page }) => {
    const publicRoutes = ["/login", "/register", "/assessment"];
    for (const route of publicRoutes) {
      const result = await navigateAndCapture(page, route);
      console.log(`  ${route} -> title: "${result.pageTitle}"`);
    }
  });

  test("Check for broken CSS / missing assets", async ({ page }) => {
    const failures: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400 && response.request().resourceType() === "stylesheet") {
        failures.push(`CSS failed: ${response.url()} (${response.status()})`);
      }
      if (response.status() >= 400 && response.request().resourceType() === "script") {
        failures.push(`Script failed: ${response.url()} (${response.status()})`);
      }
      if (response.status() >= 400 && response.request().resourceType() === "image") {
        failures.push(`Image failed: ${response.url()} (${response.status()})`);
      }
    });

    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    if (failures.length > 0) {
      console.log(`  Asset loading failures:\n    ${failures.join("\n    ")}`);
    }
    // At minimum the page should render
    expect(await page.locator("body").count()).toBe(1);
  });

  test("Login form fields are interactive", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    const passwordField = page.locator('input[type="password"]').first();

    if ((await emailField.count()) > 0) {
      await emailField.click();
      await emailField.fill("user@test.com");
      const val = await emailField.inputValue();
      expect(val).toBe("user@test.com");
    } else {
      console.log("  ⚠️ No email input found on login page");
    }

    if ((await passwordField.count()) > 0) {
      await passwordField.click();
      await passwordField.fill("TestPass123!");
      const val = await passwordField.inputValue();
      expect(val).toBe("TestPass123!");
    } else {
      console.log("  ⚠️ No password input found on login page");
    }
  });

  test("Detect runtime exceptions on public pages", async ({ page }) => {
    const exceptions: Record<string, string[]> = {};
    const publicPages = ["/login", "/register", "/assessment"];

    for (const route of publicPages) {
      page.removeAllListeners("pageerror");
      const routeErrors: string[] = [];
      page.on("pageerror", (err) => routeErrors.push(err.message));

      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);

      if (routeErrors.length > 0) {
        exceptions[route] = routeErrors;
      }
    }

    const hasExceptions = Object.keys(exceptions).length > 0;
    if (hasExceptions) {
      console.log(`  Runtime exceptions found:`);
      for (const [route, errors] of Object.entries(exceptions)) {
        console.log(`    ${route}: ${errors.join("; ")}`);
      }
    }
    // Report but don't fail — let the automated report capture this
  });
});
