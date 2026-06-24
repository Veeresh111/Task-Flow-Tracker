import { Page, expect } from "@playwright/test";

export interface CaptureResult {
  consoleErrors: string[];
  networkFailures: { url: string; status: number; resourceType: string }[];
  runtimeExceptions: string[];
  blankPage: boolean;
  pageTitle: string;
}

export function setupCapture(page: Page): CaptureResult {
  const result: CaptureResult = {
    consoleErrors: [],
    networkFailures: [],
    runtimeExceptions: [],
    blankPage: false,
    pageTitle: "",
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      result.consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    result.runtimeExceptions.push(err.message);
  });

  page.on("response", (response) => {
    if (response.status() >= 400) {
      result.networkFailures.push({
        url: response.url(),
        status: response.status(),
        resourceType: response.request().resourceType(),
      });
    }
  });

  return result;
}

export async function checkBlankPage(page: Page, result: CaptureResult): Promise<void> {
  const bodyContent = await page.evaluate(() => document.body?.innerText?.trim() || "");
  const htmlContent = await page.evaluate(() => document.documentElement?.innerHTML?.trim() || "");
  const hasContent = bodyContent.length > 0 || htmlContent.includes("root");
  result.blankPage = !hasContent;
}

export async function navigateAndCapture(
  page: Page,
  url: string,
  options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeout?: number }
) {
  const result = setupCapture(page);
  try {
    await page.goto(url, {
      waitUntil: options?.waitUntil || "domcontentloaded",
      timeout: options?.timeout || 15000,
    });
    await page.waitForTimeout(2000);
  } catch (e: any) {
    result.runtimeExceptions.push(`Navigation timeout or error: ${e.message}`);
  }
  await checkBlankPage(page, result);
  result.pageTitle = await page.title();
  return result;
}

export async function expectPageLoads(page: Page, url: string, name: string): Promise<CaptureResult> {
  const result = await navigateAndCapture(page, url);
  const status = result.runtimeExceptions.length === 0 && !result.blankPage ? "✅" : "❌";
  console.log(`  ${status} ${name}: ${url}`);
  if (result.runtimeExceptions.length > 0) {
    console.log(`    Runtime errors: ${result.runtimeExceptions.join("; ")}`);
  }
  if (result.blankPage) {
    console.log(`    ⚠️ Blank page detected`);
  }
  if (result.consoleErrors.length > 0) {
    console.log(`    Console errors: ${result.consoleErrors.slice(0, 3).join("; ")}`);
  }
  return result;
}

export function printResults(results: Map<string, CaptureResult>, label: string): void {
  console.log(`\n=== ${label} ===`);
  let passed = 0;
  let failed = 0;
  for (const [name, result] of results) {
    const ok = result.runtimeExceptions.length === 0 && !result.blankPage;
    if (ok) passed++; else failed++;
    console.log(`  ${ok ? "✅" : "❌"} ${name}`);
    if (!ok) {
      result.runtimeExceptions.forEach(e => console.log(`     Error: ${e}`));
      if (result.blankPage) console.log(`     Blank page`);
    }
  }
  console.log(`  Passed: ${passed}, Failed: ${failed}`);
}
