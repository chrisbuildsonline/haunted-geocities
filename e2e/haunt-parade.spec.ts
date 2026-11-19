// The scene-wide part of the haunt moment: six big tracker ghosts drift up through the whole page and
// one band of scanlines rolls down it (design/DESIGN.md "Haunt moment", the parade and the roll).
// Under reduced motion neither exists, and the settled costume is the same either way.
import type { Page } from "@playwright/test";
import { expect, fixture, haunt, shadowOf, test } from "./fixtures";

const OUT = "test-results/hero";

// `query` keeps two open tabs on different URLs: tabIdOf finds a tab by its URL.
async function openNews(page: Page, width: number, query = "") {
  await page.setViewportSize({ width, height: width >= 1280 ? 800 : 667 });
  await page.goto(fixture(`news.html${query}`));
  await page.waitForLoadState("load");
}

type Box = { left: number; top: number; bottom: number; width: number };
const visible = (b: Box, vw: number, vh: number) => b.bottom > 0 && b.top < vh && b.left + b.width > 0 && b.left < vw;

/** The companies the costume shows (lanes and graveyard strip), in lane order. */
const companiesShown = (inShadow: Awaited<ReturnType<typeof shadowOf>>) =>
  inShadow(function () {
    return [...this.querySelectorAll<HTMLElement>("#lanes > [data-company], #graveyard [data-company]")].map((g) => g.dataset.company!);
  });

/** The parade as drawn: company (null for a filler), its name tag's text and its tint. */
const paradeDrawn = (inShadow: Awaited<ReturnType<typeof shadowOf>>) =>
  inShadow(function () {
    return [...this.querySelectorAll<HTMLElement>("#fx .parade > .spirit")].map((s) => ({
      company: s.dataset.company ?? null,
      name: s.querySelector(".name")?.textContent ?? null,
      filler: s.hasAttribute("data-filler"),
    }));
  });

for (const width of [1280, 700] as const) {
  test(`@${width}: six big ghosts, the page's own tracker companies with their names, cross the whole page bottom to top, a scanline roll passes once, no overflow`, async ({ context, sw }) => {
    test.setTimeout(90_000);
    const page = await context.newPage();
    await openNews(page, width);
    // The page's animation clock at a fifth of real time, so every spirit is sampled on its way.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
    await haunt(sw, page);
    const inShadow = await shadowOf(page);
    // news.html loads six tracker companies before the haunt: every parade ghost is one of them, named
    const drawn = await paradeDrawn(inShadow);
    const shown = await companiesShown(inShadow);
    expect(shown).toHaveLength(6);
    expect(drawn.map((d) => d.company).sort()).toEqual([...shown].sort());
    expect(drawn.map((d) => d.name)).toEqual(drawn.map((d) => d.company));
    expect(drawn.some((d) => d.filler)).toBe(false);

    type Sample = { fx: boolean; spirits: Box[]; roll: Box | null; overflow: boolean; vh: number; vw: number };
    const samples: Sample[] = [];
    let shot = false;
    for (const end = Date.now() + 45_000; Date.now() < end; await page.waitForTimeout(40)) {
      const s: Sample = await inShadow(function () {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
        };
        const roll = this.querySelector("#fx .roll");
        return {
          fx: !!this.getElementById("fx"),
          spirits: [...this.querySelectorAll("#fx .parade > .spirit")].map(box),
          roll: roll ? box(roll) : null,
          overflow: document.documentElement.scrollWidth > innerWidth,
          vh: innerHeight,
          vw: innerWidth,
        };
      });
      samples.push(s);
      const onScreen = s.spirits.filter((b) => visible(b, s.vw, s.vh)).length;
      if (!shot && onScreen >= 4) {
        shot = true;
        await page.screenshot({ path: `${OUT}/parade-${width}.png` });
      }
      if (!s.fx) break;
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

    const live = samples.filter((s) => s.fx);
    const { vh, vw } = samples[0]!;
    // six spirits, the near ones 144px and the far ones 96px, all inside the page's width
    const [near, far] = [144, 96];
    expect(live[0]!.spirits.map((b) => Math.round(b.width)).sort()).toEqual([near, near, near, far, far, far].sort());
    for (const b of live[0]!.spirits) expect(b.left + b.width).toBeLessThanOrEqual(vw + 48);
    // each one is seen low on the page and later high on it: a crossing of the whole height
    for (let i = 0; i < 6; i++) {
      const tops = live.map((s) => s.spirits[i]!.top);
      const low = tops.findIndex((t) => t > vh * 0.6 && t < vh);
      const high = tops.some((t, n) => n > low && t < vh * 0.2 && t > -live[0]!.spirits[i]!.width);
      expect({ i, low: low >= 0, high }).toEqual({ i, low: true, high: true });
    }
    // they spread across the width: centres in the left and right thirds
    const centres = live[0]!.spirits.map((b) => b.left + b.width / 2);
    expect(Math.min(...centres)).toBeLessThan(vw / 3);
    expect(Math.max(...centres)).toBeGreaterThan((2 * vw) / 3);
    // the roll band passes the top third, then the bottom third, once
    const rollTops = live.map((s) => s.roll!.top);
    const upper = rollTops.findIndex((t) => t >= 0 && t < vh / 3);
    const lower = rollTops.findIndex((t) => t > (2 * vh) / 3 && t < vh);
    expect(upper).toBeGreaterThanOrEqual(0);
    expect(lower).toBeGreaterThan(upper);
    // nothing pushes the page sideways while it plays, and the FX root is gone at the end
    expect(samples.some((s) => s.overflow)).toBe(false);
    expect(samples.at(-1)!.fx).toBe(false);
    expect(shot).toBe(true);
  });
}

test("@375: the parade keeps off the reading column, a train of six 48/32px ghosts along the top bands, never over the page's text", async ({ context, sw }) => {
  test.setTimeout(90_000);
  const page = await context.newPage();
  await openNews(page, 375);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  const drawn = await paradeDrawn(inShadow);
  expect(drawn.map((d) => d.company).sort()).toEqual((await companiesShown(inShadow)).sort());

  type Rect = { left: number; right: number; top: number; bottom: number };
  type Sample = { fx: boolean; spirits: Box[]; bands: Rect; text: Rect[]; overflow: boolean; vh: number; vw: number };
  const samples: Sample[] = [];
  let shot = false;
  for (const end = Date.now() + 45_000; Date.now() < end; await page.waitForTimeout(40)) {
    const s: Sample = await inShadow(function () {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
      };
      // every line box of the page's own text (the host and its shadow root are not the page)
      const text: { left: number; right: number; top: number; bottom: number }[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent!.trim() || n.parentElement?.closest("script, style, hg-crypt")) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width && r.height) text.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      const b = this.getElementById("top-bands")!.getBoundingClientRect();
      return {
        fx: !!this.getElementById("fx"),
        spirits: [...this.querySelectorAll("#fx .parade > .spirit")].map(box),
        bands: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
        text,
        overflow: document.documentElement.scrollWidth > innerWidth,
        vh: innerHeight,
        vw: innerWidth,
      };
    });
    samples.push(s);
    if (!shot && s.spirits.filter((b) => visible(b, s.vw, s.vh)).length >= 3) {
      shot = true;
      await page.screenshot({ path: `${OUT}/parade-375.png` });
    }
    if (!s.fx) break;
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

  const live = samples.filter((s) => s.fx);
  const { vw } = samples[0]!;
  expect(live.length).toBeGreaterThan(20);
  // six ghosts still, smaller: three near at 48px (the lane ghost's own size) and three far at 32px
  expect(live[0]!.spirits.map((b) => Math.round(b.width)).sort()).toEqual([32, 32, 32, 48, 48, 48]);
  // the page's text is there to be missed: the article fills the screen below the bands
  expect(live[0]!.text.length).toBeGreaterThan(10);
  for (const s of live) {
    for (const [i, b] of s.spirits.entries()) {
      // inside the band strip, and never over a line of the page's text
      expect({ i, top: b.top >= s.bands.top - 0.5, bottom: b.bottom <= s.bands.bottom + 0.5 }).toEqual({ i, top: true, bottom: true });
      const hit = s.text.find((r) => r.left < b.left + b.width - 0.5 && r.right > b.left + 0.5 && r.top < b.bottom - 0.5 && r.bottom > b.top + 0.5);
      expect({ i, hit }).toEqual({ i, hit: undefined });
    }
  }
  // each one rides the whole width: seen in the left third, and later in the right third
  for (let i = 0; i < 6; i++) {
    const centres = live.map((s) => s.spirits[i]!.left + s.spirits[i]!.width / 2);
    const left = centres.findIndex((c) => c > 0 && c < vw / 3);
    const right = centres.findIndex((c, n) => n > left && c > (2 * vw) / 3 && c < vw);
    expect({ i, left: left >= 0, right: right > left }).toEqual({ i, left: true, right: true });
  }
  expect(samples.some((s) => s.overflow)).toBe(false);
  expect(samples.at(-1)!.fx).toBe(false);
  expect(shot).toBe(true);
});

test("@1280: a page without trackers still gets six parade ghosts, all decorative fillers with no name", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("article.html"));
  await page.waitForLoadState("load");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  expect(await companiesShown(inShadow)).toEqual([]);
  expect(await paradeDrawn(inShadow)).toEqual(Array.from({ length: 6 }, () => ({ company: null, name: null, filler: true })));
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
});

/** pointerdown and keydown listeners on the window of the content script's isolated world(s). */
async function skipListeners(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const worlds: number[] = [];
  cdp.on("Runtime.executionContextCreated", ({ context }) => {
    if ((context.auxData as { type?: string } | undefined)?.type === "isolated") worlds.push(context.id);
  });
  await cdp.send("Runtime.enable"); // reports every context that exists now
  let n = 0;
  for (const contextId of worlds) {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "window", contextId });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId! });
    n += listeners.filter((l) => l.type === "pointerdown" || l.type === "keydown").length;
  }
  await cdp.detach();
  return n;
}

for (const [how, width] of [["click", 1280], ["key press", 375]] as const) {
  test(`@${width}: a ${how} during the haunt moment skips it: the page settles at once, no FX layer, no listeners left`, async ({ context, sw }) => {
    test.setTimeout(60_000);
    const page = await context.newPage();
    await openNews(page, width);
    // a tenth of real time: left alone, the moment would take 30 seconds
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
    await haunt(sw, page);
    const inShadow = await shadowOf(page);
    expect(await inShadow(function () { return this.querySelectorAll("#fx .parade > .spirit").length; })).toBe(6);
    const during = await skipListeners(page);
    expect(during).toBeGreaterThanOrEqual(2);

    const t0 = Date.now();
    if (how === "click") await page.mouse.click(4, 300); // the starfield gutter: no link there
    else await page.keyboard.press("Escape");
    await expect.poll(() => inShadow(function () { return !!this.getElementById("fx"); }), { timeout: 3000, intervals: [50] }).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3000);

    const settled = await inShadow(function () {
      const scripted = [...this.getAnimations(), ...document.getAnimations()].filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));
      const hud = this.getElementById("hud")!.getBoundingClientRect();
      return {
        running: scripted.filter((a) => a.playState === "running").length,
        sprites: [...this.querySelectorAll<HTMLElement>("#lanes > .ghost, #lanes > .vampire, #graveyard .ghost, #graveyard .vampire")].map((g) => +getComputedStyle(g).opacity),
        tags: [...this.querySelectorAll<HTMLElement>("#lanes .tag")].map((t) => +getComputedStyle(t).opacity),
        hudIn: hud.bottom <= innerHeight && hud.top >= 0,
      };
    });
    expect(settled.running).toBe(0);
    expect(settled.sprites.length).toBeGreaterThan(0);
    for (const o of [...settled.sprites, ...settled.tags]) expect(o).toBeGreaterThan(0.5);
    expect(settled.hudIn).toBe(true);
    expect(await skipListeners(page)).toBe(during - 2);
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  });
}

test("reduced motion: no parade and no roll at any point; the settled costume matches the animated one", async ({ context, sw }) => {
  test.setTimeout(60_000);
  const layers = async (page: Page) => {
    const inShadow = await shadowOf(page);
    return inShadow(function () {
      return {
        parade: this.querySelectorAll(".parade, .spirit, .roll").length,
        ids: [...this.querySelectorAll("#crypt-root > [id]")].map((e) => e.id),
        ghosts: [...this.querySelectorAll<HTMLElement>("#lanes > .ghost")].map((g) => [g.dataset.company, getComputedStyle(g).opacity]),
      };
    });
  };
  // reduced: sample through the whole window in which the parade would play
  const still = await context.newPage();
  await still.emulateMedia({ reducedMotion: "reduce" });
  await openNews(still, 1280);
  await haunt(sw, still);
  const inShadow = await shadowOf(still);
  const seen: number[] = [];
  for (const end = Date.now() + 3200; Date.now() < end; await still.waitForTimeout(50)) {
    seen.push(await inShadow(function () { return this.querySelectorAll("#fx, .parade, .spirit, .roll").length; }));
  }
  expect(seen.length).toBeGreaterThan(10);
  expect(seen.filter((n) => n > 0)).toEqual([]);
  await still.screenshot({ path: `${OUT}/parade-reduced.png` });

  // with motion: once the moment is over, the same layers and the same ghosts, and no parade left
  const moving = await context.newPage();
  await openNews(moving, 1280, "?motion");
  await haunt(sw, moving);
  await moving.waitForTimeout(3600);
  expect(await layers(moving)).toEqual(await layers(still));
  expect((await layers(still)).parade).toBe(0);
});
