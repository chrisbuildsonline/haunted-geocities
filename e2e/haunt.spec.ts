import { expect, fixture, openPopup, tabIdOf, test } from "./fixtures";

test("haunt adds a closed-shadow overlay; un-haunt restores the page byte for byte", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));

  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.getByText("Haunted", { exact: true })).toBeVisible();

  await expect(page.locator("hg-crypt")).toHaveCount(1);
  const overlay = await page.evaluate(() => {
    const host = document.documentElement.lastElementChild!;
    let hasShadowRoot = false;
    try {
      host.attachShadow({ mode: "open" }); // throws only if a shadow root is already attached
    } catch {
      hasShadowRoot = true;
    }
    const cs = getComputedStyle(host);
    const r = host.getBoundingClientRect();
    return {
      tag: host.localName,
      parent: host.parentElement?.localName,
      attributes: host.getAttributeNames(),
      shadowRootVisibleToPage: host.shadowRoot !== null,
      hasShadowRoot,
      position: cs.position,
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      coversViewport: r.left === 0 && r.top === 0 && r.width === innerWidth && r.height === innerHeight,
      hitTest: document.elementFromPoint(innerWidth / 2, 100)?.localName,
    };
  });
  expect(overlay).toEqual({
    tag: "hg-crypt",
    parent: "html",
    attributes: [],
    shadowRootVisibleToPage: false,
    hasShadowRoot: true,
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    coversViewport: true,
    hitTest: expect.not.stringMatching(/^hg-crypt$/),
  });

  await popup.getByRole("button", { name: "Un-haunt" }).click();
  await expect(popup.getByText("Idle", { exact: true })).toBeVisible();
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);

  await page.bringToFront();
  await page.getByLabel("Name").fill("Ada");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/thanks\.html\?name=Ada$/);
  await expect(page.getByRole("heading", { name: "Thanks for signing up" })).toBeVisible();
});

test("the page stays usable while haunted: clicks go through the overlay", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(page.locator("hg-crypt")).toHaveCount(1);

  await page.bringToFront();
  await page.getByLabel("Name").fill("Grace");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/thanks\.html\?name=Grace$/);
});

test("injecting content.js twice keeps a single overlay", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(sw, page);
  for (let i = 0; i < 2; i++) {
    await sw.evaluate(async (id) => {
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content.js"] });
    }, tabId);
  }
  await expect(page.locator("hg-crypt")).toHaveCount(1);
});

test("haunted state survives reopening the popup and is cleared by a reload", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(sw, page);
  const first = await openPopup(context, extensionId, tabId);
  await first.getByRole("button", { name: "Haunt this page" }).click();
  await expect(first.getByRole("button", { name: "Un-haunt" })).toBeVisible();
  await first.close();

  const second = await openPopup(context, extensionId, tabId);
  await expect(second.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await second.close();

  await page.reload();
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  const third = await openPopup(context, extensionId, tabId);
  await expect(third.locator("#app")).toHaveAttribute("data-screen", "idle");
});
