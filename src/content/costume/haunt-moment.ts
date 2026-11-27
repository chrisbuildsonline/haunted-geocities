// The haunt moment (3000ms: the page dies like a CRT, the Webmaster's Ghost wipes 1998 in, the
// tracker ghosts rise one by one with their name tags) and its reverse (1100ms): Web Animations on
// transform, opacity and clip-path only, all inside the shadow root. Timings from design/DESIGN.md.
import type { CompanyHit } from "../../data/types";
import { ghostLegend, mapToPx, PHONE_GHOST, svgMarkup, WEBMASTER, WEBMASTER_LEGEND } from "./art";
import { hemTint, orderCompanies, riseIn, tagName, tintsOf, ghostSvg as trackerGhostSvg, vampireIn } from "./ghosts";
import { HEM_TINTS, LAYOUT as L, MOTION as M, PIXEL, SPRITES } from "./tokens";

const H = M.hero;

export type Moment = { done: Promise<void>; finish(): void };

/** A click or a key press anywhere skips the moment: it jumps to its end and settles the page. */
const SKIP = ["pointerdown", "keydown"] as const;

function skippable(win: Window, m: Moment): Moment {
  const skip = () => m.finish();
  // Capture on the window, so a page that stops propagation cannot keep the moment playing.
  for (const type of SKIP) win.addEventListener(type, skip, true);
  const done = m.done.finally(() => {
    for (const type of SKIP) win.removeEventListener(type, skip, true);
  });
  return { done, finish: m.finish };
}

/** One parade ghost that stands for a real tracker company on the page. */
export type ParadeGhost = { company: string; tint: string };

const settle = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);

const ghostSvg = () => svgMarkup(mapToPx(WEBMASTER, WEBMASTER_LEGEND, PIXEL.spriteScale), 96, 96);

const SWEEP = () => `<div class="sweep"><div class="ectoplasm"></div><div class="webmaster">${ghostSvg()}</div></div>`;

/**
 * The parade: six tracker ghosts, one per hem tint, drift up through the whole page in start order.
 * `x` is the share of the free width left of the sprite; near ones are big, far ones smaller and dimmer;
 * `drift` is the sideways slide over the crossing, so the flock fans out as it rises.
 */
const PARADE = [
  { x: 0.06, near: true, drift: 40 },
  { x: 0.74, near: false, drift: -32 },
  { x: 0.4, near: true, drift: 40 },
  { x: 0.96, near: false, drift: -32 },
  { x: 0.22, near: false, drift: 32 },
  { x: 0.7, near: true, drift: -40 },
] as const;

/**
 * The page's tracker companies for the parade, in lane order (ghosts by count, then vampires), at
 * most six, each in its lane tint (a vampire in its base hem tint).
 */
export function paradeOf(companies: readonly CompanyHit[]): ParadeGhost[] {
  const sorted = orderCompanies(companies);
  const tints = tintsOf(sorted);
  return sorted.slice(0, PARADE.length).map(({ company }) => ({ company, tint: tints.get(company) ?? hemTint(company) }));
}

/** A phone (the HUD's wrap width): the text fills the screen, so the parade rides the marquee band instead. */
const isPhone = (vw: number) => vw <= L.hudWrapBelow;

/**
 * How far past the viewport's edge a parade ghost starts and ends, so its glow (an 8px drop-shadow) is
 * off screen too: no smudge of it waits on the address bar while the caption holds.
 */
export const PARADE_GLOW = 16;

/** The phone train's ride, left edge to right edge, glow and all: the caption rides in at this speed too. */
const phoneRide = (vw: number) => vw + SPRITES.paradeGhostPhone[0] + 2 * PARADE_GLOW;

/** A parade ghost's side: 144/96px, or 24/16px on a phone, where it must fit the 24px marquee band. */
const paradeSize = (near: boolean, vw: number) =>
  (isPhone(vw) ? (near ? SPRITES.paradeGhostPhone : SPRITES.paradeGhostPhoneFar) : near ? SPRITES.paradeGhost : SPRITES.paradeGhostFar)[0];

/** Room kept between a gutter parade ghost and the table's frame (its 11px reach and the ghost's glow). */
const LANE_KEEP = 16;
/** The least a gutter must give a parade ghost; with less on both sides the parade rides the marquee band. */
const LANE_MIN = 48;

/**
 * Where each parade ghost drifts up: in the empty gutters beside the page's table (never over the page),
 * alternating sides, sized to fit; null when neither gutter has room (a phone, a full-width page), and the
 * parade rides the marquee band. The gutters come from the costume's last layout (`data-gutters` on #crypt-root).
 */
export function paradeLanes(croot: HTMLElement, vw: number): { left: number; size: number }[] | null {
  if (isPhone(vw)) return null;
  const [gl, gr] = (croot.dataset.gutters ?? "").split(",").map(Number);
  const room = { left: (gl || 0) - LANE_KEEP, right: (gr || 0) - LANE_KEEP };
  const sides = (["left", "right"] as const).filter((s) => room[s] >= LANE_MIN);
  if (!sides.length) return null;
  return PARADE.map((p, i) => {
    const side = sides[i % sides.length]!;
    const size = Math.min(paradeSize(p.near, vw), room[side]);
    const left = side === "left" ? Math.floor((room.left - size) / 2) : vw - (gr || 0) + LANE_KEEP + Math.floor((room.right - size) / 2);
    return { left, size };
  });
}

/**
 * The six parade ghosts: the page's companies first, each with its name tag (none on a phone, where
 * the band has no room), then decorative fillers in the hem tints left over, up to six.
 */
function buildSpirits(doc: Document, parade: readonly ParadeGhost[], phone: boolean): HTMLElement[] {
  const real = parade.slice(0, PARADE.length);
  const spare = HEM_TINTS.filter((t) => !real.some((g) => g.tint === t));
  return PARADE.map((p, i) => {
    const g = real[i];
    const tint = g?.tint ?? spare[i - real.length]!;
    const s = doc.createElement("div");
    s.className = `spirit ${p.near ? "near" : "far"}`;
    s.dataset.tint = tint;
    s.innerHTML = phone ? svgMarkup(mapToPx(PHONE_GHOST, ghostLegend(tint), PIXEL.spriteScale), 24, 24) : trackerGhostSvg(tint);
    if (!g) s.setAttribute("data-filler", "");
    else {
      s.dataset.company = g.company;
      if (!phone) {
        // Worn on the hem, in the hem's tint: the name rides on its ghost, never on the page's text. It reads
        // as the lane and graveyard tags do, without its owner in brackets.
        const name = Object.assign(doc.createElement("span"), { className: "name", textContent: tagName(g.company) });
        name.style.background = tint;
        s.append(name);
      }
    }
    return s;
  });
}

/** The FX root: for the haunt, the CRT (scanlines, two lids, the phosphor line) around the vignette, the parade and its caption, the ghost and the roll. */
function buildFx(croot: HTMLElement, crt: boolean, parade: readonly ParadeGhost[] = [], found = 0): HTMLElement {
  const doc = croot.ownerDocument;
  const fx = doc.createElement("div");
  fx.id = "fx";
  fx.setAttribute("aria-hidden", "true");
  if (!crt) fx.innerHTML = SWEEP();
  else {
    fx.innerHTML = `<div class="scan"></div><div class="vignette"></div><div class="parade"></div>${SWEEP()}<div class="roll"></div><div class="lid top"></div><div class="lid bottom"></div><div class="phosphor"></div>`;
    const vw = doc.defaultView!.innerWidth;
    const lanes = paradeLanes(croot, vw);
    const phone = !lanes;
    fx.dataset.parade = phone ? "band" : "gutters";
    const spirits = buildSpirits(doc, parade, phone);
    // The caption that ends the parade: the page's tracker count, as text.
    const caption = Object.assign(doc.createElement("div"), { className: "found", textContent: `Trackers found: ${found}` });
    fx.querySelector(".parade")!.append(...spirits, caption);
    // Placed through the CSSOM (no style attribute), so a page's style-src CSP has nothing to refuse.
    // On a phone each one is centred in the marquee band, under the address bar (and under any fixed header the bands sit below).
    const band = marqueeTop(croot);
    spirits.forEach((s, i) => {
      const p = PARADE[i]!;
      const size = lanes ? lanes[i]!.size : SPRITES.paradeGhostPhone[0] * (p.near ? 1 : 2 / 3);
      const left = lanes ? lanes[i]!.left : 0;
      Object.assign(s.style, { left: `${left}px`, width: `${size}px`, height: `${size}px` });
      if (phone) s.style.top = `${band + (L.marquee - size) / 2}px`;
    });
    // Its place is set in playHaunt, once it can be measured.
    caption.style.left = "0px";
    // The Webmaster's Ghost flies along the top bands and the welcome banner (ours), not across the page's text.
    fx.style.setProperty("--hg-sweep-top", `${Math.max(0, band - L.neighborhoodBar)}px`);
  }
  croot.append(fx);
  return fx;
}

/**
 * A name tag on two lines keeps its balanced breaks but hugs its longer line, so the plaque is no wider
 * than the name (its max-width only leaves room for the second line's words). Measured once it is drawn.
 */
function hugLines(tag: HTMLElement): void {
  const range = tag.ownerDocument.createRange();
  range.selectNodeContents(tag);
  const rects = typeof range.getClientRects === "function" ? [...range.getClientRects()].filter((r) => r.width > 0) : [];
  if (new Set(rects.map((r) => Math.round(r.top))).size < 2) return;
  const cs = tag.ownerDocument.defaultView!.getComputedStyle(tag);
  const sides = tag.offsetWidth - tag.clientWidth + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); // borders and padding
  tag.style.width = `${Math.ceil(Math.max(...rects.map((r) => r.width)) + sides) + 1}px`;
}

/** A costume element by id, in #crypt-root or in the footer beside it (the same shadow root). */
const layer = (croot: HTMLElement, id: string) => ((croot.parentNode as ParentNode | null) ?? croot).querySelector(`#${id}`) as HTMLElement;

/** The marquee band's top edge: under the bands' 24px address bar. */
const marqueeTop = (croot: HTMLElement) => (layer(croot, "top-bands")?.offsetTop ?? 0) + L.neighborhoodBar;

/** The HUD, and the graveyard strip docked above it when it is drawn: they slide in and out together. */
const bottomBoxes = (croot: HTMLElement) => [layer(croot, "hud"), layer(croot, "graveyard")].filter((el): el is HTMLElement => !!el && !el.hidden);

/** How far the HUD (or the strip above it) must drop to leave the viewport entirely. */
function hudDrop(hud: HTMLElement): number {
  const vh = hud.ownerDocument.defaultView!.innerHeight;
  return Math.max(hud.offsetHeight, Math.ceil(vh - hud.getBoundingClientRect().top)) + 8;
}

// The reveal edge sits 16px into the ghost, so the costume appears right behind it.
const clipAt = (x: string) => `inset(0 calc(100% - ${x}) 0 0)`;

/**
 * A page-sheet layer (the tint or frame pseudo-element of <html>) that wipes in with layer 1.
 * `left` is its box's viewport x, so the same viewport reveal edge is shifted into its own box; the
 * -8px insets keep the frame's line and glow, which sit outside its box, inside the clip.
 */
export type Reveal = { el: Element; pseudo: string; left: number };
const pseudoClip = (x: string, left: number) => `inset(-8px calc(100% - ${x} + ${left}px) -8px -8px)`;

/**
 * The haunt moment; `parade` is the page's tracker companies (paradeOf), drawn as the parade ghosts,
 * and `found` how many there are in all (the caption's count, which may be more than six).
 */
export function playHaunt(croot: HTMLElement, reduced: boolean, reveal: Reveal[] = [], parade: readonly ParadeGhost[] = [], found = parade.length): Moment {
  const win = croot.ownerDocument.defaultView!;
  if (reduced) {
    const fade = croot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.reducedHaunt, easing: "linear" });
    return skippable(win, { done: settle([fade]), finish: () => fade.finish() });
  }
  const fx = buildFx(croot, true, parade, found);
  fx.querySelectorAll<HTMLElement>(".spirit .name").forEach(hugLines);
  const q = (sel: string) => fx.querySelector(sel)!;
  const hud = layer(croot, "hud");
  const anims: Animation[] = [];
  const run = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => anims.push(el.animate(kf, { fill: "backwards", ...o }));
  const at = ([from, to]: readonly [number, number]) => ({ delay: from, duration: to - from });
  const wipe = { delay: H.wipeStart, duration: 900, easing: M.easeInOut };

  // The phase follows two marker animations that animate nothing, never a timer, and never goes back.
  fx.dataset.phase = "crt";
  const phases = ["crt", "wipe", "rise"];
  const enter = (phase: string) => () => {
    if (phases.indexOf(phase) > phases.indexOf(fx.dataset.phase!)) fx.dataset.phase = phase;
  };
  for (const [phase, ms] of [["wipe", H.wipeStart], ["rise", H.riseStart]] as const) {
    const marker = fx.animate([], { duration: ms });
    anims.push(marker);
    marker.finished.then(enter(phase), () => undefined);
  }

  // CRT death: scanlines in, the lids close on a phosphor line that shrinks to a dot, the lids open.
  run(q(".scan"), [{ opacity: 0 }, { opacity: 1 }], { duration: H.scanIn, easing: "linear" });
  run(q(".vignette"), [{ opacity: 0 }, { opacity: 0.4 }], { duration: 200, easing: M.easeOut });
  for (const [fade, kf] of [[q(".scan"), [1, 0]], [q(".vignette"), [0.4, 0]]] as const) {
    run(fade, kf.map((opacity) => ({ opacity })), { ...at(H.fxOut), easing: M.easeOut, fill: "forwards" });
  }
  for (const [cls, off] of [["top", "-100%"], ["bottom", "100%"]] as const) {
    const lid = q(`.lid.${cls}`);
    run(lid, [{ transform: `translateY(${off})` }, { transform: "translateY(0%)" }], { ...at(H.lidsClose), easing: M.easeInOut, fill: "both" });
    run(lid, [{ transform: "translateY(0%)" }, { transform: `translateY(${off})` }], { ...at(H.lidsOpen), easing: M.easeInOut, fill: "forwards" });
  }
  // At rest the line is opacity 0, so it is only there while it shrinks.
  run(q(".phosphor"), [{ transform: "scaleX(1)", opacity: 1 }, { transform: "scaleX(0)", opacity: 1 }], { ...at(H.line), easing: M.easeOut, fill: "none" });

  // The scene-wide part. As the tube comes back on, one band of scanlines rolls down the whole page (the
  // vertical hold slipping once); then six big tracker ghosts drift up through it, bottom edge to top edge.
  // On a phone the text fills the screen, so they ride the marquee band left to right instead, spaced out.
  const { innerHeight: vh, innerWidth: vw } = win;
  run(q(".roll"), [{ transform: "translateY(-100%)" }, { transform: `translateY(${vh}px)` }], { ...at(H.roll), easing: "linear", fill: "both" });
  // In the gutters beside the page's table they drift straight up (no sideways drift out of the gutter).
  const band = fx.dataset.parade === "band";
  fx.querySelectorAll<HTMLElement>(".spirit").forEach((s, i) => {
    const size = parseFloat(s.style.width) || paradeSize(PARADE[i]!.near, vw);
    const path = band
      ? [{ transform: `translate(-${size + PARADE_GLOW}px, 0px)` }, { transform: `translate(${vw + PARADE_GLOW}px, 0px)` }]
      : [{ transform: `translate(0px, ${vh + PARADE_GLOW}px)` }, { transform: `translate(0px, -${size + PARADE_GLOW}px)` }];
    const [stagger, duration] = band ? [H.paradePhoneStagger, H.paradePhoneMs] : [H.paradeStagger, H.paradeMs];
    run(s, path, { delay: H.paradeStart + i * stagger, duration, easing: "linear", fill: "both" });
  });
  // The caption keeps to the marquee band at every width (costume chrome, never the page's text): it rides
  // in from the left edge at the phone train's speed (its ride in a second), rests centred in the band
  // under the address bar and holds there to captionOut, a beat after the 3000ms moment. On a phone it
  // sets off one beat behind the last ghost, so the gap to it holds on the way in.
  const caption = q(".found") as HTMLElement;
  const [w, h] = [caption.offsetWidth, caption.offsetHeight || 22];
  const restX = Math.round((vw - w) / 2);
  caption.style.top = `${marqueeTop(croot) + (L.marquee - h) / 2}px`;
  const start = isPhone(vw) ? H.captionPhoneStart : H.captionStart;
  const rest = start + ((restX + w) * H.paradePhoneMs) / phoneRide(vw);
  const resting = { transform: `translate(${restX}px, 0px)` };
  run(caption, [{ transform: "translate(-100%, 0px)" }, { ...resting, offset: (rest - start) / (H.captionOut - start) }, resting], {
    delay: start,
    duration: H.captionOut - start,
    easing: "linear",
    fill: "both",
  });

  run(q(".sweep"), [{ transform: "translateX(-96px)" }, { transform: "translateX(100vw)" }], { ...wipe, fill: "both" });
  run(
    q(".webmaster"),
    ["translateY(0px)", "translateY(-6px)", "translateY(0px)", "translateY(6px)", "translateY(0px)"].map((transform) => ({ transform, easing: "ease-in-out" })),
    { delay: H.wipeStart, duration: 900 },
  );
  for (const id of ["starfield", "top-bands"]) {
    run(layer(croot, id), [{ clipPath: clipAt("-80px") }, { clipPath: clipAt("100vw - 16px") }], wipe);
  }
  for (const r of reveal) {
    run(r.el, [{ clipPath: pseudoClip("-80px", r.left) }, { clipPath: pseudoClip("(100vw - 16px)", r.left) }], { ...wipe, pseudoElement: r.pseudo });
  }
  // Tracker ghosts rise 48px out of the page one by one, 250ms apart (the 9th onward with the 8th),
  // and each name tag pops in 200ms after its ghost starts.
  croot.querySelectorAll("#lanes > :not(.vampire)").forEach((g, i) => {
    const start = H.riseStart + Math.min(i, 7) * H.riseStagger;
    anims.push(riseIn(g, start, H.risePx, H.riseMs));
    const tag = g.querySelector(".tag");
    if (tag) run(tag, [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], { delay: start + H.tagDelay, duration: H.tagMs, easing: M.easeOut });
  });
  // Vampires fade in after the first ghosts, then the caught ones swell into their hot glow once.
  croot.querySelectorAll<HTMLElement>("#lanes > .vampire").forEach((v) => anims.push(...vampireIn(v, H.vampires)));
  for (const box of bottomBoxes(croot)) run(box, [{ transform: `translateY(${hudDrop(box)}px)` }, { transform: "translateY(0px)" }], { delay: H.hud, duration: M.slow, easing: M.easeOut });
  // Odometer: each strip rolls from 0 to its digit, the right-hand digit first, all landing together.
  const [rollFrom, rollTo] = H.odometer;
  const strips = [...hud.querySelectorAll<HTMLElement>(".strip")];
  strips.forEach((s, i) => {
    const delay = rollFrom + (strips.length - 1 - i) * 40;
    run(s, [{ transform: "translateY(0px)" }, { transform: s.style.transform || "translateY(0px)" }], { delay, duration: rollTo - delay, easing: M.easeOut });
  });
  run(layer(croot, "markers"), [{ opacity: 0 }, { opacity: 1 }], { delay: H.markers, duration: 200, easing: "linear" });

  return skippable(win, { done: settle(anims).then(() => fx.remove()), finish: () => anims.forEach((a) => a.finish()) });
}

export function playUnhaunt(croot: HTMLElement, reduced: boolean, reveal: Reveal[] = []): Promise<void> {
  const run = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => el.animate(kf, { fill: "forwards", ...o });
  if (reduced) return settle([run(croot, [{ opacity: 1 }, { opacity: 0 }], { duration: M.reducedUnhaunt, easing: "linear" })]);
  croot.querySelector("#fx")?.remove();
  croot.classList.add("leaving");
  const fx = buildFx(croot, false);
  const back = { delay: 500, duration: 600, easing: M.easeInOut };
  // The page-sheet layers shrink away too; their held end state is dropped in the same task as the
  // sheet (no frame is drawn in between), so no finished animation is left on the page's <html>.
  const pseudo = reveal.map((r) =>
    run(r.el, [{ clipPath: pseudoClip("(100vw + 80px)", r.left) }, { clipPath: pseudoClip("-16px", r.left) }], { ...back, pseudoElement: r.pseudo }),
  );
  return settle([
    ...pseudo,
    run(layer(croot, "markers"), [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear" }),
    run(layer(croot, "lanes"), [{ transform: "translateY(0px)", opacity: 1 }, { transform: "translateY(16px)", opacity: 0 }], { delay: 200, duration: 300, easing: M.easeOut }),
    ...bottomBoxes(croot).map((box) => run(box, [{ transform: "translateY(0px)" }, { transform: `translateY(${hudDrop(box)}px)` }], { delay: 300, duration: 300, easing: M.easeOut })),
    run(layer(croot, "show-tab"), [{ opacity: 1 }, { opacity: 0 }], { delay: 300, duration: 300, easing: "linear" }),
    run(fx.querySelector(".sweep")!, [{ transform: "translateX(100vw)" }, { transform: "translateX(-96px)" }], { ...back, fill: "both" }),
    ...["starfield", "top-bands"].map((id) =>
      run(layer(croot, id), [{ clipPath: clipAt("100vw + 80px") }, { clipPath: clipAt("-16px") }], back),
    ),
  ]).then(() => pseudo.forEach((a) => a.cancel()));
}
