// Real-site presentation on a photo-heavy, full-width page (fixtures/hero.html, shaped like a big public
// site): the graveyard tells same-prefix companies apart, the strip and the HUD never hide the page's end
// or a focused link, and the dark hero blocks and the search box wear the costume too.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, fixture, GOOGLE_HOSTS, haunt, scrollToEnd, shadowOf, test, type InShadow } from "./fixtures";

const SHOTS = "test-results/photo-page";
const COMPANIES = Object.keys(GOOGLE_HOSTS);

async function hauntHero(context: BrowserContext, sw: Worker, width: number) {
  // google-analytics.com is on Chromium's HSTS preload list, so its http:// pixel is upgraded to https://
  // before the host-resolver rule can send it to the plain-HTTP fixture server: answer it here instead.
  // It is still a real request from the page, so it lands in Resource Timing like any other.
  await context.route(/^https?:\/\/google-analytics\.com:4321\//, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }),
  );
  const page = await context.newPage();
  await page.setViewportSize({ width, height: width < 400 ? 740 : 800 });
  await page.goto(fixture("hero.html"));
  // Heights of the fixed-size boxes (the full-overlay inline padding narrows the full-width ones by design).
  const sizes = () =>
    page.evaluate(() => ["hero", "panel", "pill", "site-search"].map((id) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return [id, id === "hero" ? 0 : Math.round(r.width), Math.round(r.height)];
    }));
  const before = await sizes();
  const tabId = await haunt(sw, page);
  await page.waitForTimeout(3700); // the haunt moment and its caption settle
  return { page, tabId, before, sizes, inShadow: await shadowOf(page) };
}

/** Where the bottom overlay starts: the graveyard strip's top (or the HUD's, with no strip). */
const overlayTop = (inShadow: InShadow) =>
  inShadow(function () {
    const g = this.getElementById("graveyard")!;
    return (g.hidden ? this.getElementById("hud")! : g).getBoundingClientRect().top;
  });

const rectOf = (page: Page, id: string) => page.evaluate((i) => document.getElementById(i)!.getBoundingClientRect().toJSON() as DOMRect, id);

for (const width of [1280, 375]) {
  test(`${width}px: graveyard tags tell Google Analytics and Google Ads apart, whole, on at most two lines`, async ({ context, sw }) => {
    const { page, inShadow } = await hauntHero(context, sw, width);
    const tags = await inShadow(function (companies: string[]) {
      const row = this.querySelector("#graveyard .stones")!.getBoundingClientRect();
      return companies.map((c) => {
        const t = this.querySelector<HTMLElement>(`#graveyard button[data-company="${c}"] .tag`)!;
        const r = t.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(t).lineHeight);
        return {
          text: t.textContent,
          label: t.closest("button")!.getAttribute("aria-label")!.split(",")[0],
          lines: Math.round((t.clientHeight - parseFloat(getComputedStyle(t).paddingTop) - parseFloat(getComputedStyle(t).paddingBottom)) / lh),
          cut: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1,
          inRow: r.top >= row.top - 1 && r.bottom <= row.bottom + 1,
          left: r.left,
          right: r.right,
        };
      });
    }, COMPANIES);
    expect(tags.map((t) => t.text)).toEqual(["Google Analytics", "Google Ads"]);
    expect(tags.map((t) => t.label)).toEqual(COMPANIES); // the full name stays in the accessible name and the card
    for (const t of tags) expect({ text: t.text, lines: t.lines <= 2, cut: t.cut, inRow: t.inRow }).toEqual({ text: t.text, lines: true, cut: false, inRow: true });
    expect(tags[0]!.lines).toBe(2); // "Google / Analytics"
    expect(tags[0]!.right + 12).toBeLessThanOrEqual(tags[1]!.left + 1); // the 12px gap between neighbours holds
    await page.screenshot({ path: `${SHOTS}/tags-${width}.png` });
  });

  test(`${width}px: the strip and the HUD never hide the page's end or a focused link`, async ({ context, sw }) => {
    const { page, inShadow } = await hauntHero(context, sw, width);
    // scrolled to the end, the footer's last line, the main column's last line and the "Featured stories"
    // heading sit above the bottom overlay; the footer grows once it is seen, and the end is still the end
    expect((await rectOf(page, "promo")).height).toBe(60);
    await scrollToEnd(page);
    expect((await rectOf(page, "promo")).height).toBe(112);
    const end = await page.evaluate(() => ({ y: Math.ceil(window.scrollY), max: document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight }));
    expect(end.y).toBeGreaterThanOrEqual(end.max - 1);
    const top = await overlayTop(inShadow);
    for (const id of ["foot-last", "last", "featured"]) expect({ id, bottom: (await rectOf(page, id)).bottom <= top }).toEqual({ id, bottom: true });
    await page.screenshot({ path: `${SHOTS}/end-${width}.png` });
    // a link under the strip that takes keyboard focus is scrolled clear of it
    await page.evaluate(() => {
      const story = document.getElementById("story")!;
      window.scrollBy(0, story.getBoundingClientRect().top - (window.innerHeight - 40));
      document.getElementById("find-link")!.focus({ preventScroll: true });
    });
    expect((await rectOf(page, "story")).top).toBeGreaterThan(await overlayTop(inShadow)); // under the overlay before Tab
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("story");
    expect((await rectOf(page, "story")).bottom).toBeLessThanOrEqual(await overlayTop(inShadow));
  });
}

test("1280px: the dark hero blocks and the search box wear the costume; nothing moves, un-haunt gives them back", async ({ context, sw }) => {
  const { page, tabId, before, sizes } = await hauntHero(context, sw, 1280);
  const look = () =>
    page.evaluate(() => {
      const cs = (id: string, pseudo?: string) => getComputedStyle(document.getElementById(id)!, pseudo);
      const pick = (id: string) => ({ radius: cs(id).borderRadius, bg: cs(id).backgroundColor, image: cs(id).backgroundImage.slice(0, 22), shadow: cs(id).boxShadow });
      return {
        hero: pick("hero"),
        panel: pick("panel"),
        find: pick("find"),
        pill: { ...pick("pill"), color: cs("pill").color },
        input: { color: cs("site-search").color, placeholder: cs("site-search", "::placeholder").color },
        links: Object.fromEntries(["hero-link", "find-link", "cta", "story"].map((id) => [id, cs(id).color])),
      };
    });
  const l = await look();
  // the photo hero keeps its picture, goes square and takes the HUD's bevel, 1px line and hard shadow
  expect(l.hero.radius).toBe("0px");
  expect(l.hero.image).toBe('url("data:image/svg+xm');
  for (const c of ["rgb(0, 0, 0) 0px 0px 0px 1px inset", "rgb(153, 153, 204) 3px 3px 0px 0px inset", "rgb(51, 51, 102) -3px -3px 0px 0px inset", "rgb(0, 0, 0) 4px 4px 0px 0px"]) {
    expect({ c, ok: l.hero.shadow.includes(c) }).toEqual({ c, ok: true });
  }
  // the translucent rounded panel and the black band become crypt windows
  expect([l.panel.radius, l.panel.bg]).toEqual(["0px", "rgb(0, 0, 51)"]);
  expect(l.panel.shadow).toContain("rgb(153, 153, 204) 3px 3px 0px 0px inset");
  expect(l.find.bg).toBe("rgb(0, 0, 51)");
  // their text links take the dark-page colour; the button link and the light page's links keep the light one
  expect(l.links).toEqual({ "hero-link": "rgb(102, 204, 255)", "find-link": "rgb(102, 204, 255)", cta: "rgb(0, 0, 255)", story: "rgb(0, 0, 255)" });
  // the dark pill search box is a sunken white 1998 field with black text and a #666666 placeholder
  expect(l.pill).toMatchObject({ radius: "0px", bg: "rgb(255, 255, 255)", image: "none", color: "rgb(0, 0, 0)" });
  expect(l.pill.shadow).toContain("rgb(0, 0, 0) 2px 2px 0px 0px inset");
  expect(l.input).toEqual({ color: "rgb(0, 0, 0)", placeholder: "rgb(102, 102, 102)" });
  // paint only: no block changes size
  expect(await sizes()).toEqual(before);
  await page.screenshot({ path: `${SHOTS}/blocks-1280.png` });

  await sw.evaluate(async (id) => chrome.tabs.sendMessage(id, { type: "unhaunt" }), tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  const back = await look();
  expect([back.panel.radius, back.panel.bg, back.pill.radius, back.pill.bg, back.links["hero-link"]]).toEqual(["12px", "rgba(0, 0, 0, 0.6)", "20px", "rgb(51, 51, 51)", "rgb(0, 0, 238)"]);
});
