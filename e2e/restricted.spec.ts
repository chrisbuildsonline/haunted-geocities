import { expect, fixture, openPopup, tabIdOf, test } from "./fixtures";

test("chrome://version gets the restricted screen with no pill", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  // Learn the tab id while the URL is readable, then navigate the same tab to a Chrome page.
  await page.goto(fixture("clean.html"));
  const tabId = await tabIdOf(sw, page);
  await page.goto("chrome://version");

  const popup = await openPopup(context, extensionId, tabId);
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "restricted");
  await expect(popup.getByRole("heading", { level: 1, name: "This page is protected" })).toBeVisible();
  await expect(popup.getByText("Can't haunt", { exact: true })).toBeVisible();
  await expect(popup.getByText("Chrome doesn't let extensions draw on its own pages.")).toBeVisible();
  await expect(popup.getByRole("button")).toHaveCount(0);
  await expect(popup.getByRole("switch")).toHaveCount(2);
  await expect(popup.getByText("Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0")).toBeVisible();
  await popup.screenshot({ path: "test-results/popup-restricted.png", fullPage: true });

  // The background refuses a HAUNT for this tab too, not just the popup.
  const res = await popup.evaluate((id) => chrome.runtime.sendMessage({ type: "HAUNT", tabId: id }), tabId);
  expect(res).toMatchObject({ haunted: false, restricted: true });
});
