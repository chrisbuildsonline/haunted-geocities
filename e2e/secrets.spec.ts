// The secrets (design/DESIGN.md "Secrets (easter eggs)") in a real browser: only on a haunted page,
// gone with Un-haunt. Unit tests (test/costume/secrets.test.ts) cover the rules and reduced motion.
import { expect, fixture, haunt, shadowOf, test } from "./fixtures";

test("13 clicks on the hit counter bring the dancing skeleton; typing boo sends the ghosts away and back", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(fixture("trackers.html"));
  await haunt(sw, page);
  await page.waitForTimeout(3700); // the haunt moment settles
  const inShadow = await shadowOf(page);
  // the hit counter, in the footer at the end of the page
  const at = await inShadow(function () {
    const hits = this.querySelector<HTMLElement>("#hud .hits")!;
    hits.scrollIntoView({ block: "center" });
    const r = hits.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  for (let i = 0; i < 13; i++) await page.mouse.click(at.x, at.y);
  expect(await inShadow(function () { return !!this.querySelector("#hud .skeleton"); })).toBe(true);
  await page.screenshot({ path: "test-results/secrets/skeleton-375.png" });

  await page.keyboard.type("boo");
  expect(await inShadow(function () { return this.getElementById("crypt-footer")!.classList.contains("fled"); })).toBe(true);
  await expect.poll(() => inShadow(function () { return this.getElementById("crypt-footer")!.classList.contains("fled"); }), { timeout: 4000 }).toBe(false);
});

test("an un-haunted page has no secrets: boo does nothing and leaves no trace", async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture("trackers.html"));
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  await page.keyboard.type("boo");
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
});
