// Site haunt (.kiro/specs/site-haunt): Haunt page keeps the tab haunted on every page of the same
// site, without the 3-second haunt moment, until it leaves the site; each next page is covered by the
// 1998 loading screen (cover.js, registered at document_start) until the costume has painted. The e2e
// build holds the fixture origins already, so the site request is granted without a prompt; "declined"
// stubs a no.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, fixture, UNHAUNT_TIMEOUT, shadowOf, tabIdOf, test } from "./fixtures";
import { FIXTURE_PORT } from "../playwright.config";

type Ctx = { context: BrowserContext; sw: Worker; extensionId: string };
type Mode = "site" | "declined";

/** popup.html as a tab for `tabId`, with chrome.permissions.request recorded (and answering no when declined). */
async function openPopup({ context, extensionId }: Ctx, tabId: number, declined = false) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.addInitScript((no) => {
    const w = window as unknown as { __asks: unknown[] };
    w.__asks = [];
    const real = chrome.permissions.request.bind(chrome.permissions);
    chrome.permissions.request = ((p: chrome.permissions.Permissions) => {
      w.__asks.push(p.origins);
      return no ? Promise.resolve(false) : real(p);
    }) as typeof chrome.permissions.request;
  }, declined);
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await expect(popup.locator("#app[data-screen]")).toBeAttached();
  const asks = () => popup.evaluate(() => (window as unknown as { __asks: unknown[] }).__asks);
  return { popup, asks };
}

/**
 * Records, from the page's main world, when the cover (<hg-cover>) came and went, whether it was up at
 * DOMContentLoaded, and the first paint, for every document the page loads from now on.
 */
async function recordCover(page: Page) {
  await page.addInitScript(() => {
    const rec = { seenAt: null as number | null, goneAt: null as number | null, atDCL: null as boolean | null, firstPaint: null as number | null };
    (window as unknown as { __cover: typeof rec }).__cover = rec;
    const look = () => {
      const up = !!document.querySelector("hg-cover");
      if (up && rec.seenAt === null) rec.seenAt = performance.now();
      if (!up && rec.seenAt !== null && rec.goneAt === null) rec.goneAt = performance.now();
    };
    look();
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => (rec.atDCL = !!document.querySelector("hg-cover")));
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === "first-paint" && rec.firstPaint === null) rec.firstPaint = e.startTime;
    }).observe({ type: "paint", buffered: true });
  });
  return () => page.evaluate(() => (window as unknown as { __cover: { seenAt: number | null; goneAt: number | null; atDCL: boolean | null; firstPaint: number | null } }).__cover);
}

/** index.html haunted with Haunt page, then put in front so a haunt moment would play there. */
async function hauntFromPopup(ctx: Ctx, mode: Mode = "site") {
  const page = await ctx.context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(ctx.sw, page);
  const { popup, asks } = await openPopup(ctx, tabId, mode === "declined");
  await expect(popup.getByRole("button")).toHaveText(["Haunt page"]);
  await expect(popup.locator("#site-note")).toHaveText("Chrome may ask once to let the haunt follow you around 127.0.0.1.");
  await popup.getByRole("button", { name: "Haunt page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  if (mode === "site") await expect(popup.locator(".site-line")).toHaveText("Haunting all of 127.0.0.1");
  else await expect(popup.locator(".site-line")).toHaveCount(0);
  expect(await asks()).toEqual([["http://127.0.0.1/*", "https://127.0.0.1/*"]]);
  await popup.close();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  await page.bringToFront();
  return { page, tabId };
}

const covers = (sw: Worker) => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((c) => c.id));

/** Follow a link the way a click does, from inside the page (the costume may cover the spot). */
async function follow(page: Page, href: string) {
  await page.evaluate((h) => {
    const a = Object.assign(document.createElement("a"), { href: h });
    document.body.append(a);
    a.click();
  }, href);
}

/** The popup's screen and site line for the tab, read from a fresh popup. */
async function popupSays(ctx: Ctx, tabId: number) {
  const { popup } = await openPopup(ctx, tabId);
  const screen = await popup.locator("#app").getAttribute("data-screen");
  const site = (await popup.locator(".site-line").count()) ? await popup.locator(".site-line").textContent() : null;
  await popup.close();
  return { screen, site };
}

/** A clean page: no costume appears once the page has loaded and the background has had its say. */
async function expectClean(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
}

const siteEntry = (sw: Worker, tabId: number) => sw.evaluate(async (id) => (await chrome.storage.session.get(`site:${id}`))[`site:${id}`] ?? null, tabId);

test("the next page of the site is covered before it paints, then haunted without the haunt moment", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  expect(await covers(sw)).toEqual(["cover-127.0.0.1"]);
  const cover = await recordCover(page);
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  const inShadow = await shadowOf(page);
  // The haunt moment's FX layer lives for ~3.6s from the costume's arrival; a quiet haunt never has one.
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  expect(await inShadow(function () { return this.getElementById("fx") === null && !!this.getElementById("hud"); })).toBe(true);
  await page.waitForTimeout(300);
  expect(await inShadow(function () { return this.getElementById("fx") === null; })).toBe(true);
  // The cover was up from before the first paint and at DOMContentLoaded, and is gone now.
  await expect(page.locator("hg-cover")).toHaveCount(0);
  const rec = await cover();
  console.log(`cover: seen ${rec.seenAt?.toFixed(1)}ms, first paint ${rec.firstPaint?.toFixed(1)}ms, gone ${rec.goneAt?.toFixed(1)}ms`);
  expect(rec.seenAt).not.toBeNull();
  expect(rec.atDCL).toBe(true);
  expect(rec.goneAt).not.toBeNull();
  if (rec.firstPaint !== null) expect(rec.seenAt!).toBeLessThanOrEqual(rec.firstPaint);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "haunted", site: "Haunting all of 127.0.0.1" });
});

test("another tab on the same site that is not haunted is never covered", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  await hauntFromPopup(ctx);
  const other = await context.newPage();
  const cover = await recordCover(other);
  await other.goto(fixture("clean.html"));
  await other.waitForLoadState("load");
  await other.waitForTimeout(1000);
  expect((await cover()).seenAt).toBeNull();
  await expect(other.locator("hg-crypt")).toHaveCount(0);
});

test("the cover is a 1998 loading screen: crypt, ghost, Loading crypt…, a Win95 progress bar", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    // cover.js again on this page (the tab is marked and haunts the site): it stays up until its 3s cap.
    await sw.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ["cover.js"] }), tabId);
    await expect(page.locator("hg-cover")).toHaveCount(1);
    await page.waitForTimeout(200); // its closed shadow root is out of Playwright's reach: test/cover.test.ts checks the text
    await page.screenshot({ path: `test-results/cover-${width}.png` });
    await expect(page.locator("hg-cover")).toHaveCount(0, { timeout: 5000 });
  }
});

test("a link to another site gives a clean page and ends the site haunt", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  expect(await siteEntry(sw, tabId)).toBe("127.0.0.1");
  await follow(page, `http://localhost:${FIXTURE_PORT}/clean.html`);
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/clean\.html$/);
  await expectClean(page);
  expect(await siteEntry(sw, tabId)).toBeNull();
  expect(await covers(sw)).toEqual([]);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "idle", site: null });
});

test("a reload stays haunted", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  await page.reload();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "haunted", site: "Haunting all of 127.0.0.1" });
});

test("a declined permission keeps the one-page haunt", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx, "declined");
  expect(await siteEntry(sw, tabId)).toBeNull();
  expect(await covers(sw)).toEqual([]);
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expectClean(page);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "idle", site: null });
});

test("Un-haunt ends the site haunt: the next page is clean", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  const { popup } = await openPopup(ctx, tabId);
  await popup.getByRole("button", { name: "Un-haunt" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle", { timeout: UNHAUNT_TIMEOUT });
  await popup.close();
  expect(await siteEntry(sw, tabId)).toBeNull();
  expect(await covers(sw)).toEqual([]);
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expectClean(page);
});
