// The costume reaches into the content column: 1998 fonts and links, a parchment tint that
// multiplies with the page, a guestbook frame, and a full-overlay edge frame on narrow pages.
import type { Page, Worker } from "@playwright/test";
import { expect, fixture, haunt, shadowOf, test } from "./fixtures";

const settle = (page: Page) => page.waitForTimeout(3100);
const SHOTS = "test-results/column-costume";

async function unhaunt(sw: Worker, tabId: number) {
  await sw.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { type: "unhaunt" });
  }, tabId);
}

/** The RGB of every pixel in `clip`, decoded from a screenshot in a blank tab. */
async function pixels(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<[number, number, number][]> {
  const png = (await page.screenshot({ clip })).toString("base64");
  const blank = await page.context().newPage();
  const out = await blank.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    const px: [number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i]!, d[i + 1]!, d[i + 2]!]);
    return px;
  }, png);
  await blank.close();
  return out;
}

const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);

test("tint: white page pixel inside the column renders #ffffcc, black text stays #000000", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("article.html"));
  await haunt(sw, page);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/article-1280.png` });
  // white page ground, right of the short byline, inside the column
  const article = await box(page, "article");
  const byline = await box(page, ".byline");
  const ground = await pixels(page, { x: Math.round(article.right - 40), y: Math.round(byline.top + byline.height / 2), width: 4, height: 4 });
  expect(new Set(ground.map((p) => p.join(",")))).toEqual(new Set(["255,255,204"]));
  // the h1 is #000000 text: its solid strokes stay pure black under the multiply
  const h1 = await box(page, "h1");
  const ink = await pixels(page, { x: Math.round(h1.left), y: Math.round(h1.top), width: Math.round(Math.min(h1.width, 600)), height: Math.round(h1.height) });
  expect(ink.some(([r, g, b]) => r === 0 && g === 0 && b === 0)).toBe(true);
  expect(ink.some(([r, g, b]) => r === 255 && g === 255 && b === 255)).toBe(false);
});

test("haunted body is Times New Roman, h1 is Comic Sans MS, a:link is rgb(0, 0, 255)", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("article.html"));
  const kept = () => page.evaluate(() => ["pre code", "button", ".icon-clock"].map((s) => getComputedStyle(document.querySelector(s)!).fontFamily));
  const before = await kept();
  await haunt(sw, page);
  await settle(page);
  const look = await page.evaluate(() => {
    const cs = (s: string) => getComputedStyle(document.querySelector(s)!);
    const frame = getComputedStyle(document.documentElement, "::after");
    return {
      body: cs("body").fontFamily,
      p: cs("article p").fontFamily,
      h1: cs("h1").fontFamily,
      h3: cs("h3").fontFamily,
      link: cs("#manual").color,
      underline: cs("#manual").textDecorationLine,
      frame: [frame.borderTopColor, frame.borderBottomColor, frame.pointerEvents, frame.boxShadow],
    };
  });
  expect(look.body).toMatch(/^"Times New Roman"/);
  expect(look.p).toMatch(/^"Times New Roman"/);
  expect(look.h1).toMatch(/^"Comic Sans MS"/);
  expect(look.h3).toMatch(/^"Comic Sans MS"/);
  expect(look.link).toBe("rgb(0, 0, 255)");
  expect(look.underline).toBe("underline");
  expect(look.frame.slice(0, 3)).toEqual(["rgb(153, 153, 204)", "rgb(51, 51, 102)", "none"]);
  expect(look.frame[3]).toContain("rgb(102, 51, 204)");
  // code, form controls and icons keep their own fonts
  expect(await kept()).toEqual(before);
  // the page is costumed, not only framed: the gutters still stop short of the frame
  const inShadow = await shadowOf(page);
  const gutter = await inShadow(function () {
    return this.querySelector(".gutter.left")!.getBoundingClientRect().right;
  });
  expect(gutter).toBeLessThanOrEqual((await box(page, "article")).left - 11 + 1);
  // the frame runs to the end of the page
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/article-1280-end.png` });
  // narrowed to a phone, the same page goes full-overlay: edge frame, no guestbook frame, all tinted
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 375, height: 740 });
  await expect.poll(() => inShadow(function () { return (this.getElementById("edge-frame") as HTMLElement).hidden; })).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::after").content)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/article-375.png` });
});

// The frame's inner edges in viewport x: inside the guestbook frame's 6px ridge, or inside the
// 12px edge frame in full-overlay mode. Then every text rect in the flow (not pinned page chrome)
// that is nearer than 16px to either edge.
const crowded = (page: Page) =>
  page.evaluate(() => {
    const html = document.documentElement;
    const frame = getComputedStyle(html, "::after");
    const vw = html.clientWidth;
    const [left, right] =
      frame.content === "none" ? [12, vw - 12] : [parseFloat(frame.left) + 6 - scrollX, parseFloat(frame.left) + parseFloat(frame.width) - 6 - scrollX];
    const pinned = (el: Element | null): boolean => !!el && (getComputedStyle(el).position === "fixed" || pinned(el.parentElement));
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!n.nodeValue?.trim() || !parent || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName) || pinned(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && (r.left - left < 16 || right - r.right < 16)) {
          out.push(`"${n.nodeValue.trim().slice(0, 24)}" ${Math.round(r.left - left)}px / ${Math.round(right - r.right)}px`);
        }
      }
    }
    return { mode: frame.content === "none" ? "overlay" : "frame", out };
  });

test("column text clears the frame by 16px on every fixture at 1280 and 375", async ({ context, sw }) => {
  test.setTimeout(120_000);
  for (const name of ["article", "index", "trackers", "links", "dark-patterns", "column", "dark"]) {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(fixture(`${name}.html`));
    await haunt(sw, page);
    await page.waitForTimeout(600);
    expect({ name, ...(await crowded(page)) }).toEqual({ name, mode: "frame", out: [] });
    await page.setViewportSize({ width: 375, height: 740 });
    await expect.poll(async () => (await crowded(page)).mode).toBe("overlay");
    await page.waitForTimeout(200);
    expect({ name, ...(await crowded(page)) }).toEqual({ name, mode: "overlay", out: [] });
    await page.close();
  }
});

test("dark page links are rgb(102, 204, 255)", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("dark.html"));
  await haunt(sw, page);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/dark-1280.png` });
  const look = await page.evaluate(() => ({
    link: getComputedStyle(document.querySelector("#log")!).color,
    tint: getComputedStyle(document.documentElement, "::before").content,
    frame: getComputedStyle(document.documentElement, "::after").content,
  }));
  expect(look).toEqual({ link: "rgb(102, 204, 255)", tint: "none", frame: '""' });
});

test("375px: links and form still clickable, form submits", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(fixture("index.html"));
  await haunt(sw, page);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/index-375.png` });
  const inShadow = await shadowOf(page);
  expect(await inShadow(function () { return (this.getElementById("edge-frame") as HTMLElement).hidden; })).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::before").content)).toBe('""');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::after").content)).toBe("none");
  // every link and control is what a hit at its centre finds (scrolled clear of the bands and HUD)
  const misses = await page.evaluate(async () => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("a, button, input")) {
      el.scrollIntoView({ block: "center" });
      await new Promise(requestAnimationFrame);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit) || (hit as HTMLLabelElement).control === el)) out.push(`${el.outerHTML} -> ${hit?.outerHTML.slice(0, 40)}`);
    }
    const c = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    if (!c || c.localName === "hg-crypt") out.push("centre");
    return out;
  });
  expect(misses).toEqual([]);
  await page.locator("#name").fill("Ada");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/thanks\.html\?name=Ada/);
});

test("unhaunt: outerHTML and document.adoptedStyleSheets equal pre-haunt, body font and link colour restored", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("column.html"));
  // the page has a sheet of its own, which must keep its place
  await page.evaluate(() => {
    const own = new CSSStyleSheet();
    own.replaceSync("p { letter-spacing: 0.01em; }");
    document.adoptedStyleSheets = [own];
    (window as unknown as { own: CSSStyleSheet }).own = own;
  });
  const look = () =>
    page.evaluate(() => ({
      font: getComputedStyle(document.body).fontFamily,
      link: getComputedStyle(document.querySelector("#archive")!).color,
      sheets: document.adoptedStyleSheets.length,
      own: document.adoptedStyleSheets[0] === (window as unknown as { own: CSSStyleSheet }).own,
      tint: getComputedStyle(document.documentElement, "::before").content,
    }));
  const before = await look();
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const tabId = await haunt(sw, page);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/column-1280.png` });
  const haunted = await look();
  expect(haunted).toMatchObject({ font: expect.stringMatching(/^"Times New Roman"/), link: "rgb(0, 0, 255)", sheets: 2, own: true, tint: '""' });
  await unhaunt(sw, tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await look()).toEqual(before);
  expect(before).toMatchObject({ font: "Georgia, serif", sheets: 1, own: true, tint: "none" });
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(html);
});
