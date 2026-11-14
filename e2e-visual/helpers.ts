// Shared steps for the visual tests: a fixed clock, a haunt through the popup, and a wait that
// returns only once the costume has stopped changing, so every shot is the same on every run.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, shadowOf, tabIdOf } from "../e2e/fixtures";
import { VISUAL_PORT } from "../playwright.visual.config";

export const FIXED_TIME = new Date("1998-10-31T12:00:00Z");

export const visualUrl = (path: string) => `http://127.0.0.1:${VISUAL_PORT}/${path}`;

export const heightFor = (width: number) => (width >= 1280 ? 800 : width <= 360 ? 600 : 667);

/**
 * Size the page, reduce motion and fix the clock, all before it loads. The page clock is paused
 * at FIXED_TIME: Date stays put and the page's own timers (the ticking cart clock on
 * dark-patterns.html) fire only when a test calls `tickUntil`. The clock is the page's main world
 * only; the costume runs in the content script's isolated world on real timers, so the haunt
 * still finishes on its own.
 */
export async function prepare(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: heightFor(width) });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(FIXED_TIME);
}

/**
 * Advance the paused page clock one second at a time until `done` holds. Each step is its own
 * task with a real pause after it, so the costume sees every tick as a separate change.
 */
export async function tickUntil(page: Page, done: () => Promise<boolean>, maxTicks = 10): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (await done()) return;
    await page.clock.runFor(1000);
    await page.waitForTimeout(200);
  }
  expect(await done()).toBe(true);
}

/** The number a HUD count shows, e.g. hudCount(page, "curses"). */
export async function hudCount(page: Page, kind: "ghosts" | "vampires" | "tombstones" | "curses"): Promise<number> {
  const inShadow = await shadowOf(page);
  return inShadow(function (k: string) {
    return Number(this.querySelector(`#hud .count.${k} .n`)?.textContent ?? -1);
  }, kind);
}

/** popup.html as a tab aimed at `page`'s tab, prepared like a fixture page (clock, motion, size). */
export async function openPreparedPopup(context: BrowserContext, sw: Worker, extensionId: string, page: Page, width = 360): Promise<Page> {
  const tabId = await tabIdOf(sw, page);
  const popup = await context.newPage();
  await prepare(popup, width);
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await expect(popup.locator("#app[data-screen]")).toBeAttached();
  return popup;
}

/** Haunt `page` with the popup's own button; returns the popup, left on its haunted screen. */
export async function hauntThroughPopup(context: BrowserContext, sw: Worker, extensionId: string, page: Page, width = 360): Promise<Page> {
  const popup = await openPreparedPopup(context, sw, extensionId, page, width);
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  return popup;
}

/** Poll `read` until it returns a value (null means "not ready") that has not changed for a full second. */
async function waitUntilStill(read: () => Promise<string | null>): Promise<void> {
  let last: string | null = null;
  let since = 0;
  await expect
    .poll(
      async () => {
        const now = await read();
        if (now === null || now !== last) {
          last = now;
          since = Date.now();
          return false;
        }
        return Date.now() - since >= 1000;
      },
      { timeout: 20_000, intervals: [100, 250] },
    )
    .toBe(true);
}

/**
 * Wait until the haunt is done: the <hg-crypt> host and the HUD are there, no finite animation is
 * still running in the shadow tree, and the HUD counts and the costume's nodes have been still for
 * a second (ghosts, tombstones and curses arrive as the page reports them).
 */
export async function waitForHaunted(page: Page): Promise<void> {
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  const inShadow = await shadowOf(page);
  await waitUntilStill(() =>
    inShadow(function () {
      const hud = this.querySelector("#hud") as HTMLElement | null;
      if (!hud || hud.getBoundingClientRect().height === 0) return null;
      const finite = this.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity);
      if (finite.length > 0) return null;
      return `${hud.innerText.replace(/\s+/g, " ")}|${this.querySelectorAll("*").length}`;
    }),
  );
}

/** The popup's haunted screen has stopped changing (its lists fill in as the page reports). */
export async function waitForPopupSettled(popup: Page): Promise<void> {
  await waitUntilStill(() => popup.locator("#app").innerText());
}
