// The findings on the first screen (design/DESIGN.md "Findings strip"): the crypt footer with the HUD's
// counts is at the page's end, so one fixed line beside the bottom-right ghost icon says what was
// found, at 375 and 1280, until the HUD itself is on screen. Un-haunt still leaves the page byte-identical.
import { expect, fixture, haunt, scrollToEnd, shadowOf, test, type InShadow } from "./fixtures";

/** The strip, the ghost icon and the HUD, as the user sees them. */
const look = (inShadow: InShadow) =>
  inShadow(function () {
    const s = this.getElementById("findings")!;
    const r = s.getBoundingClientRect();
    const tab = this.getElementById("show-tab")!.getBoundingClientRect();
    const hud = this.getElementById("hud")!.getBoundingClientRect();
    const cs = getComputedStyle(s);
    return {
      text: s.textContent,
      shown: !s.hidden && r.width > 0 && cs.visibility !== "hidden" && Number(cs.opacity) === 1,
      inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      oneLine: r.height === 24 && s.scrollWidth <= s.clientWidth,
      besideIcon: Math.round(tab.left - r.right) === 4 && Math.round((r.top + r.bottom) / 2) === Math.round((tab.top + tab.bottom) / 2),
      font: parseFloat(cs.fontSize),
      hudBelowFold: hud.top >= innerHeight,
      hudInView: hud.top >= 0 && hud.bottom <= innerHeight,
    };
  });

for (const [width, height] of [[375, 740], [1280, 800]] as const) {
  test(`${width}: the first screen says what was found, beside the ghost icon, until the footer's HUD is in view`, async ({ context, sw }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(fixture("news.html"));
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    const tabId = await haunt(sw, page);
    await page.waitForTimeout(3700); // the haunt moment settles
    const inShadow = await shadowOf(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // e2e/fixtures.ts pins the browser to 15:xx at launch (16 if the hour turned since): never the witching hour in a still
    expect([15, 16]).toContain(await page.evaluate(() => new Date().getHours()));
    // news.html: six companies, Hotjar and Taboola among them known vampires
    expect(await look(inShadow)).toMatchObject({ text: "Trackers 6 / Vampires 2", shown: true, inView: true, oneLine: true, besideIcon: true, hudBelowFold: true });
    expect((await look(inShadow)).font).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/findings/first-screen-${width}.png` });

    // At the footer the HUD's own counts take over, and the strip never covers them.
    await scrollToEnd(page);
    await expect.poll(() => look(inShadow)).toMatchObject({ shown: false, hudInView: true });
    await page.screenshot({ path: `test-results/findings/end-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => look(inShadow)).toMatchObject({ shown: true, inView: true });

    await sw.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { type: "unhaunt" });
    }, tabId);
    await expect(page.locator("hg-crypt")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  });
}
