// Tombstones, backend side, on fixtures/links.html: same-origin dead links are found by the content
// script, reported to the background and counted in the HUD; the page is left byte for byte the same.
import { expect, fixture, openPopup, shadowOf, tabIdOf, test } from "./fixtures";
import type { DeadLink } from "../src/data/types";

test("req 49-50, 12, 23-27, 44, 55: only the 404/410 links become tombstones, counted in the HUD, page restored", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("links.html"));
  const tabId = await tabIdOf(sw, page);
  const before = await page.evaluate(() => document.documentElement.outerHTML);

  const popup = await openPopup(context, extensionId, tabId);
  const send = (type: "HAUNT" | "UNHAUNT" | "GET_STATE") => popup.evaluate(([t, id]) => chrome.runtime.sendMessage({ type: t, tabId: id }), [type, tabId] as const);
  expect(await send("HAUNT")).toMatchObject({ haunted: true });
  await expect(page.locator("hg-crypt")).toHaveCount(1);

  const origin = new URL(fixture("")).origin;
  const expected: DeadLink[] = [
    { url: `${origin}/missing.html`, path: "/missing.html", status: 404 },
    { url: `${origin}/gone/`, path: "/gone/", status: 410 },
    { url: `${origin}/blog/2019/the-very-long-haunted-filename-that-must-not-break.html`, path: "/blog/2019/the-very-long-haunted-filename-that-must-not-break.html", status: 404 },
  ];
  // GET_STATE through the router, as the popup asks for it.
  await expect.poll(async () => ((await send("GET_STATE")) as { tombstones: DeadLink[] }).tombstones).toEqual(expected);
  expect(await sw.evaluate(async (id) => (await chrome.storage.session.get(`tombstones:${id}`))[`tombstones:${id}`], tabId)).toEqual(expected);

  const inShadow = await shadowOf(page);
  await expect
    .poll(() => inShadow(function () { return this.querySelector("#hud .count.tombstones .n")?.textContent; }))
    .toBe("3");

  expect(await send("UNHAUNT")).toMatchObject({ haunted: false, tombstones: [] });
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
  expect(await sw.evaluate(async (id) => `tombstones:${id}` in (await chrome.storage.session.get(`tombstones:${id}`)), tabId)).toBe(false);
});
