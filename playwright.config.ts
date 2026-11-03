import { defineConfig } from "@playwright/test";

export const FIXTURE_PORT = 4321;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  // Each test launches its own persistent Chromium with the extension; keep them serial.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  webServer: {
    // `exec` makes Playwright go through a shell; spawning the bare command directly stalled
    // for ~2.5 minutes before the server started on this WSL host.
    command: `exec bun scripts/fixture-server.ts ${FIXTURE_PORT}`,
    url: `http://127.0.0.1:${FIXTURE_PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
  },
});
