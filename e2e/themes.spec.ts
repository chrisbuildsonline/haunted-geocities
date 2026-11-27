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
    tint: getComputedStyle(document.documentElement, "::before").backgroundColor,
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
    const body = await page.evaluate(() => ({ width: document.body.getBoundingClientRect().width, maxWidth: getComputedStyle(document.body).maxWidth }));
    // every real link is still on the page and still clickable
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].every((a) => {
      const r = a.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.width > 0 && (hit === a || a.contains(hit) || r.top > innerHeight || r.bottom < 0);
    }));
    expect(links).toBe(true);
    shape.push({ host, before, ...body, furniture, columns });
    await page.screenshot({ path: `${SHOTS}/structure-${host}-1280.png` });
    await page.close();
  }
  const [classic, other] = shape as [(typeof shape)[number], (typeof shape)[number]];
  // Classic Crypt keeps the page's own width and adds no furniture; the other site is a 1998 table with furniture
  expect({ maxWidth: classic.maxWidth, furniture: classic.furniture, columns: classic.columns }).toEqual({ maxWidth: "none", furniture: [], columns: [] });
  expect(other.maxWidth).toMatch(/^\d+px$/);
  expect(other.width).toBeLessThan(other.before);
  expect(other.furniture.length).toBeGreaterThanOrEqual(2);
});
