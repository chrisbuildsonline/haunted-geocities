import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// `bun run screenshots`: only e2e/*.shots.ts, which the normal config's testMatch never picks up.
export default defineConfig({ ...base, testMatch: /.*\.shots\.ts/ });
