import type { Page, Worker } from "@playwright/test";
import { expect, fixture, openPopup, tabIdOf, test } from "./fixtures";

// The costume lives in a closed shadow root, so page scripts cannot reach it. The DevTools
// protocol can: DOM.getDocument({ pierce: true }) lists closed shadow roots, and resolveNode
// hands one to the page's main world, where `fn` runs with `this` bound to it.
type InShadow = <R, A = undefined>(fn: (this: ShadowRoot, arg: A) => R | Promise<R>, arg?: A) => Promise<R>;

async function shadowOf(page: Page): Promise<InShadow> {
  const cdp = await page.context().newCDPSession(page);
  type Node = { localName?: string; children?: Node[]; shadowRoots?: { backendNodeId: number }[] };
  const { root } = (await cdp.send("DOM.getDocument", { depth: -1, pierce: true })) as { root: Node };
  const find = (n: Node): Node | undefined =>
    n.localName === "hg-crypt" ? n : (n.children ?? []).map(find).find(Boolean);
  const host = find(root);
  if (!host?.shadowRoots?.[0]) throw new Error("no <hg-crypt> shadow root");
  const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: host.shadowRoots[0].backendNodeId });
  return async (fn, arg) => {
    const r = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId!,
      functionDeclaration: fn.toString(),
      arguments: [{ value: arg }],
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
}

/** Haunt the way the background does (inject content.js), keeping the page in front. */
async function haunt(sw: Worker, page: Page): Promise<number> {
  const tabId = await tabIdOf(sw, page);
  await sw.evaluate(async (id) => {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content.js"] });
  }, tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  return tabId;
}

/** Un-haunt the way the background does; resolves when the content script answers. */
async function unhaunt(sw: Worker, tabId: number) {
  await sw.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { type: "unhaunt" });
  }, tabId);
}

const center = async (inShadow: InShadow, selector: string) =>
  inShadow(function (sel: string) {
    const r = this.querySelector(sel)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);

const settle = (page: Page) => page.waitForTimeout(2600);

test("haunt renders the starfield gutters, top bands and HUD inside the closed shadow root", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("index.html"));
  await haunt(sw, page);
  await settle(page);
  const inShadow = await shadowOf(page);
  const look = await inShadow(function () {
    const q = (s: string) => this.querySelector(s) as HTMLElement | null;
    const box = (s: string) => q(s)!.getBoundingClientRect().toJSON();
    const cs = (s: string) => getComputedStyle(q(s)!);
    const gutters = [...this.querySelectorAll(".gutter")].filter((g) => !(g as HTMLElement).hidden);
    return {
      layers: [...q("#crypt-root")!.children].map((c) => c.id),
      gutters: gutters.map((g) => g.getBoundingClientRect().width),
      gutterOpacity: getComputedStyle(gutters[0]!).opacity,
      starTile: cs(".gutter .fill").backgroundImage.startsWith('url("data:image/png'),
      bar: [box("#neighborhood").top, box("#neighborhood").height, cs("#neighborhood").backgroundColor, cs("#neighborhood").color],
      barText: q("#neighborhood")!.textContent,
      sign: [box(".sign").width, box(".sign").height],
      marquee: [box("#marquee").top, box("#marquee").height, cs("#marquee").backgroundColor, cs("#marquee").color],
      marqueeRunning: this.getAnimations().some((a) => (a as CSSAnimation).animationName === "hg-marquee" && a.playState === "running"),
      hud: { bottom: box("#hud").bottom, width: box("#hud").width, height: box("#hud").height, shadow: cs("#hud").boxShadow },
      hudText: q("#hud")!.innerText.replace(/\s+/g, " "),
      fxGone: q("#fx") === null,
      column: (() => {
        const m = document.querySelector("main")!.getBoundingClientRect();
        return { left: m.left, right: m.right };
      })(),
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  expect(look.layers.slice(0, 6)).toEqual(["starfield", "lanes", "markers", "top-bands", "hud", "cards"]);
  expect(look.fxGone).toBe(true);
  expect(look.gutters).toHaveLength(2);
  expect(look.gutters[0]).toBeGreaterThanOrEqual(64);
  expect(look.gutters[0]).toBeLessThanOrEqual(look.column.left + 1);
  expect(look.gutters[1]).toBeLessThanOrEqual(look.vw - look.column.right + 1);
  expect(look.gutterOpacity).toBe("0.92");
  expect(look.starTile).toBe(true);
  expect(look.bar).toEqual([0, 24, "rgb(51, 0, 102)", "rgb(255, 255, 204)"]);
  expect(look.barText).toMatch(/You are in: \w+\/Vault\/\d{4}/);
  expect(look.sign).toEqual([48, 24]);
  expect(look.marquee).toEqual([24, 24, "rgb(0, 0, 51)", "rgb(102, 255, 153)"]);
  expect(look.marqueeRunning).toBe(true);
  expect(look.hud.bottom).toBe(look.vh - 8);
  expect(look.hud.width).toBeLessThanOrEqual(720);
  expect(look.hud.height).toBeGreaterThanOrEqual(40);
  expect(look.hud.shadow).toContain("rgb(0, 0, 0) 4px 4px 0px 0px");
  expect(look.hudText).toContain("Hide");
  expect(look.hudText).toContain("No ghosts here. Suspiciously clean.");
  expect(look.hudText).toContain("Souls counted:");
  expect(look.hudText).toContain("« prev | Haunted WebRing | next »");
});

test("body padding grows on haunt (bands + HUD + lift over a fixed cookie bar) and is restored on un-haunt", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("column.html"));
  const pad = () => page.evaluate(() => [getComputedStyle(document.body).paddingTop, getComputedStyle(document.body).paddingBottom]);
  const before = await pad();
  expect(before).toEqual(["24px", "0px"]);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const tabId = await haunt(sw, page);
  await settle(page);
  const inShadow = await shadowOf(page);
  const hud = await inShadow(function () {
    const r = this.getElementById("hud")!.getBoundingClientRect();
    return { bottom: r.bottom, height: r.height };
  });
  const cookieTop = await page.evaluate(() => document.querySelector(".cookie")!.getBoundingClientRect().top);
  expect(hud.bottom).toBe(cookieTop - 8); // lifted above the cookie bar
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--hg-lift").trim())).toBe("56px");
  expect(await pad()).toEqual(["72px", `${Math.round(hud.height) + 16 + 56}px`]);

  await unhaunt(sw, tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await pad()).toEqual(before);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(html);
});

test("Hide fades the costume to a Show tab; Show brings it back; both work from the keyboard with the costume focus ring", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("column.html"));
  await haunt(sw, page);
  await settle(page);
  const inShadow = await shadowOf(page);
  const state = () =>
    inShadow(function () {
      const tab = this.getElementById("show-tab")!;
      return {
        hidden: this.getElementById("crypt-root")!.classList.contains("costume-hidden"),
        hudOpacity: getComputedStyle(this.getElementById("hud")!).opacity,
        bandsOpacity: getComputedStyle(this.getElementById("top-bands")!).opacity,
        tab: tab.hidden ? null : (({ width, height, right, bottom }) => ({ width, height, right, bottom }))(tab.getBoundingClientRect()),
        focused: (this.activeElement as HTMLElement | null)?.className ?? null,
      };
    });

  const hide = await center(inShadow, "#hud button.hide");
  await page.mouse.click(hide.x, hide.y);
  await expect.poll(async () => (await state()).hudOpacity).toBe("0");
  const hidden = await state();
  expect(hidden.hidden).toBe(true);
  expect(hidden.bandsOpacity).toBe("0");
  expect(hidden.tab).toEqual({ width: 40, height: 40, right: 1280 - 8, bottom: 800 - 8 - 56 });
  expect(await page.locator("hg-crypt").count()).toBe(1);

  const tab = await center(inShadow, "#show-tab");
  await page.mouse.click(tab.x, tab.y);
  await expect.poll(async () => (await state()).hudOpacity).toBe("1");
  expect((await state()).tab).toBeNull();

  // keyboard: the page's own controls first, then the costume's
  await page.mouse.click(5, 300);
  await page.keyboard.press("Tab"); // archive link
  await page.keyboard.press("Tab"); // cookie button
  await page.keyboard.press("Tab"); // Hide
  const ring = () =>
    inShadow(function () {
      const el = this.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { label: el.getAttribute("aria-label") ?? el.textContent, outline: cs.outline, offset: cs.outlineOffset, shadow: cs.boxShadow };
    });
  const ringOf = { outline: "rgb(255, 255, 102) dotted 2px", offset: "2px", shadow: "rgb(0, 0, 0) 0px 0px 0px 5px" };
  expect(await ring()).toEqual({ label: "Hide", ...ringOf });
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await ring())?.label).toBe("Show the haunted costume");
  expect(await ring()).toMatchObject(ringOf);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await state()).hidden).toBe(false);
  expect((await ring())?.label).toBe("Hide");
  await page.keyboard.press("Tab");
  expect(await ring()).toEqual({ label: "« prev", ...ringOf });
  await page.keyboard.press("Tab");
  expect(await ring()).toEqual({ label: "next »", ...ringOf });
});

test("page links stay clickable while haunted", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("column.html"));
  await haunt(sw, page);
  await settle(page);
  await page.locator("#archive").click(); // Playwright fails this if the overlay intercepts the click
  await expect(page).toHaveURL(/\/clean\.html$/);
});

test("un-haunt from the popup plays out, then restores the page byte for byte", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("index.html"));
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.getByText("Haunted", { exact: true })).toBeVisible();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(1);
  await popup.getByRole("button", { name: "Un-haunt" }).click();
  await expect(popup.getByText("Idle", { exact: true })).toBeVisible();
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
});

test("the Webmaster's Ghost wipe: mid-wipe and settled screenshots at 1280×800", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("index.html"));
  // Slow the page's animation clock 20× so ~650ms into the wipe can be caught reliably.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
  const start = Date.now();
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  await page.waitForTimeout(Math.max(0, 650 * 20 - (Date.now() - start)));
  const mid = await inShadow(function () {
    const ghost = this.querySelector(".webmaster")!.getBoundingClientRect();
    const anims = this.getAnimations().filter((a) => !(a as CSSAnimation).animationName);
    return { count: anims.length, ghostX: ghost.left + ghost.width / 2, ghostSize: [Math.round(ghost.width), Math.round(ghost.height)] };
  });
  await page.screenshot({ path: "test-results/costume/desktop-midwipe.png" });
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  expect(mid.count).toBeGreaterThan(5);
  expect(mid.ghostSize).toEqual([96, 96]);
  expect(mid.ghostX).toBeGreaterThan(200);
  expect(mid.ghostX).toBeLessThan(1080);
  await settle(page);
  expect(await inShadow(function () { return this.getElementById("fx") === null; })).toBe(true);
  await page.screenshot({ path: "test-results/costume/desktop-settled.png" });
});

test("prefers-reduced-motion: a cross-fade, no ghost, a static marquee", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(fixture("index.html"));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 }); // 300ms becomes 6s, so we can see it
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  const seen = await inShadow(function () {
    return {
      anims: this.getAnimations().map((a) => ({
        css: !!(a as CSSAnimation).animationName,
        target: ((a.effect as KeyframeEffect).target as HTMLElement).id,
        duration: (a.effect as KeyframeEffect).getTiming().duration,
        props: (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)),
      })),
      ghost: this.querySelector(".webmaster") !== null,
      reduced: this.getElementById("crypt-root")!.classList.contains("reduced-motion"),
    };
  });
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  expect(seen.reduced).toBe(true);
  expect(seen.ghost).toBe(false);
  expect(seen.anims.map(({ css, target, duration }) => ({ css, target, duration }))).toEqual([
    { css: false, target: "crypt-root", duration: 300 },
  ]);
  expect(new Set(seen.anims[0]!.props)).toEqual(new Set(["opacity"]));
  await page.waitForTimeout(400);
  const marquee = await inShadow(function () {
    const t = this.querySelector(".marquee-track")!;
    const cs = getComputedStyle(t);
    return { animation: cs.animationName, overflow: cs.textOverflow, running: this.getAnimations().length };
  });
  expect(marquee).toEqual({ animation: "none", overflow: "ellipsis", running: 0 });
});

test("at 375×740 the HUD wraps to two rows at most and nothing scrolls sideways", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(fixture("column.html"));
  await haunt(sw, page);
  await settle(page);
  const inShadow = await shadowOf(page);
  const hud = await inShadow(function () {
    const h = this.getElementById("hud")!;
    const r = h.getBoundingClientRect();
    // rows = clusters of item centres more than 8px apart
    const centres = [...h.children]
      .map((c) => c.getBoundingClientRect())
      .filter((b) => b.height > 0)
      .map((b) => b.top + b.height / 2)
      .sort((a, b) => a - b);
    const rows = centres.filter((c, i) => i === 0 || c - centres[i - 1]! > 8).length;
    return { left: r.left, right: r.right, height: r.height, rows };
  });
  await page.screenshot({ path: "test-results/costume/mobile-settled.png" });
  expect(hud.left).toBe(4);
  expect(hud.right).toBe(375 - 4);
  expect(hud.height).toBeLessThanOrEqual(88);
  expect(hud.rows).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
