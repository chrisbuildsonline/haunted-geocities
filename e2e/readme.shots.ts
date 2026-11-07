// The README screenshots (docs/screenshots/), taken from the real extension on our own fixtures.
// Run with `bun run screenshots`; the normal `bun run test:e2e` does not match this file.
import { expect, fixture, openPopup, shadowOf, tabIdOf, test } from "./fixtures";

const OUT = "docs/screenshots";

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
