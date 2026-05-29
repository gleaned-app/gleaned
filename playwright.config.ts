import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // Tests run serially (workers: 1) because all browser contexts share the same
  // server-side SQLite database — parallel execution would cause race conditions
  // on auth state and data created by other tests.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Block SW registration so it can't interfere with authenticated requests
    // via clients.claim() or alter fetch behaviour during E2E runs.
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "NEXT_TELEMETRY_DISABLED=1 SETUP_TOKEN=playwright-test-token pnpm dev",
    port: 3000,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
