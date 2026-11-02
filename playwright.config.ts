import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "tests",
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
    command:
      "npm run build -w @bike-jumper/web && npm run preview -w @bike-jumper/web -- --host 127.0.0.1 --port 4173",
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
      testMatch: [
        "**/visual/**/*.spec.ts",
        "**/visual/workbench.spec.ts",
        "**/visual/library.spec.ts",
        "**/visual/pose.spec.ts",
        "**/visual/report.spec.ts",
        "**/visual/validation.spec.ts"
      ],
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "offline",
      testMatch: ["**/offline/**/*.spec.ts"],
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "web-server",
      testMatch: [
        "**/e2e/**/*.spec.ts",
        "**/e2e/workbench.spec.ts",
        "**/e2e/library.spec.ts",
        "**/e2e/pose.spec.ts",
        "**/e2e/report.spec.ts",
        "**/e2e/validation.spec.ts"
      ],
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    }
  ]
});
