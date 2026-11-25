// Site haunt (.kiro/specs/site-haunt): after Haunt, the tab stays haunted on every page of the same
// site, without the 3-second haunt moment, until it leaves the site. The e2e build holds the fixture
// origins already, so the Haunt click's site request is granted without a prompt; `decline` stubs a no.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, fixture, UNHAUNT_TIMEOUT, openPopup, shadowOf, tabIdOf, test } from "./fixtures";
import { FIXTURE_PORT } from "../playwright.config";

type Ctx = { context: BrowserContext; sw: Worker; extensionId: string };

/** index.html haunted from the popup's button, then put in front so a haunt moment would play there. */
async function hauntFromPopup({ context, sw, extensionId }: Ctx, decline = false) {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(sw, page);
  const popup = await openPopup(context, extensionId, tabId, { decline });
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  if (decline) await expect(popup.locator(".site-line")).toHaveCount(0);
  else await expect(popup.locator(".site-line")).toHaveText("Haunting all of 127.0.0.1");
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
async function popupSays({ context, extensionId }: Ctx, tabId: number) {
  const popup = await openPopup(context, extensionId, tabId);
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

test("the next page of the site is haunted without the haunt moment", async ({ context, sw, extensionId }) => {
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

test("a declined permission keeps the one-page haunt", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx, true);
  expect(await siteEntry(sw, tabId)).toBeNull();
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expectClean(page);
  expect(await popupSays(ctx, tabId)).toEqual({ screen: "idle", site: null });
});

test("Un-haunt ends the site haunt: the next page is clean", async ({ context, sw, extensionId }) => {
  const ctx = { context, sw, extensionId };
  const { page, tabId } = await hauntFromPopup(ctx);
  const popup = await openPopup(context, extensionId, tabId);
  await popup.getByRole("button", { name: "Un-haunt" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle", { timeout: UNHAUNT_TIMEOUT });
  await popup.close();
  expect(await siteEntry(sw, tabId)).toBeNull();
  await follow(page, "clean.html");
  await expect(page).toHaveURL(/\/clean\.html$/);
  await expectClean(page);
});
