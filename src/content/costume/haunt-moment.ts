// The haunt moment (3000ms: the page dies like a CRT, the Webmaster's Ghost wipes 1998 in, the
// tracker ghosts rise one by one with their name tags) and its reverse (1100ms): Web Animations on
// transform, opacity and clip-path only, all inside the shadow root. Timings from design/DESIGN.md.
import { mapToPx, svgMarkup, WEBMASTER, WEBMASTER_LEGEND } from "./art";
import { ghostSvg as trackerGhostSvg, riseIn, vampireIn } from "./ghosts";
import { HEM_TINTS, MOTION as M, PIXEL, SPRITES } from "./tokens";

const H = M.hero;

export type Moment = { done: Promise<void>; finish(): void };

const settle = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);

const ghostSvg = () => svgMarkup(mapToPx(WEBMASTER, WEBMASTER_LEGEND, PIXEL.spriteScale), 96, 96);

const SWEEP = () => `<div class="sweep"><div class="ectoplasm"></div><div class="webmaster">${ghostSvg()}</div></div>`;

/**
 * The parade: six tracker ghosts, one per hem tint, drift up through the whole page in start order.
 * `x` is the share of the free width left of the sprite; near ones are 144px, far ones 96px and dimmer;
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

const paradeSize = (near: boolean) => (near ? SPRITES.paradeGhost : SPRITES.paradeGhostFar)[0];

/** The FX root: for the haunt, the CRT (scanlines, two lids, the phosphor line) around the vignette, the parade, the ghost and the roll. */
function buildFx(croot: HTMLElement, crt: boolean): HTMLElement {
  const fx = croot.ownerDocument.createElement("div");
  fx.id = "fx";
  fx.setAttribute("aria-hidden", "true");
  if (!crt) fx.innerHTML = SWEEP();
  else {
    const spirits = PARADE.map((p, i) => `<div class="spirit ${p.near ? "near" : "far"}" data-tint="${HEM_TINTS[i]}">${trackerGhostSvg(HEM_TINTS[i]!)}</div>`);
    fx.innerHTML = `<div class="scan"></div><div class="vignette"></div><div class="parade">${spirits.join("")}</div>${SWEEP()}<div class="roll"></div><div class="lid top"></div><div class="lid bottom"></div><div class="phosphor"></div>`;
    // Placed through the CSSOM (no style attribute), so a page's style-src CSP has nothing to refuse.
    const vw = croot.ownerDocument.defaultView!.innerWidth;
    fx.querySelectorAll<HTMLElement>(".spirit").forEach((s, i) => {
      const p = PARADE[i]!;
      s.style.left = `${Math.round(p.x * Math.max(0, vw - paradeSize(p.near)))}px`;
    });
  }
  croot.append(fx);
  return fx;
}

const layer = (croot: HTMLElement, id: string) => croot.querySelector(`#${id}`) as HTMLElement;

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

export function playHaunt(croot: HTMLElement, reduced: boolean, reveal: Reveal[] = []): Moment {
  if (reduced) {
    const fade = croot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.reducedHaunt, easing: "linear" });
    return { done: settle([fade]), finish: () => fade.finish() };
  }
  const fx = buildFx(croot, true);
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
  const vh = croot.ownerDocument.defaultView!.innerHeight;
  run(q(".roll"), [{ transform: "translateY(-100%)" }, { transform: `translateY(${vh}px)` }], { ...at(H.roll), easing: "linear", fill: "both" });
  fx.querySelectorAll(".spirit").forEach((s, i) => {
    const p = PARADE[i]!;
    run(s, [{ transform: `translate(0px, ${vh}px)` }, { transform: `translate(${p.drift}px, -${paradeSize(p.near)}px)` }], {
      delay: H.paradeStart + i * H.paradeStagger,
      duration: H.paradeMs,
      easing: "linear",
      fill: "both",
    });
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

  return { done: settle(anims).then(() => fx.remove()), finish: () => anims.forEach((a) => a.finish()) };
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
