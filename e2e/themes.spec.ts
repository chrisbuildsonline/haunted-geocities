// Seeded per-site looks (design/DESIGN.md "Themes"): the hostname picks a whole 1998 homepage look.
// 127.0.0.1 and localhost are two sites to the seed, served by the same fixture server.
import type { Page, Worker } from "@playwright/test";
import { FIXTURE_PORT } from "../playwright.config";
import { expect, haunt, shadowOf, test } from "./fixtures";

const at = (host: string, path: string) => `http://${host}:${FIXTURE_PORT}/${path}`;
const settle = (page: Page) => page.waitForTimeout(3700);
const SHOTS = "test-results/themes";

async function unhaunt(sw: Worker, tabId: number) {
  await sw.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { type: "unhaunt" });
  }, tabId);
}

/** What a look changes on the page and in the costume. */
async function lookOf(page: Page) {
  const inShadow = await shadowOf(page);
  const page_ = await page.evaluate(() => ({
    theme: getComputedStyle(document.documentElement).getPropertyValue("--hg-theme").trim(),
    font: getComputedStyle(document.body).fontFamily,
    tint: getComputedStyle(document.body).backgroundColor,
    padding: getComputedStyle(document.body).paddingTop,
    welcome: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hg-welcome")),
  }));
  const costume = await inShadow(function () {
    const w = this.getElementById("welcome")!;
    const bar = this.getElementById("neighborhood")!;
    return {
      banner: w.querySelector(".wb-title")!.textContent,
      bannerTop: w.getBoundingClientRect().top,
      bannerHeight: w.getBoundingClientRect().height,
      sprites: [...w.querySelectorAll(".deco")].map((d) => (d as HTMLElement).dataset.sprite),
      bar: getComputedStyle(bar).backgroundColor,
      tile: getComputedStyle(this.querySelector(".fill")!).backgroundImage.slice(0, 120),
    };
  });
  return { ...page_, ...costume };
}

test("two sites get two different looks; each is the same on reload", async ({ context, sw }) => {
  test.setTimeout(90_000);
  const looks = [];
  for (const host of ["127.0.0.1", "localhost"]) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(at(host, "article.html"));
    await haunt(sw, page);
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${host}-1280.png` });
    const look = await lookOf(page);
    // the banner sits right under the fixed bands, and the page is padded for both
    expect(look.bannerTop).toBe(48);
    expect(look.bannerHeight).toBe(look.welcome);
    expect([72, 96, 100, 124]).toContain(look.welcome);
    expect(look.sprites).toHaveLength(2);
    looks.push(look);
    await page.reload();
    await haunt(sw, page);
    await settle(page);
    const again = await lookOf(page);
    expect({ theme: again.theme, banner: again.banner, sprites: again.sprites, tile: again.tile }).toEqual({ theme: look.theme, banner: look.banner, sprites: look.sprites, tile: look.tile });
    await page.close();
  }
  const [a, b] = looks as [Awaited<ReturnType<typeof lookOf>>, Awaited<ReturnType<typeof lookOf>>];
  expect(a.theme).toBe("classic-crypt");
  expect(b.theme).not.toBe(a.theme);
  // visibly different: page font, tint, the bar's colour and the gutter tile all change
  expect(b.font).not.toBe(a.font);
  expect(b.tint).not.toBe(a.tint);
  expect(b.bar).not.toBe(a.bar);
  expect(b.tile).not.toBe(a.tile);
});

test("a phone gets the short banner; under reduced motion nothing in it moves and no trail follows the pointer", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(at("localhost", "article.html"));
  await haunt(sw, page);
  await settle(page);
  const look = await lookOf(page);
  expect(look.bannerHeight).toBe(56);
  for (let i = 0; i < 10; i++) await page.mouse.move(100 + i * 20, 300 + i * 10);
  const inShadow = await shadowOf(page);
  const still = await inShadow(function () {
    return {
      sparks: this.querySelectorAll("#trail .spark").length,
      moving: [...this.querySelectorAll("#welcome *")].filter((e) => getComputedStyle(e).animationName !== "none").length,
    };
  });
  expect(still).toEqual({ sparks: 0, moving: 0 });
  await page.screenshot({ path: `${SHOTS}/localhost-375-reduced.png` });
});

test("with motion the pointer leaves a trail of at most 12 glyphs", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(at("localhost", "article.html"));
  await haunt(sw, page);
  await settle(page);
  const inShadow = await shadowOf(page);
  const counts: number[] = [];
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(200 + i * 15, 300 + (i % 5) * 10);
    await page.waitForTimeout(60);
    counts.push(await inShadow(function () { return this.querySelectorAll("#trail .spark").length; }));
  }
  expect(Math.max(...counts)).toBeGreaterThan(0);
  expect(Math.max(...counts)).toBeLessThanOrEqual(12);
});

for (const preset of ["flame-skull", "cloud-angel", "matrix-den"]) {
  test(`un-haunt restores the page byte for byte under ${preset}`, async ({ context, sw }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(at("127.0.0.1", `article.html?hgtheme=${preset}`));
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const before = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, sheets: document.adoptedStyleSheets.length, pad: getComputedStyle(document.body).paddingTop }));
    const tabId = await haunt(sw, page);
    await settle(page);
    expect((await lookOf(page)).theme).toBe(preset);
    await page.mouse.move(300, 300);
    await page.mouse.move(340, 320);
    await unhaunt(sw, tabId);
    await expect(page.locator("hg-crypt")).toHaveCount(0);
    expect(await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, sheets: document.adoptedStyleSheets.length, pad: getComputedStyle(document.body).paddingTop }))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(html);
  });
}

test("two sites get two different page structures: the page's width and the furniture round it", async ({ context, sw }) => {
  test.setTimeout(60_000);
  const shape = [];
  for (const host of ["127.0.0.1", "localhost"]) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(at(host, "article.html"));
    const before = await page.evaluate(() => document.body.getBoundingClientRect().width);
    await haunt(sw, page);
    await settle(page);
    const inShadow = await shadowOf(page);
    const furniture = await inShadow(function () {
      return [...this.querySelectorAll(".fur")].map((f) => f.className.replace("fur fur-", ""));
    });
    const columns = await inShadow(function () {
      return [...this.querySelectorAll(".fur-col")].filter((c) => !(c as HTMLElement).hidden).map((c) => c.id);
    });
    const body = await page.evaluate(() => ({ width: document.body.getBoundingClientRect().width, left: document.body.getBoundingClientRect().left, maxWidth: getComputedStyle(document.body).maxWidth }));
    const table = await inShadow(function () { return this.getElementById("welcome")!.getBoundingClientRect().width; });
    // every real link is still on the page and still clickable
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].every((a) => {
      const r = a.getClientRects()[0] ?? a.getBoundingClientRect(); // a wrapped link: its first line
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.width > 0 && (hit === a || a.contains(hit) || r.top > innerHeight || r.bottom < 0);
    }));
    expect(links).toBe(true);
    shape.push({ host, before, ...body, table, furniture, columns });
    await page.screenshot({ path: `${SHOTS}/structure-${host}-1280.png` });
    await page.close();
  }
  const [classic, other] = shape as [(typeof shape)[number], (typeof shape)[number]];
  // Classic Crypt is one plain 960px table with no furniture; the other site is a wider table with side columns and furniture
  expect({ maxWidth: classic.maxWidth, furniture: classic.furniture, columns: classic.columns }).toEqual({ maxWidth: "960px", furniture: [], columns: [] });
  for (const s of [classic, other]) expect(s.width).toBeLessThan(s.before);
  expect(other.columns.length).toBeGreaterThanOrEqual(1);
  expect(other.furniture.length).toBeGreaterThanOrEqual(2);
  expect(other.left).not.toBe(classic.left);
  expect(other.table).toBeGreaterThan(classic.table);
});

test("on a phone the table folds to one column: no side columns, the furniture at the bottom, no sideways scroll", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(at("127.0.0.1", "article.html?hgtheme=matrix-den"));
  await haunt(sw, page);
  await settle(page);
  const inShadow = await shadowOf(page);
  const fold = await inShadow(function () {
    return {
      columns: [...this.querySelectorAll(".fur-col")].filter((c) => !(c as HTMLElement).hidden).length,
      bottom: this.querySelectorAll("#fur-bottom .fur").length,
      all: this.querySelectorAll(".fur").length,
    };
  });
  expect(fold.columns).toBe(0);
  expect(fold.bottom).toBe(fold.all);
  expect(fold.all).toBeGreaterThanOrEqual(6);
  expect(await page.evaluate(() => ({ maxWidth: getComputedStyle(document.body).maxWidth, scroll: document.documentElement.scrollWidth <= innerWidth }))).toEqual({ maxWidth: "none", scroll: true });
});

/** Every rect of the page's own visible text and pictures in the viewport. */
const pageRects = (page: Page) =>
  page.evaluate(() => {
    const out: { what: string; left: number; top: number; right: number; bottom: number }[] = [];
    const inView = (r: DOMRect) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!n.nodeValue?.trim() || !p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (inView(r)) out.push({ what: `text "${n.nodeValue.trim().slice(0, 30)}"`, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    for (const e of document.body.querySelectorAll("img, picture, video, canvas, iframe, svg")) {
      const r = e.getBoundingClientRect();
      if (inView(r)) out.push({ what: `<${e.localName}>`, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    return out;
  });

for (const width of [1280, 375]) {
  for (const [file, preset] of [["article.html", ""], ["article.html", "flame-skull"], ["index.html", "cloud-angel"], ["hero.html", "matrix-den"], ["hero.html", "spiderweb-attic"]] as const) {
    test(`nothing of ours covers the page's text or pictures: ${file} ${preset || "own look"} @${width}`, async ({ context, sw }) => {
      test.setTimeout(60_000);
      // hero.html's HSTS-preloaded tracker hosts are upgraded to https: answer them here (as e2e/photo-page.spec.ts does)
      await context.route(/^https?:\/\/(google-analytics\.com|digitalgov\.gov):4321\//, (route) =>
        route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }),
      );
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 800 });
      await page.goto(at("127.0.0.1", `${file}${preset ? `?hgtheme=${preset}` : ""}`));
      await haunt(sw, page);
      await settle(page);
      const inShadow = await shadowOf(page);
      const ours = await inShadow(function () {
        const sel = "#top-bands, #welcome, .fur-col:not([hidden]), .deco, #lanes .ghost, #lanes .vampire, .spark";
        return [...this.querySelectorAll(sel)].map((e) => {
          const r = e.getBoundingClientRect();
          return { what: e.id || e.className, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }).filter((r) => r.right > r.left && r.bottom > r.top);
      });
      const theirs = await pageRects(page);
      expect(theirs.length).toBeGreaterThan(0);
      const hits = ours.flatMap((o) => theirs.filter((t) => o.left < t.right - 1 && t.left < o.right - 1 && o.top < t.bottom - 1 && t.top < o.bottom - 1).map((t) => `${o.what} over ${t.what}`));
      expect(hits).toEqual([]);
      // no tint, filter or blend over the page, and the page's pictures keep their own colours
      const paint = await page.evaluate(() => ({
        tint: getComputedStyle(document.documentElement, "::before").content,
        blend: [getComputedStyle(document.documentElement, "::after").mixBlendMode, getComputedStyle(document.documentElement, "::before").mixBlendMode],
        images: [...document.querySelectorAll("img, picture, video")].map((e) => `${getComputedStyle(e).filter}|${getComputedStyle(e).mixBlendMode}|${getComputedStyle(e).opacity}`),
      }));
      expect(paint.tint).toBe("none");
      expect(paint.blend.every((b) => b === "normal")).toBe(true);
      for (const i of paint.images) expect(i).toBe("none|normal|1");
      await page.screenshot({ path: `${SHOTS}/clear-${file.replace(".html", "")}-${preset || "own"}-${width}.png` });
    });
  }
}
