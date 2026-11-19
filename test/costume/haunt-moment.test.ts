import { describe, expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { flush, LANE_ORDER, setup, stubMain, TRACKER_ENTRIES, withTrackers, type Rec } from "./helpers";
import { paradeOf, playHaunt, playUnhaunt } from "../../src/content/costume/haunt-moment";
import { hemTint, orderCompanies, riseIn, tintsOf } from "../../src/content/costume/ghosts";
import type { CompanyHit } from "../../src/data/types";
import { costumeCss, scanUrl } from "../../src/content/costume/styles";
import { svgUrl } from "../../src/content/costume/art";
import { HEM_TINTS, MOTION, PALETTE, SPRITES } from "../../src/content/costume/tokens";

const H = MOTION.hero;
const on = (recs: Rec[], el: Element | null) => recs.filter((r) => r.el === el);
const end = (r: Rec) => (r.opts.delay ?? 0) + (r.opts.duration as number);
const span = (r: Rec) => [r.opts.delay ?? 0, end(r)];

/** A bare overlay root with the layers playHaunt animates, `n` lane ghosts with name tags and one vampire. */
function croot(n: number, opts: { reduced?: boolean } = {}) {
  const s = setup(opts);
  const el = s.doc.body.appendChild(s.doc.createElement("div"));
  const ghosts = Array.from({ length: n }, (_, i) => `<button class="ghost" data-company="C${i}"><span class="sprite"></span><span class="tag">C${i}</span></button>`);
  el.innerHTML =
    `<div id="starfield"></div><div id="top-bands"></div><div id="markers"></div><div id="hud"><span class="strip"></span><span class="strip"></span></div>` +
    `<div id="lanes">${ghosts.join("")}<button class="vampire" data-company="V"><span class="sprite"></span><span class="tag">V</span></button></div>`;
  return { ...s, el };
}

/** Runs `fn` with the caption measuring `w`×`h` (happy-dom has no layout); the prototype's own getters are put back after. */
function withCaptionSize(win: { HTMLElement: { prototype: object } }, w: number, h: number, fn: () => void) {
  const proto = win.HTMLElement.prototype;
  const size = { offsetWidth: w, offsetHeight: h };
  const own = Object.keys(size).map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const);
  for (const [k, v] of Object.entries(size)) {
    const base = Object.getOwnPropertyDescriptor(proto, k)?.get;
    Object.defineProperty(proto, k, { configurable: true, get(this: HTMLElement) { return this.classList.contains("found") ? v : (base?.call(this) ?? 0); } });
  }
  try {
    fn();
  } finally {
    for (const [k, d] of own) d ? Object.defineProperty(proto, k, d) : delete (proto as unknown as Record<string, unknown>)[k];
  }
}

/** Element.animate whose `finished` promises resolve only when the test (or `finish()`) says so. */
function deferredClock(win: { Element: { prototype: object } }) {
  const anims: { el: Element; keyframes: Keyframe[]; opts: KeyframeAnimationOptions; resolve(): void }[] = [];
  (win.Element.prototype as unknown as { animate: unknown }).animate = function (this: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions) {
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    const a = { el: this, keyframes, opts, resolve };
    anims.push(a);
    return { finished, finish: resolve, cancel() {} };
  };
  return anims;
}

describe("hero haunt moment", () => {
  test("scanlines are a 1px #000033 line every 3px and fade in over 150ms, out at 1600-1900", () => {
    const { el, recs } = croot(3);
    playHaunt(el, false);
    const scan = el.querySelector("#fx .scan");
    expect(scan).not.toBeNull();
    expect(on(recs, scan).map((r) => [r.keyframes.map((k) => k.opacity), ...span(r)])).toEqual([
      [[0, 1], 0, H.scanIn],
      [[1, 0], ...H.fxOut],
    ]);
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(scanUrl()).toBe(svgUrl([{ x: 0, y: 0, w: 4, h: 1, color: "#000033" }], 4, 3)); // 1px line, 2px clear
    expect(css).toContain(`.scan { position: absolute; inset: 0; background-image: ${scanUrl()}; background-size: 4px 3px; }`);
  });

  test("lids slide in 150-450, meet at mid-height, and open 600-800", () => {
    const { el, recs } = croot(3);
    playHaunt(el, false);
    for (const [cls, off] of [["top", "-100%"], ["bottom", "100%"]] as const) {
      const lid = el.querySelector(`#fx .lid.${cls}`);
      const [close, open] = on(recs, lid);
      expect(close!.keyframes.map((k) => k.transform)).toEqual([`translateY(${off})`, "translateY(0%)"]);
      expect(span(close!)).toEqual([...H.lidsClose]);
      expect(open!.keyframes.map((k) => k.transform)).toEqual(["translateY(0%)", `translateY(${off})`]);
      expect(span(open!)).toEqual([...H.lidsOpen]);
      expect([close!.opts.fill, open!.opts.fill]).toEqual(["both", "forwards"]);
    }
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/\.lid\s*\{[^}]*height:\s*50%[^}]*background:\s*#000000/);
  });

  test("phosphor line is 2px #ccffff, appears at 450 and shrinks to scaleX(0) by 600", () => {
    const { el, recs } = croot(3);
    playHaunt(el, false);
    const [line] = on(recs, el.querySelector("#fx .phosphor"));
    expect(line!.keyframes.map((k) => k.transform)).toEqual(["scaleX(1)", "scaleX(0)"]);
    expect(span(line!)).toEqual([...H.line]);
    expect(line!.opts.fill ?? "none").toBe("none"); // hidden (opacity 0) outside 450-600
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(new RegExp(`\\.phosphor\\s*\\{[^}]*height:\\s*2px[^}]*background:\\s*${PALETTE.phosphor}[^}]*opacity:\\s*0`));
  });

  test("new layers use only palette colours and no blur", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    for (const sel of [".scan", ".lid", ".phosphor"]) {
      const rule = css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))![1]!;
      expect(rule).not.toMatch(/blur|box-shadow|filter/);
      for (const hex of rule.match(/#[0-9a-f]{3,6}\b/gi) ?? []) expect(Object.values(PALETTE) as string[]).toContain(hex);
    }
  });

  test("ghosts rise 48px over 400ms, 250ms apart, the 9th onward with the 8th", () => {
    const { el, recs } = croot(10);
    playHaunt(el, false);
    const rises = [...el.querySelectorAll("#lanes > .ghost")].map((g) => on(recs, g)[0]!);
    expect(rises.map((r) => r.opts.delay)).toEqual([1700, 1950, 2200, 2450, 2700, 2950, 3200, 3450, 3450, 3450]);
    for (const r of rises) {
      expect(r.keyframes).toEqual([{ transform: `translateY(${H.risePx}px)`, opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }]);
      expect(r.opts.duration).toBe(H.riseMs);
    }
  });

  test("each tag pops in 200ms after its ghost starts: opacity and scale 0.6 to 1 over 200ms", () => {
    const { el, recs } = croot(3);
    playHaunt(el, false);
    for (const g of el.querySelectorAll("#lanes > .ghost")) {
      const [rise] = on(recs, g);
      const [pop] = on(recs, g.querySelector(".tag"));
      expect(pop!.keyframes).toEqual([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }]);
      expect([pop!.opts.delay, pop!.opts.duration, pop!.opts.fill]).toEqual([rise!.opts.delay! + H.tagDelay, H.tagMs, "backwards"]);
    }
    expect(costumeCss({ stars: "a", twinkle: "b" })).toMatch(/\.tag, \.stack\s*\{[^}]*transform-origin:\s*50% 0/);
  });

  test("riseIn defaults stay 16px and 300ms for ghosts that arrive later", () => {
    const { doc, recs } = setup();
    const g = doc.body.appendChild(doc.createElement("button"));
    riseIn(g);
    expect(recs[0]!.keyframes[0]).toEqual({ transform: "translateY(16px)", opacity: 0 });
    expect([recs[0]!.opts.delay, recs[0]!.opts.duration]).toEqual([0, 300]);
  });

  test("vampires, HUD, odometer and markers keep their order at the new times", () => {
    const { el, recs } = croot(3);
    playHaunt(el, false);
    expect(on(recs, el.querySelector(".vampire"))[0]!.opts.delay).toBe(H.vampires);
    const [hud] = on(recs, el.querySelector("#hud"));
    expect(span(hud!)).toEqual([H.hud, H.hud + 300]);
    const rolls = [...el.querySelectorAll(".strip")].map((s) => on(recs, s)[0]!);
    expect(rolls.at(-1)!.opts.delay).toBe(H.odometer[0]);
    for (const r of rolls) expect(end(r)).toBe(H.odometer[1]);
    const [markers] = on(recs, el.querySelector("#markers"));
    expect(span(markers!)).toEqual([H.markers, H.markers + 200]);
  });

  test("the moment ends after the caption's hold (3600) with four ghosts, and after the last tag pop with eight", async () => {
    for (const [n, last] of [[4, H.captionOut], [8, 3850]] as const) {
      const { el, recs } = croot(n);
      const m = playHaunt(el, false);
      expect(Math.max(...recs.map(end))).toBe(last);
      await m.done;
      expect(el.querySelector("#fx")).toBeNull();
    }
  });

  test("data-phase goes crt, wipe, rise, never back, driven by animations not timers", async () => {
    const { win, el } = croot(3);
    const anims = deferredClock(win);
    const timers = [win.setTimeout, globalThis.setTimeout];
    let used = 0;
    win.setTimeout = globalThis.setTimeout = ((...a: Parameters<typeof setTimeout>) => (used++, timers[1]!(...a))) as typeof setTimeout;
    playHaunt(el, false);
    [win.setTimeout, globalThis.setTimeout] = timers as [typeof win.setTimeout, typeof setTimeout];
    expect(used).toBe(0);
    const fx = el.querySelector<HTMLElement>("#fx")!;
    expect(fx.dataset.phase).toBe("crt");
    const markers = anims.filter((a) => a.el === fx && a.keyframes.length === 0);
    expect(markers.map((a) => a.opts.duration)).toEqual([H.wipeStart, H.riseStart]);
    markers[0]!.resolve();
    await flush();
    expect(fx.dataset.phase).toBe("wipe");
    markers[1]!.resolve();
    await flush();
    expect(fx.dataset.phase).toBe("rise");
    // a late "wipe" marker never takes the phase back
    const again = croot(3);
    const late = deferredClock(again.win);
    playHaunt(again.el, false);
    const fx2 = again.el.querySelector<HTMLElement>("#fx")!;
    const [m1, m2] = late.filter((a) => a.el === fx2 && a.keyframes.length === 0);
    m2!.resolve();
    await flush();
    m1!.resolve();
    await flush();
    expect(fx2.dataset.phase).toBe("rise");
  });

  test("finish() ends the moment at once and removes the FX root", async () => {
    const { win, el } = croot(3);
    deferredClock(win);
    const m = playHaunt(el, false);
    m.finish();
    await m.done;
    expect(el.querySelector("#fx")).toBeNull();
  });

  test("flash safety: one iteration each, every property monotonic, only the 900ms bob goes back", () => {
    const { el, recs } = croot(10);
    playHaunt(el, false);
    const num = (v: unknown) => parseFloat(String(v).replace(/^[a-zA-Z]+\(/, ""));
    for (const r of recs) {
      expect(r.opts.iterations ?? 1).toBe(1);
      if ((r.el as HTMLElement).classList?.contains("webmaster")) continue;
      for (const p of ["opacity", "transform"] as const) {
        const vals = r.keyframes.filter((k) => p in k).map((k) => num(k[p]));
        const up = vals.every((v, i) => i === 0 || v >= vals[i - 1]!);
        const down = vals.every((v, i) => i === 0 || v <= vals[i - 1]!);
        expect({ el: (r.el as HTMLElement).className, p, vals, monotonic: up || down }).toMatchObject({ monotonic: true });
      }
    }
    // the screen goes dark once: the lids close before they open, with the phosphor line between
    expect(H.lidsClose[1]).toBeLessThanOrEqual(H.line[0]);
    expect(H.line[1]).toBeLessThanOrEqual(H.lidsOpen[0]);
  });

  test("the parade: six ghosts, one per hem tint, 144px near and 96px far, drift up through the whole page", () => {
    const { el, recs, win } = croot(3);
    playHaunt(el, false);
    const spirits = [...el.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    expect(spirits).toHaveLength(6);
    expect(spirits.map((s) => s.dataset.tint).sort()).toEqual([...HEM_TINTS].sort());
    expect(spirits.map((s) => (s.classList.contains("near") ? SPRITES.paradeGhost[0] : SPRITES.paradeGhostFar[0]))).toEqual([144, 96, 144, 96, 96, 144]);
    // spread over the whole width: some start in the left third, some in the right third
    const lefts = spirits.map((s) => parseFloat(s.style.left));
    expect(Math.min(...lefts)).toBeLessThan(win.innerWidth / 3);
    expect(Math.max(...lefts)).toBeGreaterThan((2 * win.innerWidth) / 3 - 144);
    spirits.forEach((s, i) => {
      const size = s.classList.contains("near") ? 144 : 96;
      expect(parseFloat(s.style.left) + size).toBeLessThanOrEqual(win.innerWidth);
      const [drift] = on(recs, s);
      expect(drift!.opts).toMatchObject({ delay: H.paradeStart + i * H.paradeStagger, duration: H.paradeMs, easing: "linear", fill: "both" });
      // from just below the viewport to just above it: a whole-page crossing, never back
      const [from, to] = drift!.keyframes.map((k) => String(k.transform).match(/translate\((-?\d+)px, (-?\d+)px\)/)!.slice(1).map(Number));
      expect(from).toEqual([0, win.innerHeight]);
      expect(to![1]).toBe(-size);
      expect(Math.abs(to![0]!)).toBeLessThanOrEqual(48);
    });
    expect(H.paradeStart + 5 * H.paradeStagger + H.paradeMs).toBeLessThanOrEqual(MOTION.haunt);
  });

  test("on a phone (400px or less) the parade keeps off the reading column and the address bar: a train of 24/16px ghosts in the marquee band", () => {
    const s = setup({ width: 375 });
    const el = s.doc.body.appendChild(s.doc.createElement("div"));
    el.innerHTML = `<div id="starfield"></div><div id="top-bands"></div><div id="markers"></div><div id="hud"></div><div id="lanes"></div>`;
    // the bands sit 20px down (under a page's fixed header): the 24px bar, then the 24px marquee band
    const bands = el.querySelector<HTMLElement>("#top-bands")!;
    Object.defineProperty(bands, "offsetTop", { value: 20 });
    Object.defineProperty(bands, "offsetHeight", { value: 48 });
    playHaunt(el, false);
    const spirits = [...el.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    expect(spirits.map((sp) => [sp.style.width, sp.style.height])).toEqual([24, 16, 24, 16, 16, 24].map((n) => [`${n}px`, `${n}px`]));
    expect([SPRITES.paradeGhostPhone[0], SPRITES.paradeGhostPhoneFar[0]]).toEqual([24, 16]);
    // the 8×8 phone ghost art, drawn at 3px (24) and shown at 2px (16): integer art pixels both ways
    expect(spirits.map((sp) => sp.querySelector("svg")?.getAttribute("viewBox"))).toEqual(Array(6).fill("0 0 24 24"));
    const [barBottom, bandBottom] = [20 + 24, 20 + 48];
    spirits.forEach((sp, i) => {
      const size = parseFloat(sp.style.width);
      // centred in the marquee band: under the address bar the whole show, and never below the bands
      expect(parseFloat(sp.style.top)).toBe(barBottom + (24 - size) / 2);
      expect(parseFloat(sp.style.top)).toBeGreaterThanOrEqual(barBottom);
      expect(parseFloat(sp.style.top) + size).toBeLessThanOrEqual(bandBottom);
      expect(sp.style.left).toBe("0px");
      // left edge to right edge, sideways only, spaced out so the six never clump
      const [ride] = on(s.recs, sp);
      expect(ride!.keyframes.map((k) => k.transform)).toEqual([`translate(-${size}px, 0px)`, "translate(375px, 0px)"]);
      expect(ride!.opts).toMatchObject({ delay: H.paradeStart + i * H.paradePhoneStagger, duration: H.paradePhoneMs, easing: "linear", fill: "both" });
    });
    // the train is still out of the band by 3000
    expect(H.paradeStart + 5 * H.paradePhoneStagger + H.paradePhoneMs).toBeLessThanOrEqual(MOTION.haunt);
    // 24px ghosts at least 48px apart on the way across
    expect(((375 + 24) / H.paradePhoneMs) * H.paradePhoneStagger).toBeGreaterThanOrEqual(48);
  });

  test("the parade is the page's own tracker companies: lane order, lane tint and a name tag each; fillers only make it up to six", () => {
    const { el } = croot(3);
    playHaunt(el, false, [], [
      { company: "Criteo", tint: "#99ccff" },
      { company: "<b>comScore</b>", tint: "#ff99cc" },
    ]);
    const spirits = [...el.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    expect(spirits).toHaveLength(6);
    expect(spirits.map((s) => s.dataset.company ?? null)).toEqual(["Criteo", "<b>comScore</b>", null, null, null, null]);
    expect(spirits.map((s) => s.querySelector(".name")?.textContent ?? null)).toEqual(["Criteo", "<b>comScore</b>", null, null, null, null]);
    expect(el.querySelector("#fx b")).toBeNull(); // names are text, never markup
    expect(spirits.map((s) => s.hasAttribute("data-filler"))).toEqual([false, false, true, true, true, true]);
    // the real ones wear their lane tint; the fillers take the hem tints left over, so all six still differ
    expect(spirits.map((s) => s.dataset.tint)).toEqual(["#99ccff", "#ff99cc", "#ccff99", "#ffcc99", "#cc99ff", "#99ffcc"]);
    // the six-ghost look stays: near and far in the same order
    expect(spirits.map((s) => s.style.width)).toEqual(["144px", "96px", "144px", "96px", "96px", "144px"]);
  });

  test("a parade name tag is worn on its ghost's hem, in the hem's tint, so it never sits on the page's text and leaves with its ghost", () => {
    const { el, recs } = croot(3);
    playHaunt(el, false, [], [{ company: "Criteo", tint: "#99ccff" }]);
    const spirits = [...el.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    // the tag is the hem's own colour: the ghost's tint still shows, with the name on it
    const name = spirits[0]!.querySelector<HTMLElement>(".name")!;
    expect(name.style.background).toBe("#99ccff");
    // nothing hangs under the sprite any more, so every ghost ends just over the top edge
    const ends = spirits.map((s) => {
      const [drift] = on(recs, s);
      return Number(String(drift!.keyframes.at(-1)!.transform).match(/, (-?\d+)px\)/)![1]);
    });
    expect(ends).toEqual([-144, -96, -144, -96, -96, -144]);
  });

  test("parade name tag CSS: inside the hem rows (12-14 of 16) and the hem's width, crypt ink on the tint, 14px near and 12px far", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replaceAll(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    const tag = rule(".spirit .name");
    // from the hem's first row (12/16 = 75%) and never below its third (15/16): 22px near (144px, 9px rows
    // 108-135) and 18px far (96px, 6px rows 72-90)
    expect(tag).toMatch(/top:\s*75%/);
    expect(tag).not.toMatch(/margin-top/);
    expect(tag).toMatch(/max-width:\s*87\.5%/); // the hem's 14 of 16 columns
    expect(tag).toMatch(/overflow:\s*hidden/);
    expect(tag).toMatch(/text-overflow:\s*ellipsis/);
    expect(tag).toMatch(new RegExp(`color:\\s*${PALETTE.crypt}`));
    expect(tag).toMatch(new RegExp(`border:\\s*1px solid ${PALETTE.crypt}`));
    expect(tag).toMatch(/font:\s*14px\/18px/);
    expect(rule(".spirit.far .name")).toMatch(/font-size:\s*12px/);
    expect(rule(".spirit.far .name")).toMatch(/line-height:\s*14px/);
    // 18px line + 1px padding and 1px border each way = 22px, inside the 27px of a near ghost's hem rows
    expect(18 + 4).toBeLessThanOrEqual((144 / 16) * 3);
    expect(14 + 4).toBeLessThanOrEqual((96 / 16) * 3);
  });

  test("more than six companies: the first six in lane order, no fillers", () => {
    const { el } = croot(3);
    const many = Array.from({ length: 8 }, (_, i) => ({ company: `C${i}`, tint: HEM_TINTS[i % 6]! }));
    playHaunt(el, false, [], many);
    const spirits = [...el.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    expect(spirits.map((s) => s.dataset.company)).toEqual(["C0", "C1", "C2", "C3", "C4", "C5"]);
    expect(el.querySelectorAll("#fx [data-filler]")).toHaveLength(0);
  });

  // At every width the caption keeps to the marquee band (costume chrome, never the page's text): it rides
  // in from the left edge at the phone train's speed (the width in a second), rests centred in the band and
  // holds there to captionOut, a beat after the 3000ms moment.
  for (const [vw, vh, start] of [[1280, 800, H.captionStart], [700, 667, H.captionStart], [401, 667, H.captionStart], [375, 667, H.captionPhoneStart]] as const) {
    test(`@${vw}: the caption, Trackers found: N, rides into the marquee band under the bar, rests centred and holds to ${H.captionOut}`, () => {
      const s = setup({ width: vw, height: vh });
      const el = s.doc.body.appendChild(s.doc.createElement("div"));
      el.innerHTML = `<div id="starfield"></div><div id="top-bands"></div><div id="markers"></div><div id="hud"></div><div id="lanes"></div>`;
      Object.defineProperty(el.querySelector("#top-bands")!, "offsetTop", { value: 20 });
      withCaptionSize(s.win, 130, 22, () => playHaunt(el, false, [], [{ company: "Criteo", tint: "#99ccff" }], 9));
      const found = el.querySelector<HTMLElement>("#fx .parade > .found")!;
      expect(found.textContent).toBe("Trackers found: 9");
      // centred in the 24px marquee band, under the address bar, for the whole ride: it moves sideways only
      expect(found.style.top).toBe(`${20 + 24 + (24 - 22) / 2}px`);
      expect(found.style.left).toBe("0px");
      const [ride] = on(s.recs, found);
      const restX = Math.round((vw - 130) / 2);
      expect(ride!.keyframes.map((k) => k.transform)).toEqual(["translate(-100%, 0px)", `translate(${restX}px, 0px)`, `translate(${restX}px, 0px)`]);
      expect(ride!.opts).toMatchObject({ delay: start, easing: "linear", fill: "both" });
      // in at the train's speed: from fully off the left edge to centred
      const rideMs = (ride!.keyframes[1]!.offset as number) * (ride!.opts.duration as number);
      expect(Math.round(rideMs)).toBe(Math.round((H.paradePhoneMs * (restX + 130)) / (vw + SPRITES.paradeGhostPhone[0])));
      // it rests, readable, for over a second, to captionOut
      expect(end(ride!)).toBe(H.captionOut);
      expect(H.captionOut - (start + rideMs)).toBeGreaterThan(1000);
    });
  }

  test("the caption's hold ends a beat (600ms) after the 3000ms moment", () => {
    expect(H.captionOut as number).toBe(MOTION.haunt + 600);
  });

  test("the caption counts every tracker company on the page, not only the six that march; a clean page says 0", () => {
    const { el } = croot(3);
    playHaunt(el, false);
    expect(el.querySelector("#fx .found")?.textContent).toBe("Trackers found: 0");
    const { win, doc } = setup();
    stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
    const more = ["chartbeat.com/a", "quantserve.com/a", "doubleclick.net/a", "facebook.net/a"].map((p, i) => ({ name: `https://${p}.js`, startTime: 20 + i }));
    withTrackers(win, [...TRACKER_ENTRIES, ...more]);
    const root = renderCostume(doc);
    expect(root.querySelectorAll("#fx .parade > .spirit[data-company]")).toHaveLength(6);
    expect(root.querySelector("#fx .found")?.textContent).toBe("Trackers found: 8");
  });

  test("on a phone the caption rides in one beat behind the last ghost of the train, so the gap to it holds on the way in", () => {
    expect(H.captionPhoneStart as number).toBe(H.paradeStart + 6 * H.paradePhoneStagger);
  });

  test("on a phone the address is never veiled: the train keeps under the bar, so the address shows the whole show", () => {
    const s = setup({ width: 375 });
    const el = s.doc.body.appendChild(s.doc.createElement("div"));
    el.innerHTML =
      `<div id="starfield"></div><div id="top-bands"><div id="neighborhood"><span class="where">You are in: <b>Area51/Hangar/1998</b></span></div></div>` +
      `<div id="markers"></div><div id="hud"></div><div id="lanes"></div>`;
    playHaunt(el, false);
    const where = el.querySelector<HTMLElement>(".where")!;
    expect(on(s.recs, where)).toEqual([]);
    expect(s.recs.filter((r) => el.querySelector("#neighborhood")!.contains(r.el))).toEqual([]);
  });

  test("paradeOf: companies in lane order (ghosts by count, then vampires) with their lane tints", () => {
    const hit = (company: string, count: number, vampire = false): CompanyHit => ({
      company,
      domains: [],
      count,
      categories: [],
      fingerprinting: 0,
      ...(vampire ? { vampire: { caught: [], knownOnly: true } } : {}),
    });
    const hits = [hit("Taboola", 1, true), hit("comScore", 2), hit("Criteo", 3), hit("Hotjar", 2, true)];
    const sorted = orderCompanies(hits);
    const tints = tintsOf(sorted);
    expect(paradeOf(hits)).toEqual([
      { company: "Criteo", tint: tints.get("Criteo")! },
      { company: "comScore", tint: tints.get("comScore")! },
      { company: "Hotjar", tint: hemTint("Hotjar") },
      { company: "Taboola", tint: hemTint("Taboola") },
    ]);
    expect(paradeOf([])).toEqual([]);
  });

  test("the costume hands the page's companies to the parade at haunt time", () => {
    const { win, doc } = setup();
    stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
    withTrackers(win);
    const root = renderCostume(doc);
    const spirits = [...root.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    expect(spirits.map((s) => s.dataset.company ?? null)).toEqual([...LANE_ORDER, null, null]);
    const lane = new Map([...root.querySelectorAll<HTMLElement>("#lanes > .ghost")].map((g) => [g.dataset.company, g.dataset.tint]));
    for (const s of spirits.filter((s) => lane.has(s.dataset.company))) expect(s.dataset.tint).toBe(lane.get(s.dataset.company)!);
  });

  test("a click or a key press skips the moment: it settles at once, the FX root goes, and the listeners go with it", async () => {
    type Win = ReturnType<typeof setup>["win"];
    for (const fire of [
      (w: Win) => w.document.body.dispatchEvent(new w.Event("pointerdown", { bubbles: true })),
      (w: Win) => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    ]) {
      const { win, el } = croot(3);
      const anims = deferredClock(win);
      const added: unknown[][] = [];
      const removed: unknown[][] = [];
      const add = win.addEventListener.bind(win);
      const remove = win.removeEventListener.bind(win);
      win.addEventListener = ((...a: Parameters<typeof add>) => (added.push(a), add(...a))) as typeof add;
      win.removeEventListener = ((...a: Parameters<typeof remove>) => (removed.push(a), remove(...a))) as typeof remove;
      const m = playHaunt(el, false);
      expect(added.map(([t]) => t).sort()).toEqual(["keydown", "pointerdown"]);
      expect(added.map(([, , capture]) => capture)).toEqual([true, true]);
      let done = false;
      void m.done.then(() => (done = true));
      await flush();
      expect(done).toBe(false);
      fire(win);
      // the deferred clock resolves an animation only when it is finished: done means all of them were
      await m.done;
      expect(anims.length).toBeGreaterThan(20);
      expect(el.querySelector("#fx")).toBeNull();
      // every listener it added is gone: same type, same function, same capture flag
      expect(removed).toHaveLength(added.length);
      expect(removed).toEqual(expect.arrayContaining(added));
    }
  });

  test("the skip listeners also go when the moment ends on its own or the costume finishes it", async () => {
    const { win, el } = croot(3);
    const before = { add: 0, remove: 0 };
    const add = win.addEventListener.bind(win);
    const remove = win.removeEventListener.bind(win);
    win.addEventListener = ((...a: Parameters<typeof add>) => (before.add++, add(...a))) as typeof add;
    win.removeEventListener = ((...a: Parameters<typeof remove>) => (before.remove++, remove(...a))) as typeof remove;
    await playHaunt(el, false).done; // the recording clock: every animation is already finished
    expect(before).toEqual({ add: 2, remove: 2 });
    const reduced = playHaunt(el, true);
    await reduced.done;
    expect(before).toEqual({ add: 4, remove: 4 });
  });

  test("the roll: one band of spectral scanlines rolls down the whole page as the tube comes back, 800-1400", () => {
    const { el, recs, win } = croot(3);
    playHaunt(el, false);
    const roll = el.querySelector("#fx .roll");
    const anims = on(recs, roll);
    expect(anims).toHaveLength(1);
    expect(anims[0]!.keyframes.map((k) => k.transform)).toEqual(["translateY(-100%)", `translateY(${win.innerHeight}px)`]);
    expect(anims[0]!.opts).toMatchObject({ delay: H.roll[0], duration: H.roll[1] - H.roll[0], easing: "linear", fill: "both" });
    expect(H.roll[0]).toBeGreaterThanOrEqual(H.lidsOpen[1]); // it never runs while the screen is dark
  });

  test("parade and roll CSS: palette colours, pixelated sprites, out of view at rest", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    for (const sel of [".parade", ".spirit", ".roll"]) {
      const rule = css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1];
      expect(rule, sel).toBeDefined();
      for (const hex of rule!.match(/#[0-9a-f]{3,6}\b/gi) ?? []) expect(Object.values(PALETTE) as string[]).toContain(hex);
    }
    expect(css).toMatch(/\.spirit svg\s*\{[^}]*image-rendering:\s*pixelated/);
    expect(css).toMatch(/\.spirit\s*\{[^}]*transform:\s*translateY\(-200%\)/);
    expect(css).toMatch(/\.roll\s*\{[^}]*transform:\s*translateY\(-100%\)/);
  });

  test("a parade name tag is solid: the near/far dimming is on the sprite only, so no page text shows through a tag", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replaceAll(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[1];
    // the ghost's box (which holds the tag) is never see-through
    for (const sel of [".spirit", ".spirit.near", ".spirit.far"]) expect(rule(sel) ?? "", sel).not.toMatch(/opacity/);
    expect(rule(".spirit.near svg")).toMatch(/opacity:\s*\.92/);
    expect(rule(".spirit.far svg")).toMatch(/opacity:\s*\.6\b/);
    // and the tag itself is an opaque plaque: its ground is the hem tint, set on it (never a see-through colour)
    expect(rule(".spirit .name")).not.toMatch(/opacity|background/);
    for (const t of HEM_TINTS) expect(t).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("reduced motion: no FX root, no lids, no rise, no stagger, no phase, tags shown at once", () => {
    const { el, recs } = croot(3, { reduced: true });
    playHaunt(el, true);
    expect(recs.map((r) => [r.el, r.keyframes, r.opts.duration])).toEqual([[el, [{ opacity: 0 }, { opacity: 1 }], 300]]);
    expect(el.querySelector("#fx")).toBeNull();
    expect(el.querySelector("[data-phase]")).toBeNull();
  });
});

test("clip-path reveal covers frame and tint", () => {
  const { win, doc, recs } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  const clip = (el: Element, pseudo?: string) =>
    recs.find((r) => r.el === el && r.opts.pseudoElement === pseudo && r.keyframes.some((k) => "clipPath" in k));
  // the edge frame and the gutters are inside #starfield, which is clipped behind the ghost
  expect(root.getElementById("starfield")!.contains(root.getElementById("edge-frame"))).toBe(true);
  const field = clip(root.getElementById("starfield")!);
  expect(field?.opts).toMatchObject({ delay: 700, duration: 900 });
  // the page-sheet layers get the same wipe, shifted into their own box (tint at x=296, frame at x=290)
  const tint = clip(doc.documentElement, "::before");
  const frame = clip(doc.documentElement, "::after");
  expect(tint?.opts).toMatchObject({ delay: 700, duration: 900, easing: field!.opts.easing });
  expect(frame?.opts).toMatchObject({ delay: 700, duration: 900 });
  expect(tint!.keyframes.map((k) => k.clipPath)).toEqual(["inset(-8px calc(100% - -80px + 296px) -8px -8px)", "inset(-8px calc(100% - (100vw - 16px) + 296px) -8px -8px)"]);
  expect(String(frame!.keyframes[0]!.clipPath)).toContain("+ 290px");
});

test("graveyard slides with the HUD, no extra phase", async () => {
  const { win, doc, recs } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  const hud = root.getElementById("hud")!;
  const strip = root.getElementById("graveyard")!;
  const slide = (el: Element) => recs.filter((r) => r.el === el && r.keyframes.some((k) => String(k.transform).startsWith("translateY")));
  const timing = (r: { opts: KeyframeAnimationOptions }) => ({ delay: r.opts.delay, duration: r.opts.duration, easing: r.opts.easing });
  // in: one slide up, same delay, duration and easing as the HUD's, ending in place
  expect(slide(strip)).toHaveLength(1);
  expect(timing(slide(strip)[0]!)).toEqual(timing(slide(hud)[0]!));
  expect(slide(strip)[0]!.keyframes.at(-1)!.transform).toBe("translateY(0px)");
  // its sprites do not rise on their own during the haunt moment
  const sprites = [...strip.querySelectorAll(".stones > button")];
  expect(recs.filter((r) => sprites.some((s) => s === r.el || s.contains(r.el)))).toEqual([]);
  // out: one slide down with the HUD
  recs.length = 0;
  await playUnhaunt(root.getElementById("crypt-root")!, false);
  expect(slide(strip)).toHaveLength(1);
  expect(timing(slide(strip)[0]!)).toEqual(timing(slide(hud)[0]!));
  expect(slide(strip)[0]!.keyframes[0]!.transform).toBe("translateY(0px)");
});

test("a hidden strip (lane mode) gets no slide", () => {
  const { win, doc, recs } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  expect(recs.filter((r) => r.el === root.getElementById("graveyard"))).toEqual([]);
});
