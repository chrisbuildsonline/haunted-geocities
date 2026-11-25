import type { Page, Worker } from "@playwright/test";
import { expect, fixture, UNHAUNT_TIMEOUT, haunt, openPopup, shadowOf, tabIdOf, test, type InShadow } from "./fixtures";

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

const settle = (page: Page) => page.waitForTimeout(3700);

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
  expect(look.layers.slice(0, 7)).toEqual(["starfield", "lanes", "markers", "top-bands", "hud", "graveyard", "cards"]);
  expect(look.fxGone).toBe(true);
  expect(look.gutters).toHaveLength(2);
  expect(look.gutters[0]).toBeGreaterThanOrEqual(64);
  expect(look.gutters[0]).toBeLessThanOrEqual(look.column.left + 1);
  expect(look.gutters[1]).toBeLessThanOrEqual(look.vw - look.column.right + 1);
  expect(look.gutterOpacity).toBe("0.92");
  expect(look.starTile).toBe(true);
  expect(look.bar).toEqual([0, 24, "rgb(51, 0, 102)", "rgb(255, 255, 204)"]);
  // The fixture is served from 127.0.0.1: an IP literal has the fixed Area51 address.
  expect(look.barText).toBe("You are in: Area51/Hangar/1998Strange lights, strange pages. Aliens welcome!");
  expect(look.sign).toEqual([48, 24]);
  expect(look.marquee).toEqual([24, 24, "rgb(0, 0, 51)", "rgb(102, 255, 153)"]);
  expect(look.marqueeRunning).toBe(true);
  expect(look.hud.bottom).toBe(look.vh - 8);
  expect(look.hud.width).toBeLessThanOrEqual(800);
  expect(look.hud.height).toBeGreaterThanOrEqual(40);
  expect(look.hud.shadow).toContain("rgb(0, 0, 0) 4px 4px 0px 0px");
  expect(look.hudText).toContain("Hide");
  expect(look.hudText).toContain("No ghosts here. Suspiciously clean.");
  expect(look.hudText).toContain("Souls counted");
  expect(look.hudText).toContain("tracker requests blocked or seen");
  expect(look.hudText).toContain("« prev | Haunted WebRing | next »");
});

/**
 * Pixels of the marquee's starfield showing inside the box of its text: a star is #ffffff or #ffff66,
 * the text #66ff99 with a #000000 shadow on #000033, so any pixel with red over 150 is a star.
 */
async function starsOnMarqueeText(page: Page, inShadow: InShadow): Promise<{ text: string; boxes: number; stars: number }> {
  const boxes = await inShadow(function () {
    const track = this.querySelector(".marquee-track")!;
    const range = document.createRange();
    range.selectNodeContents(track);
    const band = this.getElementById("marquee")!.getBoundingClientRect();
    return [...range.getClientRects()]
      .map((r) => ({ x: Math.max(r.left, band.left, 0), y: band.top, right: Math.min(r.right, band.right, innerWidth), bottom: band.bottom }))
      .filter((r) => r.right - r.x >= 1)
      .map((r) => ({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.floor(r.right - r.x), height: Math.floor(r.bottom - r.y) }));
  });
  let stars = 0;
  for (const clip of boxes) {
    const png = (await page.screenshot({ clip })).toString("base64");
    stars += await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      [c.width, c.height] = [img.width, img.height];
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! > 150) n++;
      return n;
    }, png);
  }
  const text = await inShadow(function () { return this.querySelector(".marquee-track")!.textContent!; });
  return { text, boxes: boxes.length, stars };
}

for (const width of [1280, 375]) {
  test(`marquee stars never sit on its text, moving or still, at ${width}px`, async ({ context, sw }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 800 });
    await page.goto(fixture("index.html"));
    await haunt(sw, page);
    await settle(page);
    const inShadow = await shadowOf(page);
    // Moving: hold the marquee at a few points of its run, the line wholly or partly on screen.
    for (const left of [width * 0.1, width * 0.5, -40]) {
      await inShadow(function (x: number) {
        const a = this.getAnimations().find((n) => (n as CSSAnimation).animationName === "hg-marquee")!;
        const t = a.effect!.getComputedTiming();
        const travel = this.querySelector<HTMLElement>(".marquee-track")!.getBoundingClientRect().width;
        const vw = this.getElementById("marquee")!.clientWidth;
        a.pause();
        // the text starts at vw and moves left by `travel` over the run
        a.currentTime = (a.effect!.getTiming().delay as number) + ((vw - x) / travel) * (t.duration as number);
      }, left);
      const moving = await starsOnMarqueeText(page, inShadow);
      expect(moving.boxes, `marquee text at ${left}px`).toBeGreaterThan(0);
      expect(moving.stars, `stars on the marquee text at ${left}px`).toBe(0);
    }
    await page.screenshot({ path: `test-results/costume/marquee-moving-${width}.png`, clip: { x: 0, y: 0, width, height: 48 } });
    // Still (reduced motion): the first line, static, on its plaque flush left.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => inShadow(function () { return this.getElementById("crypt-root")!.classList.contains("reduced-motion"); })).toBe(true);
    const still = await starsOnMarqueeText(page, inShadow);
    expect(still.boxes).toBeGreaterThan(0);
    expect(still.stars).toBe(0);
    // the band keeps its stars beside the line
    const band = await inShadow(function () { return getComputedStyle(this.getElementById("marquee")!).backgroundImage; });
    expect(band).toMatch(/^url\("data:image\/png/);
    await page.screenshot({ path: `test-results/costume/marquee-still-${width}.png`, clip: { x: 0, y: 0, width, height: 48 } });
  });
}

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
  await expect(popup.getByText("Idle", { exact: true })).toBeVisible({ timeout: UNHAUNT_TIMEOUT });
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
});

test("the Webmaster's Ghost wipe: mid-wipe and settled screenshots at 1280×800", async ({ context, sw }) => {
  test.setTimeout(60_000);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("index.html"));
  // Slow the page's animation clock 20× so ~450ms into the wipe (1150ms into the moment) can be caught reliably.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
  const start = Date.now();
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  await page.waitForTimeout(Math.max(0, 1150 * 20 - (Date.now() - start)));
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
