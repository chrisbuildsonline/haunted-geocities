import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { resolve } from "node:path";
import { FIXTURE_PORT } from "../playwright.config";

// The e2e build (vite build --mode e2e → dist-e2e/) is the shipping extension plus
// host_permissions for http://127.0.0.1/* and http://localhost/*. Reason: activeTab is only
// granted by a real toolbar click (or the extension's keyboard shortcut), which Playwright
// cannot perform, so a popup opened as a tab could not inject into the fixture page.
// The shipping dist/ manifest has no host_permissions (test/manifest.test.ts).
const EXTENSION = resolve(import.meta.dirname, "..", "dist-e2e");

export const fixture = (path: string) => `http://127.0.0.1:${FIXTURE_PORT}/${path}`;

/**
 * Real tracker domains from src/data/trackers.json, three different companies. Chromium resolves
 * them to the local fixture server, so fixtures/trackers.html can load "third-party" resources
 * from them and the shipped tracker data matches them with no test-only patch.
 */
export const TRACKER_HOSTS = { Criteo: "criteo.com", Hotjar: "hotjar.com", Taboola: "taboola.com" } as const;
export const trackerUrl = (host: string, n: number | string) => `http://${host}:${FIXTURE_PORT}/t/p.svg?n=${n}`;
const HOST_RULES = Object.values(TRACKER_HOSTS).map((h) => `MAP ${h} 127.0.0.1`).join(",");

type Fixtures = { context: BrowserContext; sw: Worker; extensionId: string; consoleErrors: string[] };

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium", // bundled Chromium in new headless mode: runs extensions without a display
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, `--host-resolver-rules=${HOST_RULES}`],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  // Every test fails if the popup, a fixture page or the worker logs an error.
  consoleErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      context.on("console", (m) => {
        // Chromium logs this for every request an Exorcise rule refuses, which exorcise.spec.ts does on purpose.
        if (m.text() === "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT") return;
        if (m.type() === "error") errors.push(`${m.location().url}: ${m.text()}`);
      });
      context.on("weberror", (e) => errors.push(String(e.error())));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The chrome tab id of an open page, looked up from the service worker. */
export async function tabIdOf(sw: Worker, page: Page): Promise<number> {
  const url = page.url();
  const id = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  if (id === undefined) throw new Error(`no tab for ${url}`);
  return id;
}

/** popup.html opened as a 360px-wide tab, targeting `tabId` through ?tab=. */
export async function openPopup(context: BrowserContext, extensionId: string, tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await expect(popup.locator("#app[data-screen]")).toBeAttached();
  return popup;
}
