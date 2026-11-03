import { expect, fixture, openPopup, tabIdOf, test } from "./fixtures";

const ATTRIBUTION = "Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0";

test("idle → haunted → idle through the popup's own buttons, with screenshots", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));

  // idle
  await expect(popup.getByRole("heading", { level: 1, name: "127.0.0.1" })).toBeVisible();
  await expect(popup.getByText("Idle", { exact: true })).toBeVisible();
  await expect(popup.getByText("Turn this page into a 1998 crypt.")).toBeVisible();
  await expect(popup.getByRole("button")).toHaveCount(1);
  await expect(popup.getByText(ATTRIBUTION)).toBeVisible();
  await popup.screenshot({ path: "test-results/popup-idle.png", fullPage: true });

  // haunted
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  const unhaunt = popup.getByRole("button", { name: "Un-haunt" });
  await expect(unhaunt).toBeFocused();
  await expect(popup.getByText("Haunted", { exact: true })).toBeVisible();
  await expect(popup.getByRole("button")).toHaveCount(1);
  const tiles = popup.getByRole("list", { name: "Found on this page" }).getByRole("listitem");
  await expect(tiles).toHaveText(["0 Ghosts", "0 Vampires", "0 Tombstones", "0 Curses"]);
  const labelBoxes = await tiles.evaluateAll((els) => els.map((el) => el.lastElementChild!.getBoundingClientRect().toJSON()));
  for (let i = 1; i < labelBoxes.length; i++) {
    expect(labelBoxes[i].left).toBeGreaterThanOrEqual(labelBoxes[i - 1].right); // labels never overlap
  }
  expect(labelBoxes.at(-1).right).toBeLessThanOrEqual(360 - 16 - 20);
  await expect(popup.getByText("No ghosts here. Suspiciously clean.")).toBeVisible();
  await expect(popup.getByText("Trackers that load later will appear here.")).toBeVisible();
  await expect(popup.getByText(ATTRIBUTION)).toBeVisible();
  await popup.mouse.move(0, 0);
  await popup.screenshot({ path: "test-results/popup-haunted.png", fullPage: true });

  // back to idle
  await unhaunt.click();
  await expect(popup.getByRole("button", { name: "Haunt this page" })).toBeFocused();
  await expect(popup.getByText("Idle", { exact: true })).toBeVisible();
});

test("the popup follows the design tokens", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  const look = await popup.evaluate(() => {
    const cs = (sel: string) => getComputedStyle(document.querySelector(sel)!);
    const pill = cs("button");
    const surface = cs("section");
    const title = cs("h1");
    return {
      bodyWidth: document.body.getBoundingClientRect().width,
      canvas: getComputedStyle(document.body).backgroundColor,
      pill: [pill.backgroundColor, pill.color, pill.height, pill.fontSize, pill.fontWeight, pill.borderRadius],
      pillFullWidth: document.querySelector("button")!.getBoundingClientRect().width,
      surface: [surface.backgroundColor, surface.borderRadius, surface.borderStyle, surface.boxShadow],
      title: [title.fontSize, title.fontWeight],
      track: [cs('[role="switch"]').width, cs('[role="switch"]').height, cs('[role="switch"]').backgroundColor],
      fonts: document.fonts.size,
    };
  });
  expect(look.bodyWidth).toBe(360);
  expect(look.canvas).toBe("rgb(238, 240, 244)");
  expect(look.pill).toEqual(["rgb(17, 19, 24)", "rgb(255, 255, 255)", "48px", "15px", "600", "999px"]);
  expect(look.pillFullWidth).toBe(360 - 2 * 16 - 2 * 20);
  expect(look.surface).toEqual([
    "rgb(255, 255, 255)",
    "18px",
    "none",
    "rgba(17, 19, 24, 0.04) 0px 1px 2px 0px, rgba(17, 19, 24, 0.06) 0px 8px 24px 0px",
  ]);
  expect(look.title).toEqual(["28px", "700"]);
  expect(look.track).toEqual(["40px", "24px", "rgb(214, 217, 224)"]);
  expect(look.fonts).toBe(0); // no web fonts
});

test("keyboard: Tab reaches the pill and both switches, each with the accent focus ring", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  const order = [
    popup.getByRole("button", { name: "Haunt this page" }),
    popup.getByRole("switch", { name: "Check links to other sites" }),
    popup.getByRole("switch", { name: "Sound effects" }),
  ];
  for (const control of order) {
    await popup.keyboard.press("Tab");
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline", "rgb(102, 51, 204) solid 2px");
    await expect(control).toHaveCSS("outline-offset", "2px");
  }
});

test("Check links to other sites is off by default and described", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  const sw1 = popup.getByRole("switch", { name: "Check links to other sites" });
  await expect(sw1).not.toBeChecked();
  await expect(sw1).toHaveAccessibleDescription("Asks Chrome to visit linked sites. Off.");
  // The grant/deny paths need Chrome's permission prompt, which Playwright cannot answer;
  // they are covered with a mocked chrome in test/popup.test.ts.
});

test("Sound effects: muted by default, persists across reopening the popup", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const tabId = await tabIdOf(sw, page);
  const first = await openPopup(context, extensionId, tabId);
  const sound = first.getByRole("switch", { name: "Sound effects" });
  await expect(sound).not.toBeChecked();
  await expect(sound).toHaveAccessibleDescription("Muted");
  await sound.check();
  await expect(sound).toHaveAccessibleDescription("On · plays only after you click");
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get("audioEnabled")).audioEnabled)).toBe(true);
  await first.close();

  const second = await openPopup(context, extensionId, tabId);
  const again = second.getByRole("switch", { name: "Sound effects" });
  await expect(again).toBeChecked();
  await expect(again).toHaveAccessibleDescription("On · plays only after you click");
});
