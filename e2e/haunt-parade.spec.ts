// The scene-wide part of the haunt moment: six big tracker ghosts drift up through the whole page, the
// caption with the page's tracker count ends the parade, and one band of scanlines rolls down it
// (design/DESIGN.md "Haunt moment", the parade, the caption and the roll).
// Under reduced motion neither exists, and the settled costume is the same either way.
import type { Page } from "@playwright/test";
import { tagName } from "../src/content/costume/ghosts";
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
/** Two boxes share more than half a pixel each way. */
const overlap = (a: Box, b: Box) => a.left < b.left + b.width - 0.5 && b.left < a.left + a.width - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** The caption that ends the parade. */
const captionText = (inShadow: Awaited<ReturnType<typeof shadowOf>>) =>
  inShadow(function () {
    return this.querySelector("#fx .parade > .found")?.textContent ?? null;
  });

/** The companies the costume shows (lanes and graveyard strip), in lane order. */
const companiesShown = (inShadow: Awaited<ReturnType<typeof shadowOf>>) =>
  inShadow(function () {
    // a company stands in its lane and in the footer graveyard: count it once
    return [...new Set([...this.querySelectorAll<HTMLElement>("#lanes > [data-company], #graveyard [data-company]")].map((g) => g.dataset.company!))];
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
  test(`@${width}: six big ghosts, the page's own tracker companies with their names on their hems, cross the whole page bottom to top, the tracker count caption rests in the marquee band, a scanline roll passes once, no overflow`, async ({ context, sw }) => {
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
    expect(drawn.map((d) => d.name)).toEqual(drawn.map((d) => tagName(d.company!)));
    expect(drawn.some((d) => d.filler)).toBe(false);
    // the parade ends on a caption with the page's real tracker count
    expect(await captionText(inShadow)).toBe(`Trackers found: ${shown.length}`);

    type Sample = { fx: boolean; barBottom: number; bandsBottom: number; spirits: Box[]; names: ((Box & { solid: number }) | null)[]; found: Box | null; roll: Box | null; overflow: boolean; vh: number; vw: number };
    const samples: Sample[] = [];
    let shot = false;
    let captionShot = false;
    let restShot = false;
    for (const end = Date.now() + 45_000; Date.now() < end; await page.waitForTimeout(40)) {
      const s: Sample = await inShadow(function () {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
        };
        // how solid a tag is drawn: its own and every ancestor's opacity, times its backing's alpha
        const solid = (el: Element) => {
          let a = Number(getComputedStyle(el).backgroundColor.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 1);
          for (let e: Element | null = el; e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity);
          return a;
        };
        const roll = this.querySelector("#fx .roll");
        const found = this.querySelector("#fx .parade > .found");
        return {
          fx: !!this.getElementById("fx"),
          barBottom: this.getElementById("neighborhood")!.getBoundingClientRect().bottom,
          bandsBottom: this.getElementById("top-bands")!.getBoundingClientRect().bottom,
          spirits: [...this.querySelectorAll("#fx .parade > .spirit")].map(box),
          names: [...this.querySelectorAll("#fx .parade > .spirit")].map((sp) => {
            const el = sp.querySelector(".name");
            return el ? { ...box(el), solid: solid(el) } : null;
          }),
          found: found ? box(found) : null,
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
      if (!captionShot && s.found && visible(s.found, s.vw, s.vh)) {
        captionShot = true;
        await page.screenshot({ path: `${OUT}/parade-caption-${width}.png` });
      }
      // at rest: on screen, centred in the band, every ghost gone (before the parade the caption waits
      // off-screen left with every ghost below the viewport, so "no ghost visible" alone is not enough)
      const centred = s.found && visible(s.found, s.vw, s.vh) && s.found.top < s.bandsBottom && Math.abs(s.found.left + s.found.width / 2 - s.vw / 2) <= 1;
      if (!restShot && centred && s.spirits.every((b) => !visible(b, s.vw, s.vh))) {
        restShot = true;
        await page.screenshot({ path: `${OUT}/parade-rest-${width}.png` });
      }
      if (!s.fx) break;
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

    const live = samples.filter((s) => s.fx);
    const { vh, vw } = samples[0]!;
    expect(restShot).toBe(true);
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
    // every name tag is worn on its own ghost: centred on it, on the hem's last row (row 15 of 16) and, on
    // two lines, growing up no higher than under the mouth (row 10), so a tag rides with its ghost and never
    // waits on the page's text; and it is drawn solid (the far ghosts' dimming is on their sprite only)
    expect(live.some((s) => s.names.some((b) => b && visible(b, vw, vh)))).toBe(true);
    for (const [n, s] of live.entries()) {
      for (const [i, t] of s.names.entries()) {
        if (!t || !visible(t, vw, vh)) continue;
        const g = s.spirits[i]!;
        const px = g.width / 16;
        const onGhost = Math.abs(t.left + t.width / 2 - (g.left + g.width / 2)) <= 1 && t.top >= g.top + 10 * px - 0.5 && t.bottom <= g.top + 15 * px + 0.5;
        expect({ n, i, onGhost, solid: t.solid }).toEqual({ n, i, onGhost: true, solid: 1 });
      }
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
    // the caption keeps to the marquee band under the address bar the whole show (costume chrome, never the
    // page's text): it rides in from the left edge and comes to rest centred
    for (const [n, s] of live.entries()) {
      if (!visible(s.found!, vw, vh)) continue;
      expect({ n, inBand: s.found!.top >= s.barBottom - 0.5 && s.found!.bottom <= s.bandsBottom + 0.5 }).toEqual({ n, inBand: true });
    }
    const capCentres = live.map((s) => s.found!.left + s.found!.width / 2);
    expect(capCentres.findIndex((c) => c > 0 && c < vw / 3)).toBeGreaterThanOrEqual(0);
    // it holds there a beat with every ghost gone before the FX root goes
    const rest = live.at(-1)!;
    expect(rest.found!.top).toBeGreaterThanOrEqual(rest.barBottom - 0.5);
    expect(rest.found!.bottom).toBeLessThanOrEqual(rest.bandsBottom + 0.5);
    expect(Math.abs(rest.found!.left + rest.found!.width / 2 - vw / 2)).toBeLessThanOrEqual(1);
    const held = live.filter((s) => Math.abs(s.found!.left - rest.found!.left) < 0.5 && s.spirits.every((b) => !visible(b, vw, vh)));
    expect(held.length).toBeGreaterThanOrEqual(5);
    // nothing pushes the page sideways while it plays, and the FX root is gone at the end
    expect(samples.some((s) => s.overflow)).toBe(false);
    expect(samples.at(-1)!.fx).toBe(false);
    expect(shot).toBe(true);
    expect(captionShot).toBe(true);
  });
}

test("@375: the parade keeps off the reading column and the address bar, a train of six 24/16px ghosts in the marquee band with the caption behind, never over text", async ({ context, sw }) => {
  test.setTimeout(90_000);
  const page = await context.newPage();
  await openNews(page, 375);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  const drawn = await paradeDrawn(inShadow);
  const shown = await companiesShown(inShadow);
  expect(drawn.map((d) => d.company).sort()).toEqual([...shown].sort());
  // the caption ends the train here too, where the ghosts carry no name tags
  expect(drawn.every((d) => d.name === null)).toBe(true);
  const caption = await captionText(inShadow);

  type Rect = { left: number; right: number; top: number; bottom: number };
  type Sample = { fx: boolean; spirits: Box[]; found: Box | null; bands: Rect; bar: Rect; address: Rect[]; text: Rect[]; overflow: boolean; vh: number; vw: number };
  const samples: Sample[] = [];
  let shot = false;
  let captionShot = false;
  let restShot = false;
  for (const end = Date.now() + 45_000; Date.now() < end; await page.waitForTimeout(40)) {
    const s: Sample = await inShadow(function () {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
      };
      const rect = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      const lines = (root: Node, skip: string | null) => {
        const out: { left: number; right: number; top: number; bottom: number }[] = [];
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent!.trim() || (skip && n.parentElement?.closest(skip))) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) if (r.width && r.height) out.push(rect(r));
        }
        return out;
      };
      // the neighbourhood bar's text as drawn: the part of each line its own clip-path (if any) leaves showing
      const hood = this.getElementById("neighborhood")!;
      const shownTo = (el: Element) => {
        const clip = getComputedStyle(el).clipPath;
        if (clip === "none") return Infinity;
        const m = clip.match(/^inset\(\S+ (-?[\d.]+)px/);
        if (!m) throw new Error(`unexpected clip-path ${clip}`);
        return el.getBoundingClientRect().right - parseFloat(m[1]!);
      };
      const address = [...hood.children].flatMap((el) => {
        const to = shownTo(el);
        return lines(el, null).map((r) => ({ ...r, right: Math.min(r.right, to) })).filter((r) => r.right > r.left);
      });
      const b = this.getElementById("top-bands")!.getBoundingClientRect();
      const found = this.querySelector("#fx .parade > .found");
      return {
        fx: !!this.getElementById("fx"),
        spirits: [...this.querySelectorAll("#fx .parade > .spirit")].map(box),
        found: found ? box(found) : null,
        bands: rect(b),
        bar: rect(hood.getBoundingClientRect()),
        address,
        // every line box of the page's own text (the host and its shadow root are not the page)
        text: lines(document.body, "script, style, hg-crypt"),
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
    if (!captionShot && s.found && s.found.left > 8 && s.found.left + s.found.width < s.vw / 2 + 60) {
      captionShot = true;
      await page.screenshot({ path: `${OUT}/parade-caption-375.png` });
    }
    if (!restShot && s.found && visible(s.found, s.vw, s.vh) && Math.abs(s.found.left + s.found.width / 2 - s.vw / 2) < 1 && s.spirits.every((b) => !visible(b, s.vw, s.vh))) {
      restShot = true;
      await page.screenshot({ path: `${OUT}/parade-rest-375.png` });
    }
    if (!s.fx) break;
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

  const live = samples.filter((s) => s.fx);
  const { vw } = samples[0]!;
  expect(live.length).toBeGreaterThan(20);
  // six ghosts still, smaller: three near at 24px and three far at 16px, the 8×8 phone ghost
  expect(live[0]!.spirits.map((b) => Math.round(b.width)).sort()).toEqual([16, 16, 16, 24, 24, 24]);
  // the page's text is there to be missed: the article fills the screen below the bands
  expect(live[0]!.text.length).toBeGreaterThan(10);
  for (const s of live) {
    for (const [i, b] of s.spirits.entries()) {
      // inside the band strip, and never over a line of the page's text
      expect({ i, top: b.top >= s.bands.top - 0.5, bottom: b.bottom <= s.bands.bottom + 0.5 }).toEqual({ i, top: true, bottom: true });
      // under the address bar, never on it, the whole show
      expect({ i, clear: b.top >= s.bar.bottom - 0.5 }).toEqual({ i, clear: true });
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
  // the neighbourhood bar's text is never under a ghost of the train either, and it is all there by the end
  const crosses = (r: { left: number; right: number; top: number; bottom: number }, b: Box) =>
    r.left < b.left + b.width - 0.5 && r.right > b.left + 0.5 && r.top < b.bottom - 0.5 && r.bottom > b.top + 0.5;
  const fullAddress = samples.at(-1)!.address;
  expect(fullAddress.length).toBeGreaterThan(0);
  for (const [n, s] of live.entries()) {
    for (const [i, b] of s.spirits.entries()) {
      const hit = s.address.find((r) => crosses(r, b));
      expect({ n, i, hit }).toEqual({ n, i, hit: undefined });
    }
  }
  // and the address is never veiled for the train: it is whole in every sample once the wipe has shown it
  const whole = (s: Sample) => s.address.reduce((w, r) => w + r.right - r.left, 0);
  const firstWhole = live.findIndex((s) => whole(s) >= whole(samples.at(-1)!) - 0.5);
  expect(firstWhole).toBeGreaterThanOrEqual(0);
  expect(live.slice(firstWhole).filter((s) => whole(s) < whole(samples.at(-1)!) - 0.5)).toEqual([]);
  // the caption: inside the marquee band (under the bar's text), never over the page's text or a ghost,
  // riding in behind the last ghost and resting in the middle of the band after every ghost has gone
  expect(caption).toBe(`Trackers found: ${shown.length}`);
  for (const s of live) {
    const f = s.found!;
    if (!visible(f, s.vw, s.vh)) continue;
    expect({ top: f.top >= s.bar.bottom - 0.5, bottom: f.bottom <= s.bands.bottom + 0.5 }).toEqual({ top: true, bottom: true });
    expect(s.text.find((r) => crosses(r, f))).toBeUndefined();
    expect(s.spirits.find((b) => visible(b, s.vw, s.vh) && overlap(f, b))).toBeUndefined();
    expect(Math.min(f.left + f.width, s.vw)).toBeLessThanOrEqual(s.spirits[5]!.left + 0.5);
  }
  const capCentres = live.map((s) => s.found!.left + s.found!.width / 2);
  const capLeft = capCentres.findIndex((c) => c > 0 && c < vw / 3);
  expect(capLeft).toBeGreaterThanOrEqual(0);
  expect(Math.abs(capCentres.at(-1)! - vw / 2)).toBeLessThanOrEqual(1);
  const held = live.filter((s) => Math.abs(s.found!.left - live.at(-1)!.found!.left) < 0.5 && s.spirits.every((b) => !visible(b, vw, s.vh)));
  expect(held.length).toBeGreaterThanOrEqual(5);
  expect(samples.some((s) => s.overflow)).toBe(false);
  expect(samples.at(-1)!.fx).toBe(false);
  expect(shot).toBe(true);
  expect(captionShot).toBe(true);
  expect(restShot).toBe(true);
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
  expect(await captionText(inShadow)).toBe("Trackers found: 0");
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
      const hud = this.getElementById("hud")!;
      return {
        running: scripted.filter((a) => a.playState === "running").length,
        sprites: [...this.querySelectorAll<HTMLElement>("#lanes > .ghost, #lanes > .vampire, #graveyard .ghost, #graveyard .vampire")].map((g) => +getComputedStyle(g).opacity),
        tags: [...this.querySelectorAll<HTMLElement>("#lanes .tag")].map((t) => +getComputedStyle(t).opacity),
        // the HUD (in the footer, in flow) has risen into place: no transform left on it
        hudIn: ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(getComputedStyle(hud).transform),
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
  await moving.waitForTimeout(4200); // the moment and the caption's hold, to 3600
  expect(await layers(moving)).toEqual(await layers(still));
  expect((await layers(still)).parade).toBe(0);
});
