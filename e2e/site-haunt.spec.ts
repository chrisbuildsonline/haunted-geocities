// Site haunt (.kiro/specs/site-haunt): "Haunt this whole site" keeps the tab haunted on every page of
// the same site, without the 3-second haunt moment, until it leaves the site. "Haunt this page" never
// asks Chrome for anything. The e2e build holds the fixture origins already, so the whole-site request
// is granted without a prompt; "declined" stubs a no.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, fixture, UNHAUNT_TIMEOUT, shadowOf, tabIdOf, test } from "./fixtures";
import { FIXTURE_PORT } from "../playwright.config";

type Ctx = { context: BrowserContext; sw: Worker; extensionId: string };
type Mode = "site" | "declined" | "page";

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

/** index.html haunted with one of the popup's two buttons, then put in front so a haunt moment would play there. */
async function hauntFromPopup(ctx: Ctx, mode: Mode = "site") {
  const page = await ctx.context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(ctx.sw, page);
  const { popup, asks } = await openPopup(ctx, tabId, mode === "declined");
  await expect(popup.locator("#site-hint")).toHaveText("Follows every link on 127.0.0.1. Chrome asks once.");
  await popup.getByRole("button", { name: mode === "page" ? "Haunt this page" : "Haunt this whole site" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  if (mode === "site") await expect(popup.locator(".site-line")).toHaveText("Haunting all of 127.0.0.1");
  else await expect(popup.locator(".site-line")).toHaveCount(0);
  expect(await asks()).toEqual(mode === "page" ? [] : [["http://127.0.0.1/*", "https://127.0.0.1/*"]]);
  await popup.close();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  await page.bringToFront();
  return { page, tabId };
}

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

test("Haunt this whole site: the next page of the site is haunted without the haunt moment", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  const inShadow = await shadowOf(page);
  // The haunt moment's FX layer lives for ~3.6s from the costume's arrival; a quiet haunt never has one.
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  expect(await inShadow(function () { return this.getElementById("fx") === null && !!this.getElementById("hud"); })).toBe(true);
  await page.waitForTimeout(300);
  expect(await inShadow(function () { return this.getElementById("fx") === null; })).toBe(true);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "haunted", site: "Haunting all of 127.0.0.1" });
});

test("a link to another site gives a clean page and ends the site haunt", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  expect(await siteEntry(sw, tabId)).toBe("127.0.0.1");
  await follow(page, `http://localhost:${FIXTURE_PORT}/clean.html`);
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/clean\.html$/);
  await expectClean(page);
  expect(await siteEntry(sw, tabId)).toBeNull();
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "idle", site: null });
});

test("a reload stays haunted", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  await page.reload();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "haunted", site: "Haunting all of 127.0.0.1" });
});

test("Haunt this page never asks Chrome and haunts that page only", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx, "page");
  expect(await siteEntry(sw, tabId)).toBeNull();
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expectClean(page);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "idle", site: null });
});

test("a declined permission keeps the one-page haunt", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx, "declined");
  expect(await siteEntry(sw, tabId)).toBeNull();
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
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expectClean(page);
});
