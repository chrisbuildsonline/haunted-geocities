import { defineConfig } from "@playwright/test";

// `bun run docs:realsite`: the haunt on a real public page over the real network (scripts/real-site.pw.ts).
// A docs tool, not a check: it is in no CI or Docker stage, because live pages change and networks fail.
// No fixture server and no host-resolver rules: every tracker in the shot came from the live page.
export default defineConfig({
  testDir: "scripts",
  testMatch: /real-site\.pw\.ts$/,
  outputDir: "test-results",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
});
