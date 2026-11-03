import { expect, fixture, openPopup, tabIdOf, test } from "./fixtures";
import type { BrowserContext, Page, Worker } from "@playwright/test";

async function hauntedPage(context: BrowserContext, sw: Worker, extensionId: string) {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(sw, page);
  const popup = await openPopup(context, extensionId, tabId);
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.getByRole("button", { name: "Un-haunt" })).toBeVisible();
  await popup.close();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  return { page, tabId };
}

async function expectStillHaunted(context: BrowserContext, extensionId: string, page: Page, tabId: number) {
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  const popup = await openPopup(context, extensionId, tabId);
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await popup.close();
}

test("history.pushState keeps the haunted state and the overlay", async ({ context, sw, extensionId }) => {
  const { page, tabId } = await hauntedPage(context, sw, extensionId);
  await page.evaluate(() => history.pushState({}, "", "/pushed/path"));
  await expect(page).toHaveURL(/\/pushed\/path$/);
  await expectStillHaunted(context, extensionId, page, tabId);
});

test("a location.hash change keeps the haunted state and the overlay", async ({ context, sw, extensionId }) => {
  const { page, tabId } = await hauntedPage(context, sw, extensionId);
  await page.evaluate(() => {
    location.hash = "#section";
  });
  await expect(page).toHaveURL(/#section$/);
  await expectStillHaunted(context, extensionId, page, tabId);
});

test("a real reload still clears the haunted state", async ({ context, sw, extensionId }) => {
  const { page, tabId } = await hauntedPage(context, sw, extensionId);
  await page.reload();
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  const popup = await openPopup(context, extensionId, tabId);
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle");
});
