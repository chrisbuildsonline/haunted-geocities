// The haunt changes nothing on the page outside its own <hg-crypt> host: no node, attribute or text is
// added, removed or edited (a MutationObserver watches the whole document from before the haunt), and
// the page's scripts and forms keep working. Runtime vampires 12.1, tombstones 13.3 and 13.4.
import type { Page } from "@playwright/test";
import { expect, fixture, openPopup, shadowOf, tabIdOf, test } from "./fixtures";

/** Start recording every document mutation, ignoring only the host itself being attached or removed. */
const watch = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __mutations: MutationRecord[]; __observer: MutationObserver };
    w.__mutations = [];
    w.__observer = new MutationObserver((records) => w.__mutations.push(...records));
    w.__observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });

/** Mutations so far that are not the host appearing or disappearing, described as text. */
const mutations = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __mutations: MutationRecord[]; __observer: MutationObserver };
    w.__mutations.push(...w.__observer.takeRecords());
    return w.__mutations
      .filter((m) => !(m.type === "childList" && m.target === document.documentElement && [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeName === "HG-CRYPT")))
      .map((m) => `${m.type} on <${(m.target as Element).localName ?? m.target.nodeName}> ${m.attributeName ?? ""} +${m.addedNodes.length} -${m.removedNodes.length}`);
  });

/** The page's markup with the host taken out, plus its scripts and forms on their own. */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("hg-crypt").forEach((h) => h.remove());
    return {
      html: clone.outerHTML,
      scripts: [...document.scripts].map((s) => s.outerHTML),
      forms: [...document.forms].map((f) => f.outerHTML),
    };
  });

test("12.1: haunting, being fingerprinted by two scripts, opening a card and un-haunting change no page node", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("vampires.html"));
  const tabId = await tabIdOf(sw, page);
  const before = await snapshot(page);
  expect(before.scripts).toHaveLength(2);
  expect(before.forms).toHaveLength(1);
  await watch(page);

  const popup = await openPopup(context, extensionId, tabId);
  const send = (type: "HAUNT" | "UNHAUNT") => popup.evaluate(([t, id]) => chrome.runtime.sendMessage({ type: t, tabId: id }), [type, tabId] as const);
  expect(await send("HAUNT")).toMatchObject({ haunted: true });
  await expect(page.locator("hg-crypt")).toHaveCount(1);

  // The hooks are live: both scripts fingerprint on focus and show up as vampires.
  await page.bringToFront();
  await page.locator("#email").focus();
  await page.waitForFunction(() => (window as unknown as { fpDone: number }).fpDone === 2);
  const inShadow = await shadowOf(page);
  await expect.poll(() => inShadow(function () { return this.querySelectorAll("#lanes .vampire").length; })).toBe(2);
  await inShadow(function () { (this.querySelector("#lanes .vampire") as HTMLElement).click(); });
  await expect.poll(() => inShadow(function () { return this.querySelectorAll("#cards .card").length; })).toBe(1);

  expect(await mutations(page)).toEqual([]);
  expect(await snapshot(page)).toEqual(before);

  expect(await send("UNHAUNT")).toMatchObject({ haunted: false });
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await mutations(page)).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
});

test("tombstones 13.3 and 13.4: scripts keep running in order and forms still submit while links are checked and marked", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("forms.html"));
  const tabId = await tabIdOf(sw, page);
  const before = await snapshot(page);
  expect(before.scripts).toHaveLength(3);
  expect(before.forms).toHaveLength(2);
  const order = () => page.evaluate(() => (window as unknown as { order: string[] }).order);
  expect(await order()).toEqual(["head", "body", "end"]);
  await watch(page);

  const popup = await openPopup(context, extensionId, tabId);
  const send = (type: "HAUNT" | "UNHAUNT") => popup.evaluate(([t, id]) => chrome.runtime.sendMessage({ type: t, tabId: id }), [type, tabId] as const);
  expect(await send("HAUNT")).toMatchObject({ haunted: true });
  await page.bringToFront();
  const inShadow = await shadowOf(page);
  // The link check has finished and the stone is placed: the costume did all it does to a page with a dead link.
  await expect.poll(() => inShadow(function () { return this.querySelector("#hud .count.tombstones .n")?.textContent; })).toBe("1");
  await expect.poll(() => inShadow(function () { return this.querySelectorAll("#markers .tomb-marker").length; })).toBe(1);

  // Scripts: same tags in the same order, no mutation anywhere, and none was re-run or blocked.
  expect(await mutations(page)).toEqual([]);
  const during = await snapshot(page);
  expect(during.scripts).toEqual(before.scripts);
  expect(during.html).toBe(before.html);
  expect(await order()).toEqual(["head", "body", "end"]);

  // Forms: the markup is untouched, the page's own submit handler still runs and cancels, and a form
  // without a handler still navigates the way the browser does it.
  expect(during.forms).toEqual(before.forms);
  await page.locator("#g").fill("hello");
  await page.locator("#g").press("Enter");
  await expect.poll(() => page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(1);
  expect(page.url()).toBe(fixture("forms.html"));
  await page.locator("#q").fill("moss");
  await Promise.all([page.waitForURL(fixture("thanks.html?q=moss"), { timeout: 5000 }), page.locator("#q").press("Enter")]);
});
