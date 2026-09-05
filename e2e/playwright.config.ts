import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: ".e2e-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4327",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
