// The README screenshots (docs/screenshots/), taken from the real extension on our own fixtures.
// Run with `bun run screenshots`; the normal `bun run test:e2e` does not match this file.
import { expect, fixture, haunt, openPopup, shadowOf, tabIdOf, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";

const OUT = "docs/screenshots";

/** The haunt moment has played out: no finite animation (fade-ins, the haunt flash) still runs, bar the 20s marquee. */
async function settled(page: Page) {
  const inShadow = await shadowOf(page);
  await page.waitForTimeout(3100);
  const finite = () =>
    inShadow(function () {
      return this.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity && (a as CSSAnimation).animationName !== "hg-marquee").length;
    });
  await expect.poll(finite, { timeout: 10_000 }).toBe(0);
}

test("the haunt moment on the news fixture, as a GIF", async ({ context, sw }) => {
  test.setTimeout(120_000);
  const FPS = 6;
  const SLOW = 0.2; // the page's animation clock runs at a fifth of real time, so every frame is caught on time
  const frames = "test-results/haunt-gif";
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("news.html"));
  await page.waitForLoadState("load");
  await page.mouse.move(0, 0);
  let n = 0;
  const frame = () => page.screenshot({ path: `${frames}/f${String(n++).padStart(3, "0")}.png`, caret: "initial" });
  // Half a second of the modern page first.
  await frame();
  for (let i = 1; i < FPS / 2; i++) copyFileSync(`${frames}/f000.png`, `${frames}/f${String(n++).padStart(3, "0")}.png`);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: SLOW });
  const start = Date.now();
  await haunt(sw, page);
  // The 3000ms moment plus a beat, one frame every 1/6s of page time.
  for (let k = 1; k <= 3.3 * FPS; k++) {
    await page.waitForTimeout(Math.max(0, start + (k * 1000) / FPS / SLOW - Date.now()));
    await frame();
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  // Hold the haunted page for a second and a half before the loop starts again.
  const last = `${frames}/f${String(n - 1).padStart(3, "0")}.png`;
  for (let i = 0; i < FPS * 1.5; i++) copyFileSync(last, `${frames}/f${String(n++).padStart(3, "0")}.png`);
  const gif = `${OUT}/haunt.gif`;
  const vf = "scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${frames}/f%03d.png`, "-vf", vf, "-loop", "0", gif]);
  expect(statSync(gif).size).toBeLessThan(2 * 1024 * 1024);
});

test("haunted page with ghosts, the stone card and the popup", async ({ context, sw, extensionId }) => {
  // Ghosts: fixtures/trackers.html, the costume at 1280.
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("trackers.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await expect(popup.locator(".ghost-row")).not.toHaveCount(0);
  await page.bringToFront();
  await page.waitForTimeout(3100); // the haunt moment settles
  await page.screenshot({ path: `${OUT}/haunted.png` });

  // Popup: the same page, listing the ghosts. Just the 360px Win95 window, not the tab around it.
  await popup.mouse.move(0, 0);
  await popup.locator("#app").screenshot({ path: `${OUT}/popup.png`, caret: "initial" });

  // Tombstone: fixtures/links.html, the stone card of the dead link with the long path.
  const links = await context.newPage();
  await links.setViewportSize({ width: 1280, height: 800 });
  await links.goto(fixture("links.html"));
  const linksPopup = await openPopup(context, extensionId, await tabIdOf(sw, links));
  await linksPopup.getByRole("button", { name: "Haunt this page" }).click();
  await links.bringToFront();
  const inShadow = await shadowOf(links);
  const marker = '.tomb-marker[data-url$="the-very-long-haunted-filename-that-must-not-break.html"]';
  await expect.poll(() => inShadow(function (sel: string) { return getComputedStyle(this.querySelector("#markers")!).opacity === "1" && !!this.querySelector(sel); }, marker), { timeout: 8000 }).toBe(true);
  const at = await inShadow(function (sel: string) {
    const r = this.querySelector(sel)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, marker);
  await links.mouse.click(at.x, at.y);
  await expect.poll(() => inShadow(function () { return getComputedStyle(this.querySelector("#cards .tombstone-card")!).opacity; })).toBe("1");
  await links.mouse.move(0, 0);
  await links.screenshot({ path: `${OUT}/tombstone.png`, caret: "initial" });
});

test("curse badges and an open curse card on the coffee shop", async ({ context, sw, extensionId }) => {
  test.setTimeout(60_000);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("dark-patterns.html"));
  // The product block sits just under the bar and the marquee, so all six badges fit above the HUD.
  await page.evaluate(() => window.scrollTo(0, document.querySelector("h2")!.getBoundingClientRect().top + window.scrollY - 64));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await page.bringToFront();
  const inShadow = await shadowOf(page);
  const shown = () => inShadow(function () { return [...this.querySelectorAll<HTMLElement>("#markers .curse-badge")].filter((b) => getComputedStyle(b).display !== "none").length; });
  await expect.poll(shown, { timeout: 10_000 }).toBe(6);
  await settled(page);
  const at = await inShadow(function () {
    const r = this.querySelector('#markers .curse-badge[data-kind="confirmshaming"]')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => inShadow(function () { return getComputedStyle(this.querySelector("#cards .card")!).opacity; })).toBe("1");
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/curses.png`, caret: "initial" });
});

test("the neighborhood bar with its address", async ({ context, sw, extensionId }) => {
  test.setTimeout(60_000);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await page.bringToFront();
  await settled(page);
  await page.mouse.move(0, 400);
  // The top-left 800px of the 1280 page: the bar's address and tagline, shown at full size in the README.
  await page.screenshot({ path: `${OUT}/neighborhood.png`, clip: { x: 0, y: 0, width: 800, height: 162 }, caret: "initial" });
});
