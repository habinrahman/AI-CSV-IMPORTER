import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end browser tests against the REAL stack: Playwright boots the
 * built backend (:4000) and frontend (:3000) itself, then drives a browser
 * through the product.
 *
 *   npm run build && npm run test:e2e --workspace frontend
 *
 * Locally the system Edge is used (channel: "msedge" — no browser download);
 * CI installs Playwright's chromium instead. The full happy-path spec
 * auto-skips unless OPENAI_API_KEY is set — the no-key journey (upload →
 * preview → 503 error path) always runs.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false, // journeys share one backend's job/file state
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // System Edge locally (zero-download); CI installs Playwright's
        // chromium and must NOT inherit a channel.
        ...(process.env["CI"] ? {} : { channel: "msedge" }),
      },
    },
  ],
  webServer: [
    {
      command: "npm run start --workspace backend",
      cwd: "..",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
      env: {
        NODE_ENV: "production",
        PORT: "4000",
        CORS_ORIGIN: "http://localhost:3000",
        LOG_LEVEL: "warn",
        ...(process.env["OPENAI_API_KEY"] ? { OPENAI_API_KEY: process.env["OPENAI_API_KEY"] } : {}),
      },
    },
    {
      command: "npm run start --workspace frontend",
      cwd: "..",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
  ],
});
