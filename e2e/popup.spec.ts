import { expect, fixture, openPopup, tabIdOf, test } from "./fixtures";

const ATTRIBUTION = "Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0";

test("popup shows idle screen then haunted screen after Haunt", async ({ context, sw, extensionId }) => {
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
  // Inside the group box: 3px window frame, 8px client padding, 2px etch, 12px group padding.
  expect(labelBoxes.at(-1).right).toBeLessThanOrEqual(360 - 3 - 8 - 2 - 12);
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

test("the popup wears the Win95 costume", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  const look = await popup.evaluate(() => {
    const cs = (sel: string) => getComputedStyle(document.querySelector(sel)!);
    const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const button = cs("button.primary");
    const group = cs("fieldset.group");
    const bar = cs(".titlebar");
    const title = cs("h1");
    const check = cs('[role="switch"]');
    return {
      bodyWidth: document.body.getBoundingClientRect().width,
      face: getComputedStyle(document.body).backgroundColor,
      window: cs("#app").boxShadow,
      titlebar: [bar.backgroundColor, bar.color, bar.height, bar.fontSize, bar.fontWeight],
      button: [button.backgroundColor, button.color, button.height, button.fontSize, button.fontWeight, button.borderRadius],
      buttonFrame: button.boxShadow.startsWith("rgb(0, 0, 0) 0px 0px 0px 1px"),
      buttonFullWidth: rect("button.primary").width === rect("fieldset.group").width - 2 * 1 - 2 * 12,
      group: [group.borderTopStyle, group.borderTopColor, group.borderRadius],
      title: [title.fontSize, title.fontWeight, title.fontFamily],
      check: [check.width, check.height, check.backgroundColor, check.borderRadius],
      statusAtBottom: Math.round(rect(".statusbar").bottom) === Math.round(rect("#app").bottom) - 3,
      fonts: document.fonts.size,
    };
  });
  expect(look.bodyWidth).toBe(360);
  expect(look.face).toBe("rgb(192, 192, 192)");
  expect(look.window).toBe(
    "rgb(0, 0, 0) -1px -1px 0px 0px inset, rgb(255, 255, 255) 1px 1px 0px 0px inset, rgb(128, 128, 128) -2px -2px 0px 0px inset, rgb(223, 223, 223) 2px 2px 0px 0px inset",
  );
  expect(look.titlebar).toEqual(["rgb(0, 0, 128)", "rgb(255, 255, 255)", "24px", "13px", "700"]);
  expect(look.button).toEqual(["rgb(192, 192, 192)", "rgb(0, 0, 0)", "40px", "13px", "700", "0px"]);
  expect(look.buttonFrame).toBe(true);
  expect(look.buttonFullWidth).toBe(true);
  expect(look.group).toEqual(["solid", "rgb(128, 128, 128)", "0px"]);
  expect(look.title).toEqual(["24px", "700", '"Times New Roman", Times, serif']);
  expect(look.check).toEqual(["13px", "13px", "rgb(255, 255, 255)", "0px"]);
  expect(look.statusAtBottom).toBe(true);
  expect(look.fonts).toBe(0); // no web fonts
});

test("keyboard: Tab reaches the primary button and both checkboxes, each with the accent focus ring", async ({ context, sw, extensionId }) => {
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
