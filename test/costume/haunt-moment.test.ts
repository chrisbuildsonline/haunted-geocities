import { describe, expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { flush, setup, stubMain, withTrackers, type Rec } from "./helpers";
import { playHaunt, playUnhaunt } from "../../src/content/costume/haunt-moment";
import { riseIn } from "../../src/content/costume/ghosts";
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

  test("the moment ends at 3000 with four ghosts, and after the last tag pop with eight", async () => {
    for (const [n, last] of [[4, 3000], [8, 3850]] as const) {
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

  test("on a phone (400px or less) the parade is drawn smaller, 96px near and 64px far, and still fits the width", () => {
    const s = setup({ width: 375 });
    const el = s.doc.body.appendChild(s.doc.createElement("div"));
    el.innerHTML = `<div id="starfield"></div><div id="top-bands"></div><div id="markers"></div><div id="hud"></div><div id="lanes"></div>`;
    playHaunt(el, false);
    const spirits = [...el.querySelectorAll<HTMLElement>("#fx .parade > .spirit")];
    expect(spirits.map((sp) => [sp.style.width, sp.style.height])).toEqual(
      [96, 64, 96, 64, 64, 96].map((n) => [`${n}px`, `${n}px`]),
    );
    expect([SPRITES.paradeGhostPhone[0], SPRITES.paradeGhostPhoneFar[0]]).toEqual([96, 64]);
    spirits.forEach((sp) => {
      const size = parseFloat(sp.style.width);
      expect(parseFloat(sp.style.left) + size).toBeLessThanOrEqual(375);
      const [drift] = on(s.recs, sp);
      expect(String(drift!.keyframes[1]!.transform)).toMatch(new RegExp(`, -${size}px\\)$`));
    });
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
