// Real-site presentation on a photo-heavy, full-width page (fixtures/hero.html, shaped like a big public
// site): the graveyard tells same-prefix companies apart and reads a long name whole, the strip and the HUD
// never hide the page's end or a focused link, the dark hero blocks, the search box and the search launcher
// wear the costume too, text on a photo gets a crypt window and its outline button a 1998 look, links on a
// dark gradient band read light, and the parade's name tags read whole.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { contrastRatio, parseColour, relativeLuminance } from "../src/content/costume/page-theme";
import { expect, fixture, GOOGLE_HOSTS, GSA_HOST, haunt, scrollToEnd, shadowOf, test, type InShadow } from "./fixtures";

const SHOTS = "test-results/photo-page";
const COMPANIES = Object.keys(GOOGLE_HOSTS);
const GSA = Object.keys(GSA_HOST)[0]!;

// google-analytics.com (and many .gov names) are on Chromium's HSTS preload list, so an http:// pixel is
// upgraded to https:// before the host-resolver rule can send it to the plain-HTTP fixture server: answer
// it here instead. It is still a real request from the page, so it lands in Resource Timing like any other.
const answerPreloaded = (context: BrowserContext) =>
  context.route(/^https?:\/\/(google-analytics\.com|digitalgov\.gov):4321\//, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }),
  );

async function hauntHero(context: BrowserContext, sw: Worker, width: number) {
  await answerPreloaded(context);
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
/** The crypt footer's top edge (it follows the page in flow). */
const footerTop = (inShadow: InShadow) =>
  inShadow(function () {
    return this.getElementById("crypt-footer")!.getBoundingClientRect().top;
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
          top: r.top,
        };
      });
    }, COMPANIES);
    expect(tags.map((t) => t.text)).toEqual(["Google Analytics", "Google Ads"]);
    expect(tags.map((t) => t.label)).toEqual(COMPANIES); // the full name stays in the accessible name and the card
    for (const t of tags) expect({ text: t.text, lines: t.lines <= 2, cut: t.cut, inRow: t.inRow }).toEqual({ text: t.text, lines: true, cut: false, inRow: true });
    expect(tags[0]!.lines).toBe(2); // "Google / Analytics"
    // neighbours on one row keep the 16px gap (the row wraps in the footer)
    if (Math.abs(tags[0]!.top - tags[1]!.top) < 1) expect(tags[0]!.right + 16).toBeLessThanOrEqual(tags[1]!.left + 1);
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
      // neighbours on the same row only: the footer's row wraps
      const tags = [...this.querySelectorAll<HTMLElement>("#graveyard .tag")].map((x) => x.getBoundingClientRect()).filter((x) => Math.abs(x.top - r.top) < 1);
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
    expect(tag).toMatchObject({ text: GSA, fontSize: "14px", lineHeight: "16px", lines: 3, cut: false, split: [], inRow: true });
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

  test(`${width}px: the cdc.gov-style photo slide shows as the page drew it: no window over it, the button keeps its look, the title gets a text-shadow; un-haunt gives it back`, async ({ context, sw }) => {
    const { page, tabId } = await hauntHero(context, sw, width);
    const look = () =>
      page.evaluate(() => {
        const cs = (id: string) => getComputedStyle(document.getElementById(id)!);
        const [col, learn] = [cs("photo-col"), cs("learn")];
        return {
          col: { bg: col.backgroundColor, shadow: col.boxShadow, text: col.textShadow },
          learn: { radius: learn.borderRadius, face: learn.boxShadow, color: learn.color, text: learn.textShadow },
        };
      });
    const l = await look();
    // nothing painted over the photo: the panel keeps no ground and no shadow; its text reads by a dark text-shadow
    expect([l.col.bg, l.col.shadow]).toEqual(["rgba(0, 0, 0, 0)", "none"]);
    expect(l.col.text).toContain("rgb(0, 0, 0) 1px 1px 2px");
    // the outline button keeps its own look, with no shadow on its text
    expect(l.learn).toEqual({ radius: "13.5px 0px", face: "none", color: "rgb(255, 255, 255)", text: "none" });
    await page.screenshot({ path: `${SHOTS}/photo-${width}.png` });

    await sw.evaluate(async (id) => chrome.tabs.sendMessage(id, { type: "unhaunt" }), tabId);
    await expect(page.locator("hg-crypt")).toHaveCount(0);
    const back = await look();
    expect([back.col.bg, back.col.shadow, back.col.text, back.learn.radius, back.learn.face, back.learn.color]).toEqual(["rgba(0, 0, 0, 0)", "none", "none", "13.5px 0px", "none", "rgb(255, 255, 255)"]);
  });
}

test("1280px: the dark hero blocks keep their own look (only their links change), the search box wears the costume; nothing moves, un-haunt gives them back", async ({ context, sw }) => {
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
  // nothing is painted on the dark blocks: the photo hero, the translucent panel and the black band keep their own look
  expect(l.hero.image).toBe('url("data:image/svg+xm');
  expect(l.hero.shadow).toBe("none");
  expect([l.panel.radius, l.panel.bg, l.panel.shadow]).toEqual(["12px", "rgba(0, 0, 0, 0.6)", "none"]);
  expect(l.find.bg).not.toBe("rgb(0, 0, 51)");
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
