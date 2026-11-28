// One ghost per tracker company, in the gutter lanes: never over page text. On a page without a 64px
// gutter the same sprites dock in the graveyard strip above the HUD instead (graveyard.ts).
import type { CompanyHit } from "../../data/types";
import { caughtLine } from "../vampire";
import { GHOST, ghostLegend, mapToPx, svgMarkup, VAMPIRE, VAMPIRE_LEGEND } from "./art";
import type { Column } from "./starfield";
import { HEM_TINTS, LAYOUT as L, MOTION as M, PALETTE as P, PIXEL } from "./tokens";

/** The hot backlight (ref 07), and the same shadow at zero radius: the glow swell's start. */
export const VAMPIRE_GLOW_HI = "#ff9999"; // DESIGN.md "Vampires": the glow's inner highlight
export const VAMPIRE_GLOW = `drop-shadow(0 0 6px ${P.vampireGlow}) drop-shadow(0 0 2px ${VAMPIRE_GLOW_HI})`;
const VAMPIRE_GLOW_OFF = `drop-shadow(0 0 0px ${P.vampireGlow}) drop-shadow(0 0 0px ${VAMPIRE_GLOW_HI})`;

export type Slot = { side: "left" | "right"; x: number; y: number; w: number };
export type Rect = { left: number; right: number; top: number; bottom: number };

/** hash(company) mod 6 over the hem tints. */
export function hemTint(company: string): string {
  let h = 0;
  for (const c of company) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HEM_TINTS[h % HEM_TINTS.length]!;
}

/**
 * One tint per company, for companies in ghost order: the base tint, moved to the next tint until
 * it differs from the two before (the neighbour beside it and the one above it in the same lane).
 */
export function assignTints(companies: readonly string[]): string[] {
  const out: string[] = [];
  for (const company of companies) {
    const recent = out.slice(-2);
    let i = HEM_TINTS.indexOf(hemTint(company) as (typeof HEM_TINTS)[number]);
    while (recent.includes(HEM_TINTS[i]!)) i = (i + 1) % HEM_TINTS.length;
    out.push(HEM_TINTS[i]!);
  }
  return out;
}

export const ghostSvg = (tint: string) => svgMarkup(mapToPx(GHOST, ghostLegend(tint), PIXEL.spriteScale), 48, 48);
export const vampireSvg = () => svgMarkup(mapToPx(VAMPIRE, VAMPIRE_LEGEND, PIXEL.spriteScale), 48, 54);

/** Most requests first, then by name: the order of the lanes and the popup list. */
export const byCountThenName = (a: CompanyHit, b: CompanyHit) => b.count - a.count || (a.company < b.company ? -1 : a.company > b.company ? 1 : 0);

/** The company's shortest category ("Advertising" over "Ad Motivated Tracking"), else "Tracker". */
export const categoryOf = (hit: CompanyHit) => hit.categories.reduce<string | undefined>((a, c) => (!a || c.length < a.length ? c : a), undefined) ?? "Tracker";

const LABEL_ROOM = 96; // the widest lane tag (12ch, cut with an ellipsis)

/**
 * Lane slots at a 72px pitch from `top` to `bottom` (the bands and the HUD), one lane centred in
 * each gutter that is 64px or wider, rows alternating left/right. Slots crossing text are skipped.
 */
export function planSlots(gutters: Column | null, viewportWidth: number, top: number, bottom: number, text: Rect[]): Slot[] {
  if (!gutters) return [];
  const lanes = (["left", "right"] as const).flatMap((side) => {
    const g = gutters[side];
    if (g < L.laneWidth) return [];
    const w = Math.min(g, LABEL_ROOM);
    const start = side === "left" ? 0 : viewportWidth - g;
    return [{ side, x: Math.floor(start + (g - w) / 2), w }];
  });
  const out: Slot[] = [];
  for (let y = top + 8; y + L.slotPitch <= bottom; y += L.slotPitch) {
    for (const lane of lanes) {
      const crosses = text.some((r) => r.left < lane.x + lane.w && r.right > lane.x && r.top < y + L.slotPitch && r.bottom > y);
      if (!crosses) out.push({ ...lane, y });
    }
  }
  return out;
}

export interface GhostOptions {
  exorcised: ReadonlySet<string>;
  onOpen: (company: string, el: HTMLElement) => void;
  /** Rise into the slot (ghosts that arrive after the haunt moment). */
  rise: boolean;
}

const place = (el: HTMLElement, s: Slot) => Object.assign(el.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px` });

export const riseIn = (el: Element, delay = 0, dy = 16, duration: number = M.slow) =>
  el.animate([{ transform: `translateY(${dy}px)`, opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }], { delay, duration, easing: M.easeOut, fill: "backwards" });

/**
 * A vampire arrives: fade and rise 8px over 300ms, then (caught ones only) one glow swell from no
 * shadow to the static hot glow. Monotonic, nothing toggles back.
 */
export function vampireIn(el: HTMLElement, delay = 0): Animation[] {
  const anims = [el.animate([{ transform: "translateY(8px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }], { delay, duration: M.slow, easing: M.easeOut, fill: "backwards" })];
  const sprite = el.querySelector(".sprite");
  if (sprite && !el.classList.contains("known")) {
    anims.push(sprite.animate([{ filter: VAMPIRE_GLOW_OFF }, { filter: VAMPIRE_GLOW }], { delay: delay + M.slow, duration: M.slow, easing: M.easeOut, fill: "backwards" }));
  }
  return anims;
}

const STAMP_TILT = "translateX(-50%) rotate(-12deg)"; // the stamp's resting transform (styles.ts)

/**
 * The exorcise moment: the sprite spirals once (a full turn, shrinking to half and back) while it
 * fades from its look to 40%, and the EXORCISED stamp slams on over the second half. Played once,
 * only on the change; the fade never goes back up.
 */
export function exorciseOut(el: HTMLElement): Animation[] {
  const from = el.classList.contains("known") ? 0.6 : 1;
  const sprite = el.querySelector(".sprite")!;
  const stamp = el.querySelector(".stamp")!;
  return [
    sprite.animate(
      [
        { transform: "rotate(0deg) scale(1)", opacity: from },
        { transform: "rotate(180deg) scale(.5)", opacity: (from + 0.4) / 2 },
        { transform: "rotate(360deg) scale(1)", opacity: 0.4 },
      ],
      { duration: M.exorcise, easing: M.easeInOut },
    ),
    stamp.animate(
      [{ transform: `${STAMP_TILT} scale(1.5)`, opacity: 0 }, { transform: `${STAMP_TILT} scale(1)`, opacity: 1 }],
      { delay: M.exorcise / 2, duration: M.exorcise / 2, easing: M.easeOut, fill: "backwards" },
    ),
  ];
}

const kindOf = (hit: CompanyHit) => (hit.vampire ? "vampire" : "ghost");
const byName = (a: CompanyHit, b: CompanyHit) => (a.company < b.company ? -1 : a.company > b.company ? 1 : 0);

/**
 * The name on a sprite's tag: the company without its owner in brackets ("Google Analytics (Google)"
 * reads "Google Analytics"), so companies of one owner never share a cut-off prefix. The full name
 * stays in the accessible name and the card.
 */
export const tagName = (company: string) => company.replace(/\s*\([^()]*\)$/, "") || company;

function label(hit: CompanyHit): string {
  if (!hit.vampire) return `${hit.company}, tracker ghost, seen ${hit.count} ${hit.count === 1 ? "time" : "times"}`;
  return hit.vampire.caught.length ? `${hit.company}, vampire, caught doing ${caughtLine(hit.vampire.caught)}` : `${hit.company}, vampire, known to fingerprint`;
}

/** Ghosts by count then name, then vampires by name: the order of the lanes and of the graveyard strip. */
export function orderCompanies(companies: readonly CompanyHit[]): CompanyHit[] {
  return [...companies.filter((c) => !c.vampire).sort(byCountThenName), ...companies.filter((c) => c.vampire).sort(byName)];
}

/** Hem tints over every ghost in `sorted` (slotted or not, so a tint never depends on the number of slots). */
export function tintsOf(sorted: readonly CompanyHit[]): Map<string, string> {
  const ghosts = sorted.filter((c) => !c.vampire).map((g) => g.company);
  const list = assignTints(ghosts);
  return new Map(ghosts.map((g, i) => [g, list[i]!]));
}

const keyOf = (el: HTMLElement) => `${el.classList.contains("vampire") ? "vampire" : "ghost"}:${el.dataset.company}`;

/** The company sprites under `parent`, by `kind:company`, for reuse across updates. */
export const spritesByKey = (parent: Element) => new Map([...parent.querySelectorAll<HTMLElement>(".ghost, .vampire")].map((g) => [keyOf(g), g]));

/** A new company sprite: a button holding the floating sprite and its name tag; a click opens its card. */
export function makeSprite(doc: Document, hit: CompanyHit, tint: string | undefined, opts: GhostOptions): HTMLElement {
  const kind = kindOf(hit);
  const el = doc.createElement("button");
  el.setAttribute("type", "button");
  el.className = kind;
  el.dataset.company = hit.company;
  if (tint) {
    el.dataset.tint = tint;
    el.style.setProperty("--tint", tint); // the tag's ground: the name is worn in the hem's colour
  }
  el.innerHTML =
    kind === "ghost"
      ? `<span class="sway"><span class="bob"><span class="sprite">${ghostSvg(tint!)}</span></span></span><span class="tag"></span>`
      : `<span class="bob"><span class="sprite">${vampireSvg()}</span></span><span class="tag"></span>`;
  el.querySelector(".tag")!.textContent = tagName(hit.company);
  el.addEventListener("click", () => opts.onOpen(hit.company, el));
  el.classList.toggle("known", !!hit.vampire?.knownOnly);
  if (opts.rise) kind === "ghost" ? riseIn(el) : vampireIn(el);
  return el;
}

/** The sprite's label, `known` look, and the exorcised class and stamp. */
export function applyState(el: HTMLElement, hit: CompanyHit, exorcised: boolean): void {
  el.classList.toggle("known", !!hit.vampire?.knownOnly);
  el.setAttribute("aria-label", label(hit));
  el.classList.toggle("exorcised", exorcised);
  const stamp = el.querySelector(".stamp");
  if (exorcised && !stamp) el.insertAdjacentHTML("beforeend", `<span class="stamp" aria-hidden="true">EXORCISED</span>`);
  if (!exorcised) stamp?.remove();
}

/** The company's sprite from `old` (taken out of it), else a new one, up to date. */
export function spriteFor(doc: Document, old: Map<string, HTMLElement>, hit: CompanyHit, tint: string | undefined, opts: GhostOptions): HTMLElement {
  const key = `${kindOf(hit)}:${hit.company}`;
  let el = old.get(key);
  old.delete(key);
  const drawn = !!el;
  if (!el) el = makeSprite(doc, hit, tint, opts);
  else if (tint && el.dataset.tint !== tint) {
    // The order changed under it: redraw only the sprite; the button, its focus and label stay.
    el.dataset.tint = tint;
    el.style.setProperty("--tint", tint);
    el.querySelector(".sprite")!.innerHTML = ghostSvg(tint);
  }
  const was = el.classList.contains("exorcised");
  const now = opts.exorcised.has(hit.company);
  applyState(el, hit, now);
  // Exorcised while on screen: its moment plays (never for a sprite drawn already exorcised).
  if (drawn && now && !was && opts.rise) exorciseOut(el);
  return el;
}

/** Put the companies into the lanes, ghosts by count then vampires by name, reusing each one's element across updates. */
export function updateGhosts(lanes: HTMLElement, companies: readonly CompanyHit[], slots: readonly Slot[], opts: GhostOptions): void {
  const doc = lanes.ownerDocument;
  const sorted = orderCompanies(companies);
  const tints = tintsOf(sorted);
  const overflow = sorted.length > slots.length && slots.length > 0;
  const shown = sorted.slice(0, overflow ? slots.length - 1 : slots.length);
  const old = spritesByKey(lanes);

  const keep = shown.map((hit, i) => {
    const el = spriteFor(doc, old, hit, tints.get(hit.company), opts);
    place(el, slots[i]!);
    el.style.setProperty("--phase", `${-i * 700}ms`);
    return el;
  });

  for (const el of old.values()) el.remove();
  lanes.querySelector(".stack")?.remove();
  // Only new ghosts are appended: moving a focused ghost in the DOM would drop its focus.
  lanes.append(...keep.filter((el) => el.parentNode !== lanes));
  if (overflow) {
    const n = sorted.length - shown.length;
    const stack = doc.createElement("span");
    stack.className = "stack";
    stack.setAttribute("role", "img");
    stack.setAttribute("aria-label", `${n} more ${sorted.slice(shown.length).some((c) => c.vampire) ? "ghosts and vampires" : "ghosts"}`);
    stack.textContent = `+${n}`;
    place(stack, slots[slots.length - 1]!);
    lanes.append(stack);
  }
}
