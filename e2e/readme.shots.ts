// The README screenshots (docs/screenshots/), taken from the real extension on our own fixtures.
// Run with `bun run screenshots`; the normal `bun run test:e2e` does not match this file.
import { expect, fixture, openPopup, shadowOf, tabIdOf, test } from "./fixtures";
import type { Page } from "@playwright/test";

const OUT = "docs/screenshots";

/** The haunt moment has played out: no finite animation (fade-ins, the haunt flash) still runs, bar the 20s marquee. */
async function settled(page: Page) {
  const inShadow = await shadowOf(page);
  await page.waitForTimeout(2600);
  const finite = () =>
    inShadow(function () {
      return this.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity && (a as CSSAnimation).animationName !== "hg-marquee").length;
    });
  await expect.poll(finite, { timeout: 10_000 }).toBe(0);
}

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
  await page.waitForTimeout(2600); // the haunt moment settles
  await page.screenshot({ path: `${OUT}/haunted.png` });

  // Popup: the same page, listing the ghosts.
  await popup.mouse.move(0, 0);
  await popup.screenshot({ path: `${OUT}/popup.png`, fullPage: true, caret: "initial" });

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
