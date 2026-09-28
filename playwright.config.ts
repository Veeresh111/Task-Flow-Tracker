import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Cold-start budget: each fresh run spawns a new `vite` server on :8080 and
  // the first tests pay full on-demand transform of the app graph. Assertions
  // unchanged — only the wall-clock allowance grows.
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { open: "on-failure" }]
  ],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Real installed Chrome (Playwright-managed chromium_headless_shell is
        // not downloaded on this machine). Headless shell also does not
        // support the fake camera pipeline reliably; headed Chrome does.
        channel: "chrome",
        launchOptions: {
          args: [
            // Auto-grant permission UI + synthetic camera device so REAL
            // frames flow through the exam page's YuNet+SFace inference.
            // NOTE: --use-fake-device-for-media-stream is REQUIRED even when
            // a file is supplied — the file flag only replaces the fake
            // device's SOURCE (verified: without it Chrome silently shows
            // the builtin pattern and MediaPipe sees zero faces).
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            ...(process.env.E2E_FACE_MEDIA
              ? [`--use-file-for-fake-video-capture=${process.env.E2E_FACE_MEDIA}`]
              : []),
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
