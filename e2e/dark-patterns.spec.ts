// Dark-pattern curses, end to end, on fixtures/dark-patterns.html (a fake coffee shop cart) at 1280 and 375:
// six CURSED! badges beside, never over, the text; their cards; the popup list; the HUD; un-haunt.
import { expect, fixture, openPopup, shadowOf, tabIdOf, test, type InShadow } from "./fixtures";
import type { BrowserContext, Page, Worker } from "@playwright/test";
import type { Curse, TabState } from "../src/data/types";

const WIDTHS = [1280, 375];
const KINDS = ["scarcity", "scarcity", "countdown", "timer", "prechecked", "confirmshaming"];
const TITLES = ["Cursed: Fake scarcity", "Cursed: Fake scarcity", "Cursed: Countdown", "Cursed: Ticking timer", "Cursed: Pre-checked opt-in", "Cursed: Confirmshaming"];
const ELEMENTS = ["#stock", "#viewers", "#sale", "#clock", "#optin", "#decline"]; // the page element of each badge, in order
const CLOCK = /Cart reserved for \d\d:\d\d/g;
const html = (page: Page) => page.evaluate(() => document.documentElement.outerHTML).then((h) => h.replace(CLOCK, "Cart reserved for MM:SS"));

type Ctx = { context: BrowserContext; sw: Worker; extensionId: string };

/** Open the shop at `width`, remember its markup, haunt through the popup. */
async function haunted({ context, sw, extensionId }: Ctx, width: number, path = "dark-patterns.html", reduced = false) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 1800 }); // tall: a badge whose element is off screen is hidden
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(fixture(path));
  const tabId = await tabIdOf(sw, page);
  const before = await html(page);
  const popup = await openPopup(context, extensionId, tabId);
  const send = (type: "HAUNT" | "UNHAUNT" | "GET_STATE") => popup.evaluate(([t, id]) => chrome.runtime.sendMessage({ type: t, tabId: id }), [type, tabId] as const);
  expect(await send("HAUNT")).toMatchObject({ haunted: true });
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  await page.bringToFront();
  const inShadow = await shadowOf(page);
  return { page, popup, tabId, before, send, inShadow };
}

const badgeKinds = (inShadow: InShadow) => inShadow(function () { return [...this.querySelectorAll<HTMLElement>("#markers .curse-badge")].map((b) => b.dataset.kind!); });
const waitForSix = (inShadow: InShadow) => expect.poll(() => badgeKinds(inShadow), { timeout: 10_000 }).toEqual(KINDS);
const badge = (inShadow: InShadow, i: number) =>
  inShadow(function (n: number) {
    const r = this.querySelectorAll("#markers .curse-badge")[n].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, i);
const card = (inShadow: InShadow) =>
  inShadow(function () {
    const c = this.querySelector<HTMLElement>("#cards .card");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { title: c.querySelector("h2")!.textContent, quote: c.querySelector(".quote")!.textContent, trick: c.querySelector(".trick")!.textContent, focused: c.contains(this.activeElement), left: r.left, right: r.right, vw: window.innerWidth };
  });
const activeKind = (inShadow: InShadow) => inShadow(function () { return (this.activeElement as HTMLElement | null)?.dataset.kind ?? null; });
const settled = (inShadow: InShadow) => expect.poll(() => inShadow(function () { return getComputedStyle(this.querySelector("#cards .card")!).opacity; })).toBe("1");
const hudCurses = (inShadow: InShadow) => inShadow(function () { return this.querySelector("#hud .count.curses .n")?.textContent; });

test("six curses appear on the fake shop at 1280 and 375", async ({ context, sw, extensionId }) => {
  for (const width of WIDTHS) {
    const { page, inShadow } = await haunted({ context, sw, extensionId }, width);
    await waitForSix(inShadow);
    await page.close();
  }
});

test("badges sit beside their elements and never over text at 1280 and 375", async ({ context, sw, extensionId }) => {
  for (const width of WIDTHS) {
    const { page, inShadow } = await haunted({ context, sw, extensionId }, width);
    await waitForSix(inShadow);
    await page.waitForTimeout(700); // the fade-in settles
    const geo = await inShadow(function (sels: string[]) {
      const texts: DOMRect[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        texts.push(...[...r.getClientRects()].filter((x) => x.width > 0));
      }
      return [...this.querySelectorAll<HTMLElement>("#markers .curse-badge")].map((b, i) => {
        const r = b.getBoundingClientRect();
        const range = document.createRange(); // line boxes of the text, not the block's full-width box
        range.selectNodeContents(document.querySelector(sels[i])!);
        const lines = [...range.getClientRects()].filter((x) => x.width > 0);
        const first = lines.reduce((a, x) => (x.top < a.top ? x : a));
        const last = lines.reduce((a, x) => (x.bottom > a.bottom ? x : a));
        const near = (a: number, c: number) => Math.abs(a - c) <= 0.5;
        const cy = r.top + r.height / 2;
        const withinLast = cy >= last.top - 0.5 && cy <= last.bottom + 0.5;
        return {
          height: r.height,
          shown: getComputedStyle(b).display !== "none",
          label: b.getAttribute("aria-label")!,
          a: near(r.left, last.right + 4) && withinLast,
          b: near(r.bottom, first.top - 4) && near(r.left, first.left),
          c: r.right <= first.left || r.left >= last.right, // a gutter lane beside the element
          over: texts.filter((t) => t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top).length,
          inside: r.left >= 0 && r.right <= window.innerWidth,
        };
      });
    }, ELEMENTS);
    expect(geo).toHaveLength(6);
    for (const g of geo) {
      expect(g).toMatchObject({ height: 18, shown: true, over: 0, inside: true });
      expect(g.label).toMatch(/^Cursed: /);
      expect(g.a || g.b || g.c).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.close();
  }
});

test("each badge opens its card with title, quote and trick", async ({ context, sw, extensionId }) => {
  const { page, inShadow } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  await page.waitForTimeout(700);
  for (let i = 0; i < 6; i++) {
    const at = await badge(inShadow, i);
    await page.mouse.click(at.x, at.y);
    await settled(inShadow);
    const c = (await card(inShadow))!;
    expect(c.title).toBe(TITLES[i]);
    expect(c.quote).toMatch(i === 3 ? /^“Cart reserved for \d\d:\d\d”$/ : /^“.+”$/);
    expect(c.trick!.length).toBeGreaterThan(10);
    expect(c.focused).toBe(true);
    await page.keyboard.press("Escape");
    expect(await card(inShadow)).toBeNull();
  }
});

test("Esc closes the card and focus returns to the badge", async ({ context, sw, extensionId }) => {
  const { page, inShadow } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  await page.waitForTimeout(700);
  const at = await badge(inShadow, 4);
  await page.mouse.click(at.x, at.y);
  expect((await card(inShadow))?.title).toBe("Cursed: Pre-checked opt-in");
  await page.keyboard.press("Escape");
  expect(await card(inShadow)).toBeNull();
  expect(await activeKind(inShadow)).toBe("prechecked");
});

test("Enter on a focused badge opens the card", async ({ context, sw, extensionId }) => {
  const { page, inShadow } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  await page.waitForTimeout(700);
  await inShadow(function () { this.querySelectorAll<HTMLElement>("#markers .curse-badge")[5].focus(); });
  expect(await activeKind(inShadow)).toBe("confirmshaming");
  await page.keyboard.press("Enter");
  expect((await card(inShadow))?.title).toBe("Cursed: Confirmshaming");
  await page.keyboard.press("Escape");
  expect(await card(inShadow)).toBeNull();
});

test("cards keep 8px from both viewport edges at 1280 and 375", async ({ context, sw, extensionId }) => {
  for (const width of WIDTHS) {
    const { page, inShadow } = await haunted({ context, sw, extensionId }, width);
    await waitForSix(inShadow);
    await page.waitForTimeout(700);
    for (let i = 0; i < 6; i++) {
      const at = await badge(inShadow, i);
      await page.mouse.click(at.x, at.y);
      await settled(inShadow);
      const c = (await card(inShadow))!;
      expect(c.left).toBeGreaterThanOrEqual(8);
      expect(c.vw - (c.right + 4)).toBeGreaterThanOrEqual(8); // the 4px hard shadow counts
      await page.keyboard.press("Escape");
    }
    await page.close();
  }
});

test("popup lists the six curses after tombstones", async ({ context, sw, extensionId }) => {
  const { popup, send } = await haunted({ context, sw, extensionId }, 1280);
  await popup.bringToFront();
  await expect(popup.locator('[data-count="curses"] .num')).toHaveText("6", { timeout: 10_000 });
  const rows = await popup.locator(".curse-row").evaluateAll((rs) => rs.map((r) => [r.querySelector(".row-title")!.textContent, r.querySelector(".row-sub")!.textContent]));
  expect(rows.map((r) => r[0])).toEqual(["Fake scarcity", "Fake scarcity", "Countdown", "Ticking timer", "Pre-checked opt-in", "Confirmshaming"]);
  for (const r of rows) expect(r[1]).toMatch(/^“.+”$/);
  expect(rows[3][1]).toMatch(/^“Cart reserved for \d\d:\d\d”$/);
  expect(
    await popup.evaluate(() => {
      const tomb = document.querySelector(".tombstones-head, .no-tombstones")!;
      return { empty: tomb.textContent, follows: !!(tomb.compareDocumentPosition(document.querySelector(".curses-head")!) & Node.DOCUMENT_POSITION_FOLLOWING) };
    }),
  ).toEqual({ empty: "No tombstones. Every link is alive.", follows: true });
  // A row is reached with Tab and shows the accent ring.
  let ring = "";
  for (let i = 0; i < 30 && !ring; i++) {
    await popup.keyboard.press("Tab");
    ring = await popup.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      if (!a.classList.contains("curse-row")) return "";
      const cs = getComputedStyle(a);
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} ${cs.outlineOffset}`;
    });
  }
  expect(ring).toBe("solid 2px rgb(102, 51, 204) 2px");
  expect(((await send("GET_STATE")) as TabState).curses).toHaveLength(6);
});

test("HUD curse count is 6", async ({ context, sw, extensionId }) => {
  const { inShadow } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  await expect.poll(() => hudCurses(inShadow)).toBe("6");
});

test("the session key holds the curses", async ({ context, sw, extensionId }) => {
  const { tabId, send, inShadow } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  const stored = () => sw.evaluate(async (id) => (await chrome.storage.session.get(`curses:${id}`))[`curses:${id}`] as Curse[] | undefined, tabId);
  await expect.poll(async () => (await stored())?.map((c) => c.kind)).toEqual(KINDS);
  expect(((await send("GET_STATE")) as TabState).curses).toEqual(await stored());
});

test("the pre-checked box stays checked", async ({ context, sw, extensionId }) => {
  const { page, inShadow, send } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  await page.waitForTimeout(700);
  const boxes = () =>
    page.evaluate(() => {
      const q = (n: string) => document.querySelector<HTMLInputElement>(`input[name=${n}]`)!;
      return { news: [q("news").checked, q("news").hasAttribute("checked")], remember: q("remember").checked, restock: q("restock").checked };
    });
  const expected = { news: [true, true], remember: true, restock: false };
  expect(await boxes()).toEqual(expected);
  const at = await badge(inShadow, 4);
  await page.mouse.click(at.x, at.y);
  expect(await boxes()).toEqual(expected);
  await page.keyboard.press("Escape");
  await send("UNHAUNT");
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await boxes()).toEqual(expected);
});

test("un-haunt leaves the page byte-identical and clears the curses", async ({ context, sw, extensionId }) => {
  const { page, tabId, before, send, inShadow } = await haunted({ context, sw, extensionId }, 1280);
  await waitForSix(inShadow);
  expect(((await send("UNHAUNT")) as TabState).haunted).toBe(false);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(((await send("GET_STATE")) as TabState).curses).toEqual([]);
  expect(await sw.evaluate(async (id) => `curses:${id}` in (await chrome.storage.session.get(`curses:${id}`)), tabId)).toBe(false);
  expect(await html(page)).toBe(before);
});

test("a clean page shows the empty curse line", async ({ context, sw, extensionId }) => {
  const { page, popup, inShadow } = await haunted({ context, sw, extensionId }, 1280, "clean.html");
  await popup.bringToFront();
  await expect(popup.getByText("No curses. This page plays fair.")).toBeVisible();
  await expect(popup.locator('[data-count="curses"] .num')).toHaveText("0");
  await page.waitForTimeout(1500);
  await expect.poll(() => hudCurses(inShadow)).toBe("0");
  expect(await badgeKinds(inShadow)).toEqual([]);
});

test("under reduced motion badges and the card do not animate", async ({ context, sw, extensionId }) => {
  const { page, inShadow } = await haunted({ context, sw, extensionId }, 1280, "dark-patterns.html", true);
  await waitForSix(inShadow);
  const running = () =>
    inShadow(function () {
      return [...this.querySelectorAll("#markers .curse-badge, #cards .card")].reduce((n, e) => n + e.getAnimations().length, 0);
    });
  expect(await running()).toBe(0);
  const at = await badge(inShadow, 0);
  await page.mouse.click(at.x, at.y);
  expect((await card(inShadow))?.title).toBe("Cursed: Fake scarcity");
  expect(await running()).toBe(0);
});
