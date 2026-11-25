// Real-site presentation on a photo-heavy, full-width page (fixtures/hero.html, shaped like a big public
// site): the graveyard tells same-prefix companies apart and reads a long name whole, the strip and the HUD
// never hide the page's end or a focused link, the dark hero blocks, the search box and the search launcher
// wear the costume too, and links on a dark gradient band read light.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { contrastRatio, parseColour, relativeLuminance } from "../src/content/costume/page-theme";
import { expect, fixture, GOOGLE_HOSTS, GSA_HOST, haunt, scrollToEnd, shadowOf, test, type InShadow } from "./fixtures";

const SHOTS = "test-results/photo-page";
const COMPANIES = Object.keys(GOOGLE_HOSTS);
const GSA = Object.keys(GSA_HOST)[0]!;

async function hauntHero(context: BrowserContext, sw: Worker, width: number) {
  // google-analytics.com (and many .gov names) are on Chromium's HSTS preload list, so an http:// pixel is
  // upgraded to https:// before the host-resolver rule can send it to the plain-HTTP fixture server: answer
  // it here instead. It is still a real request from the page, so it lands in Resource Timing like any other.
  await context.route(/^https?:\/\/(google-analytics\.com|digitalgov\.gov):4321\//, (route) =>
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

  test(`${width}px: the long U.S. General Services Administration tag reads whole on three lines, no word broken, clear of its neighbours`, async ({ context, sw }) => {
    const { page, inShadow } = await hauntHero(context, sw, width);
    const tag = await inShadow(function (company: string) {
      const row = this.querySelector("#graveyard .stones")!.getBoundingClientRect();
      const btn = this.querySelector<HTMLElement>(`#graveyard button[data-company="${company}"]`)!;
      const t = btn.querySelector<HTMLElement>(".tag")!;
      const cs = getComputedStyle(t);
      const r = t.getBoundingClientRect();
      // each word's text on one line box: a word split over two lines has two client rects
      const text = t.firstChild!;
      const split = [...t.textContent!.matchAll(/\S+/g)].filter((m) => {
        const range = document.createRange();
        range.setStart(text, m.index!);
        range.setEnd(text, m.index! + m[0].length);
        return new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size > 1;
      }).map((m) => m[0]);
      const tags = [...this.querySelectorAll<HTMLElement>("#graveyard .tag")].map((x) => x.getBoundingClientRect());
      const i = tags.findIndex((x) => x.left === r.left && x.top === r.top);
      return {
        text: t.textContent,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        lines: Math.round((t.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)),
        cut: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1,
        split,
        inRow: r.top >= row.top - 1 && r.bottom <= row.bottom + 1,
        gapBefore: i > 0 ? r.left - tags[i - 1]!.right : 12,
        gapAfter: i < tags.length - 1 ? tags[i + 1]!.left - r.right : 12,
      };
    }, GSA);
    expect(tag).toMatchObject({ text: GSA, fontSize: "12px", lineHeight: "16px", lines: 3, cut: false, split: [], inRow: true });
    expect(tag.gapBefore).toBeGreaterThanOrEqual(12 - 1);
    expect(tag.gapAfter).toBeGreaterThanOrEqual(12 - 1);
    await page.screenshot({ path: `${SHOTS}/long-tag-${width}.png` });
  });

  test(`${width}px: the "ask" search launcher becomes a square sunken field whose label reads whole`, async ({ context, sw }) => {
    const { page, tabId } = await hauntHero(context, sw, width);
    const look = () =>
      page.evaluate(() => {
        const ask = document.getElementById("ask")!;
        const label = document.getElementById("ask-label")!.getBoundingClientRect();
        const box = ask.getBoundingClientRect();
        const cs = getComputedStyle(ask);
        return {
          radius: cs.borderRadius,
          bg: cs.backgroundColor,
          label: getComputedStyle(document.getElementById("ask-label")!).color,
          clipped: ask.scrollWidth > ask.clientWidth + 1 || label.right > box.right - 1 || label.left < box.left,
          onScreen: box.left >= 0 && box.right <= window.innerWidth,
        };
      });
    expect(await look()).toEqual({ radius: "0px", bg: "rgb(255, 255, 255)", label: "rgb(0, 0, 0)", clipped: false, onScreen: true });
    await page.screenshot({ path: `${SHOTS}/ask-${width}.png`, clip: { x: 0, y: 0, width, height: 260 } });
    // the page's own launcher clips its label (as nps.gov's does); un-haunt gives that back
    await sw.evaluate(async (id) => chrome.tabs.sendMessage(id, { type: "unhaunt" }), tabId);
    await expect(page.locator("hg-crypt")).toHaveCount(0);
    expect(await look()).toMatchObject({ radius: "40px", clipped: true, label: "rgb(255, 255, 255)" });
  });

  test(`${width}px: links on the dark gradient strip of slide titles read light, 4.5:1 or more on all of it`, async ({ context, sw }) => {
    const { page } = await hauntHero(context, sw, width);
    const links = await page.evaluate(() =>
      ["slide-link", "slide-on-link"].map((id) => {
        const a = document.getElementById(id)!;
        // the gradient behind the link: the nearest box with a background image
        let g: Element | null = a;
        while (g && getComputedStyle(g).backgroundImage === "none") g = g.parentElement;
        return { id, color: getComputedStyle(a).color, stops: getComputedStyle(g!).backgroundImage.match(/rgba?\([^)]*\)/g) ?? [] };
      }),
    );
    for (const l of links) {
      const c = parseColour(l.color)!.hex;
      const worst = Math.min(...l.stops.map((s) => contrastRatio(c, parseColour(s)!.hex)));
      expect({ id: l.id, light: relativeLuminance(c) >= 0.4, readable: worst >= 4.5, stops: l.stops.length > 1 }).toEqual({ id: l.id, light: true, readable: true, stops: true });
    }
    await page.screenshot({ path: `${SHOTS}/slides-${width}.png` });
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
      document.getElementById("slide-on-link")!.focus({ preventScroll: true });
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
