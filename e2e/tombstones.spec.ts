// Tombstones, backend side, on fixtures/links.html: same-origin dead links are found by the content
// script, reported to the background and counted in the HUD; the page is left byte for byte the same.
import { expect, fixture, haunt, openPopup, shadowOf, tabIdOf, test } from "./fixtures";
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

const SHOTS = "test-results/r7";
const BLOG = "/blog/2019/the-very-long-haunted-filename-that-must-not-break.html";

test("req 28-43, 46-48, 56-58: markers beside the dead links, the stone card wraps only at '/', Esc, the popup list", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("links.html"));
  const tabId = await tabIdOf(sw, page);
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  const popup = await openPopup(context, extensionId, tabId);
  const send = (type: "HAUNT" | "UNHAUNT") => popup.evaluate(([t, id]) => chrome.runtime.sendMessage({ type: t, tabId: id }), [type, tabId] as const);
  expect(await send("HAUNT")).toMatchObject({ haunted: true });
  await page.bringToFront();
  const inShadow = await shadowOf(page);

  // 17.2: after the 2300ms markers phase, one focusable stone per dead link, 4px after its link's last
  // line box, centred on it, over no page text.
  const markers = () =>
    inShadow(function () {
      const texts: DOMRect[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        texts.push(...[...r.getClientRects()].filter((x) => x.width > 0));
      }
      const layer = this.querySelector<HTMLElement>("#markers")!;
      return [...layer.querySelectorAll<HTMLElement>(".tomb-marker")].map((m) => {
        const b = m.getBoundingClientRect();
        const link = [...document.querySelectorAll("a")].find((a) => a.href === m.dataset.url)!;
        const last = [...link.getClientRects()].at(-1)!;
        return {
          url: new URL(m.dataset.url!).pathname,
          label: m.getAttribute("aria-label"),
          button: m.localName === "button" && m.tabIndex === 0,
          shown: getComputedStyle(m).display !== "none",
          size: [b.width, b.height],
          dx: b.left - last.right,
          dy: b.top + b.height / 2 - (last.top + last.height / 2),
          overText: texts.filter((t) => t.left < b.right && t.right > b.left && t.top < b.bottom && t.bottom > b.top).length,
          layerOpacity: getComputedStyle(layer).opacity,
        };
      });
    });
  await expect.poll(async () => (await markers()).map((m) => m.url)).toEqual(["/missing.html", "/gone/", BLOG]);
  await expect.poll(async () => (await markers())[0]!.layerOpacity, { timeout: 5000 }).toBe("1");
  for (const m of await markers()) {
    expect(m).toMatchObject({ button: true, shown: true, size: [16, 20], overText: 0 });
    expect(m.dx).toBeGreaterThanOrEqual(3.5);
    expect(m.dx).toBeLessThanOrEqual(4.5);
    expect(Math.abs(m.dy)).toBeLessThanOrEqual(1);
  }
  expect((await markers()).map((m) => m.label)).toEqual(["Dead link: /missing.html, 404", "Dead link: /gone/, 410", `Dead link: ${BLOG}, 404`]);
  await page.screenshot({ path: `${SHOTS}/desktop-1280-markers.png` });

  // 17.4: the stone card in #cards, the path broken only after a '/', a too-long filename cut at its start.
  const center = (url: string) =>
    inShadow(function (u: string) {
      const r = [...this.querySelectorAll<HTMLElement>(".tomb-marker")].find((m) => new URL(m.dataset.url!).pathname === u)!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, url);
  const stone = () =>
    inShadow(function () {
      const card = this.querySelector<HTMLElement>("#cards .tombstone-card");
      if (!card) return null;
      const path = card.querySelector<HTMLElement>(".path")!;
      const cs = getComputedStyle(card);
      const lineHeight = parseFloat(getComputedStyle(path).lineHeight);
      const segs = [...path.querySelectorAll<HTMLElement>(".seg")].map((s) => {
        // The segment's one text node: every line box it lands on gives it a rect at a new top.
        const range = document.createRange();
        range.selectNodeContents(s.querySelector("bdi")!.firstChild!);
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        const box = s.getBoundingClientRect();
        const t = range.getBoundingClientRect();
        return { text: s.textContent, lines: lines.size, next: s.nextSibling?.nodeName ?? null, cut: s.scrollWidth > s.clientWidth, endVisible: t.right <= box.right + 1, startHidden: t.left < box.left - 1, dir: getComputedStyle(s).direction };
      });
      const r = card.getBoundingClientRect();
      const ins = getComputedStyle(card.querySelector(".inscription")!);
      return {
        focused: card.contains(this.activeElement),
        text: card.innerText.replace(/\s+/g, " ").trim(),
        segs,
        pathText: path.textContent,
        pathLines: Math.round(path.getBoundingClientRect().height / lineHeight),
        wbr: path.querySelectorAll("wbr").length,
        look: [cs.width, cs.backgroundColor, cs.borderTopLeftRadius, cs.borderTopColor, cs.borderBottomColor, ins.color, ins.fontFamily.split(",")[0]],
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
        opacity: cs.opacity,
      };
    });
  let at = await center(BLOG);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await stone())?.opacity).toBe("1");
  const card = (await stone())!;
  expect(card.focused).toBe(true);
  expect(card.text).toContain("HERE LIES");
  expect(card.text).toContain("404 · Not Found");
  expect(card.pathText).toBe(BLOG);
  expect(card.wbr).toBe(3);
  expect(card.look).toEqual(["176px", "rgb(204, 204, 204)", "88px", "rgb(255, 255, 255)", "rgb(102, 102, 102)", "rgb(0, 0, 0)", `"Times New Roman"`]);
  expect(card.pathLines).toBeLessThanOrEqual(3);
  expect(card.segs.map((s) => s.text)).toEqual(["/", "blog/", "2019/", "the-very-long-haunted-filename-that-must-not-break.html"]);
  for (const s of card.segs) {
    expect(s.lines).toBe(1); // no line box ever breaks inside a segment
    expect(s.next).toBe(s.text!.endsWith("/") ? "WBR" : null);
    expect(s.dir).toBe("rtl");
  }
  expect(card.segs.at(-1)).toMatchObject({ cut: true, endVisible: true, startHidden: true }); // "…must-not-break.html"
  expect(card.rect.left).toBeGreaterThanOrEqual(8);
  expect(card.rect.right).toBeLessThanOrEqual(1280 - 8);
  await page.screenshot({ path: `${SHOTS}/desktop-1280-card.png` });

  // 17.5: Esc closes it and focus goes back to the marker that opened it.
  await page.keyboard.press("Escape");
  expect(await stone()).toBeNull();
  expect(await inShadow(function () {
    const a = this.activeElement as HTMLElement | null;
    return a?.classList.contains("tomb-marker") ? new URL(a.dataset.url!).pathname : null;
  })).toBe(BLOG);

  // Keyboard: Enter on the focused marker opens the card again with focus inside; Esc returns.
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await stone())?.focused).toBe(true);
  await page.keyboard.press("Escape");
  expect(await stone()).toBeNull();

  // At 375px the markers follow the resize and the card stays on screen with the same wrap.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(async () => (await markers()).every((m) => m.shown && Math.abs(m.dx - 4) <= 0.5 && Math.abs(m.dy) <= 1 && m.overText === 0)).toBe(true);
  at = await center(BLOG);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await stone())?.opacity).toBe("1");
  const narrow = (await stone())!;
  expect(narrow.rect.left).toBeGreaterThanOrEqual(8);
  expect(narrow.rect.right).toBeLessThanOrEqual(375 - 8);
  for (const s of narrow.segs) expect(s.lines).toBe(1);
  await page.screenshot({ path: `${SHOTS}/mobile-375-card.png` });
  await page.keyboard.press("Escape");

  // Scroll: markers follow their links, and a marker whose link is off screen is hidden.
  await page.setViewportSize({ width: 1280, height: 260 });
  const scrolled = async () => {
    const onScreen = await page.evaluate(() =>
      [...document.querySelectorAll("a")]
        .filter((a) => /missing|gone|blog/.test(a.href))
        .map((a) => { const r = a.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }),
    );
    return (await markers()).map((m, i) => (m.shown ? onScreen[i] && Math.abs(m.dx - 4) <= 0.5 && Math.abs(m.dy) <= 1 : !onScreen[i] && "hidden"));
  };
  await page.evaluate(() => window.scrollTo(0, 0)); // the list is below the fold: every stone hidden
  await expect.poll(scrolled).toEqual(["hidden", "hidden", "hidden"]);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); // scrolled to it: every stone back beside its link
  await expect.poll(scrolled).toEqual([true, true, true]);
  await page.setViewportSize({ width: 1280, height: 800 });

  // 17.6: the popup counts 3 tombstones and lists them after the vampires, each with its pill.
  await popup.bringToFront();
  await expect(popup.locator('[data-count="tombstones"] .num')).toHaveText("3");
  const rows = () => popup.locator(".tombstone-row").evaluateAll((rs) => rs.map((r) => [r.querySelector(".row-title")!.textContent, r.querySelector(".tag-pill")!.textContent]));
  await expect.poll(rows).toEqual([["/missing.html", "404"], ["/gone/", "410"], [BLOG, "404"]]);
  expect(
    await popup.evaluate(() => {
      const vamp = document.querySelector(".vampires-head, .no-vampires")!;
      return !!(vamp.compareDocumentPosition(document.querySelector(".tombstones-head")!) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  // At 360px nothing in a row spills; the long filename keeps its end; no segment breaks.
  const wrap = await popup.locator(".tombstone-row .row-title").evaluateAll((ts) =>
    ts.map((t) => ({
      overflow: t.scrollWidth > t.clientWidth,
      wbr: t.querySelectorAll("wbr").length,
      lines: [...t.querySelectorAll(".seg")].map((s) => {
        const r = document.createRange();
        r.selectNodeContents(s.querySelector("bdi")!.firstChild!);
        return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      }),
    })),
  );
  expect(wrap.map((w) => w.overflow)).toEqual([false, false, false]);
  expect(wrap.map((w) => w.wbr)).toEqual([1, 2, 3]);
  for (const w of wrap) for (const n of w.lines) expect(n).toBe(1);
  // Rows are reached with Tab and show the accent ring.
  let ring = "";
  for (let i = 0; i < 20 && !ring; i++) {
    await popup.keyboard.press("Tab");
    ring = await popup.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      if (!a.classList.contains("tombstone-row")) return "";
      const cs = getComputedStyle(a);
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} ${cs.outlineOffset}`;
    });
  }
  expect(ring).toBe("solid 2px rgb(102, 51, 204) 2px");
  // On to the last row (the list scrolls inside its surface to keep it in view) for the screenshot.
  await popup.keyboard.press("Tab");
  await popup.keyboard.press("Tab");
  expect(await popup.evaluate(() => document.activeElement!.querySelector(".row-title")?.textContent)).toBe(BLOG);
  await popup.screenshot({ path: `${SHOTS}/popup-360.png`, fullPage: true });

  // Un-haunt removes the markers and the page is byte-identical.
  expect(await send("UNHAUNT")).toMatchObject({ haunted: false });
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
});

test("req 35, 61-62: under reduced motion the markers appear with the cross-fade and never animate", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("links.html"));
  const tabId = await tabIdOf(sw, page);
  const popup = await openPopup(context, extensionId, tabId);
  await popup.evaluate((id) => chrome.runtime.sendMessage({ type: "HAUNT", tabId: id }), tabId);
  await page.bringToFront();
  const inShadow = await shadowOf(page);
  await expect.poll(() => inShadow(function () { return this.querySelectorAll(".tomb-marker").length; })).toBe(3);
  const anims = await inShadow(function () {
    return [this.querySelector("#markers")!, ...this.querySelectorAll(".tomb-marker")].flatMap((e) => e.getAnimations()).length;
  });
  expect(anims).toBe(0);
});

test("every open stone card keeps at least 8px from both viewport edges at 1280 and 375", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("links.html"));
  await haunt(sw, page);
  await page.bringToFront();
  const inShadow = await shadowOf(page);
  await expect.poll(() => inShadow(function () { return this.querySelectorAll(".tomb-marker").length; })).toBe(3);
  await page.waitForTimeout(2600); // the haunt moment settles
  await page.screenshot({ path: `${SHOTS}/edge-1280-haunted.png` });

  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const i of [0, 1, 2]) {
      const at = () =>
        inShadow(function (n: number) {
          const r = this.querySelectorAll<HTMLElement>(".tomb-marker")[n]!.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, i);
      await expect.poll(async () => (await at()).x).toBeLessThan(width); // the markers re-place on resize
      const p = await at();
      await page.mouse.click(p.x, p.y);
      const rect = () =>
        inShadow(function () {
          const card = this.querySelector<HTMLElement>("#cards .tombstone-card");
          if (!card || getComputedStyle(card).opacity !== "1") return null;
          const r = card.getBoundingClientRect();
          return { left: r.left, right: r.right };
        });
      await expect.poll(rect, { message: `stone ${i} at ${width}px, clicked ${JSON.stringify(p)}` }).not.toBeNull();
      const r = (await rect())!;
      expect(r.left, `stone ${i} at ${width}px`).toBeGreaterThanOrEqual(8);
      expect(r.right, `stone ${i} at ${width}px`).toBeLessThanOrEqual(width - 8);
      expect(r.right + 4, `stone ${i}'s 4px hard shadow at ${width}px`).toBeLessThanOrEqual(width - 8);
      if (i === 2) await page.screenshot({ path: `${SHOTS}/edge-${width}-card.png` });
      await page.keyboard.press("Escape");
    }
  }
});
