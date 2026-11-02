import { defineConfig, devices } from "@playwright/test";

// Distinct from the dev server (5173) and the manual preview (4173) so a running instance without
// test hooks is never reused by the suite.
const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;
const preview = `npm run preview -w @bike-jumper/web -- --host 127.0.0.1 --port ${port} --strictPort`;

export default defineConfig({
  testDir: "tests",
  testMatch: ["**/e2e/**/*.spec.ts", "**/visual/**/*.spec.ts", "**/offline/**/*.spec.ts"],
  fullyParallel: true,
  workers: 1,
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    // scripts/verify.mjs builds once with test hooks and sets PLAYWRIGHT_PREBUILT to skip rebuilding.
    command: process.env.PLAYWRIGHT_PREBUILT
      ? preview
      : `npm run build -w @bike-jumper/web && ${preview}`,
    env: { VITE_TEST_HOOKS: "1" },
    url: baseURL,
    timeout: 120000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: "engine-chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "engine-firefox",
      retries: 2,
      use: { ...devices["Desktop Firefox"], browserName: "firefox" }
    },
    {
      name: "engine-webkit",
      use: { ...devices["Desktop Safari"], browserName: "webkit" }
    },
    {
      name: "branded-browser-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    },
    {
      name: "branded-browser-edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" }
    },
    {
      name: "tablet",
      use: { ...devices["iPad Pro 11"], browserName: "webkit" }
    },
    {
      name: "visual",
      testMatch: ["**/visual/**/*.spec.ts"],
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "offline",
      testMatch: ["**/offline/**/*.spec.ts"],
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "web-server",
      testMatch: ["**/e2e/**/*.spec.ts"],
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    }
  ]
});
