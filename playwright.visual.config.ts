import { defineConfig } from "@playwright/test";
import { FIXTURE_PORT } from "./playwright.config";

// `bun run test:visual`: screenshot comparisons of the costume and the popup (e2e-visual/).
// Kept apart from playwright.config.ts (testDir "e2e") so test:e2e never runs them.
export const VISUAL_PORT = 4322;

const server = (port: number) => ({
  // `exec`: see playwright.config.ts.
  command: `exec bun scripts/fixture-server.ts ${port}`,
  url: `http://127.0.0.1:${port}/index.html`,
  reuseExistingServer: !process.env.CI,
  stdout: "ignore" as const,
});

export default defineConfig({
  testDir: "e2e-visual",
  outputDir: "test-results",
  // One baseline set for every OS: no {platform} in the path. Baselines come from the Playwright Docker image.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  // A missing baseline fails and is not written; only `bun run test:visual:update` (--update-snapshots=all) writes them,
  // every one of them, so a change under the tolerance below (a HUD label, one digit) still lands in the baseline.
  updateSnapshots: "none",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.002,
      // Per-pixel YIQ distance. At 0.1 a one-step web-safe change in the blue channel alone
      // (#330066 → #330099 on the neighborhood bar) passed unnoticed; 0.05 catches it.
      threshold: 0.05,
    },
  },
  reporter: [["list"]],
  webServer: [
    server(VISUAL_PORT),
    // fixtures/trackers.html loads its tracker pixels from http://<tracker host>:4321/, so that port is served too.
    server(FIXTURE_PORT),
  ],
});
