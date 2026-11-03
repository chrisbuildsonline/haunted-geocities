// One ghost per tracker company, in the gutter lanes only: never over page text, never on a page
// without a 64px gutter (those ghosts live in the HUD count and the popup list).
import type { CompanyHit } from "../../data/types";
import { GHOST, ghostLegend, mapToPx, svgMarkup } from "./art";
import type { Column } from "./starfield";
import { HEM_TINTS, LAYOUT as L, MOTION as M, PIXEL } from "./tokens";

export type Slot = { side: "left" | "right"; x: number; y: number; w: number };
export type Rect = { left: number; right: number; top: number; bottom: number };

/** hash(company) mod 6 over the hem tints. */
export function hemTint(company: string): string {
  let h = 0;
  for (const c of company) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HEM_TINTS[h % HEM_TINTS.length]!;
}

export const ghostSvg = (company: string) => svgMarkup(mapToPx(GHOST, ghostLegend(hemTint(company)), PIXEL.spriteScale), 48, 48);

/** Most requests first, then by name: the order of the lanes and the popup list. */
export const byCountThenName = (a: CompanyHit, b: CompanyHit) => b.count - a.count || (a.company < b.company ? -1 : a.company > b.company ? 1 : 0);

/** The company's shortest category ("Advertising" over "Ad Motivated Tracking"), else "Tracker". */
export const categoryOf = (hit: CompanyHit) => hit.categories.reduce<string | undefined>((a, c) => (!a || c.length < a.length ? c : a), undefined) ?? "Tracker";

const LABEL_ROOM = 96; // a 12ch Comic Sans 11px label

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

export const riseIn = (el: Element, delay = 0) =>
  el.animate([{ transform: "translateY(16px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }], { delay, duration: M.slow, easing: M.easeOut, fill: "backwards" });

/** Put the companies' ghosts into the lanes, reusing each company's element across updates. */
export function updateGhosts(lanes: HTMLElement, companies: readonly CompanyHit[], slots: readonly Slot[], opts: GhostOptions): void {
  const doc = lanes.ownerDocument;
  const sorted = [...companies].sort(byCountThenName);
  const overflow = sorted.length > slots.length && slots.length > 0;
  const shown = sorted.slice(0, overflow ? slots.length - 1 : slots.length);
  const old = new Map([...lanes.querySelectorAll<HTMLElement>(".ghost")].map((g) => [g.dataset.company!, g]));

  const keep = shown.map((hit, i) => {
    let el = old.get(hit.company);
    old.delete(hit.company);
    if (!el) {
      el = doc.createElement("button");
      el.setAttribute("type", "button");
      el.className = "ghost";
      el.dataset.company = hit.company;
      el.innerHTML = `<span class="sway"><span class="bob"><span class="sprite">${ghostSvg(hit.company)}</span></span></span><span class="tag"></span>`;
      el.querySelector(".tag")!.textContent = hit.company;
      const button = el;
      el.addEventListener("click", () => opts.onOpen(hit.company, button));
      if (opts.rise) riseIn(el);
    }
    place(el, slots[i]!);
    el.style.setProperty("--phase", `${-i * 700}ms`);
    el.setAttribute("aria-label", `${hit.company}, tracker ghost, seen ${hit.count} ${hit.count === 1 ? "time" : "times"}`);
    const exorcised = opts.exorcised.has(hit.company);
    el.classList.toggle("exorcised", exorcised);
    const stamp = el.querySelector(".stamp");
    if (exorcised && !stamp) el.insertAdjacentHTML("beforeend", `<span class="stamp" aria-hidden="true">EXORCISED</span>`);
    if (!exorcised) stamp?.remove();
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
    stack.setAttribute("aria-label", `${n} more ghosts`);
    stack.textContent = `+${n}`;
    place(stack, slots[slots.length - 1]!);
    lanes.append(stack);
  }
}
