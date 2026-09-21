// The end-to-end suite (A-85): its own package, its own browser install, driving
// whatever PLAYWRIGHT_BASE_URL points at — the prototype today (port 5273 per
// .claude/launch.json), apps/web from M1. One directory per flow, one spec per
// register row (docs/qa/e2e-register.md). Specs are QA's (/qa automate); nothing
// here is written by a work order's developer.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /[EMOS]-\d{2}\/.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5273",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
