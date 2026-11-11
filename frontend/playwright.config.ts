import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running website and API (see README: "Testing").
 * BASE_URL defaults to the local production server. Set PW_CHROMIUM_PATH to use an
 * already-installed Chromium instead of `pnpm exec playwright install chromium`.
 */
const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, testMatch: /responsive\.spec\.ts/ },
  ],
});
