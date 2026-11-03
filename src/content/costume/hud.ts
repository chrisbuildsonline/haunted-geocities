// The HUD: Hide, the counts (or the empty state), the hit counter and the web ring.
import { ICON_LEGEND, ICONS, mapToPx, svgMarkup } from "./art";
import { pinnedBoxes } from "./sample";
import { PIXEL } from "./tokens";

export type Counts = { ghosts: number; vampires: number; tombstones: number; curses: number };

const KINDS = [
  ["ghosts", "ghost"], ["vampires", "vampire"], ["tombstones", "tomb"], ["curses", "curse"],
] as const;

export const icon = (name: keyof typeof ICONS) => svgMarkup(mapToPx(ICONS[name], ICON_LEGEND, PIXEL.iconScale), 16, 16);

export function buildHud(doc: Document): HTMLElement {
  const hud = doc.createElement("div");
  hud.id = "hud";
  hud.setAttribute("role", "region");
  hud.setAttribute("aria-label", "Haunted GeoCities");
  const counts = KINDS.map(
    ([kind, art]) => `<li class="count ${kind}"><span aria-hidden="true">${icon(art)}</span><span class="n">0</span><span class="sr"> ${kind}</span></li>`,
  ).join("");
  hud.innerHTML =
    `<button class="hide win95" type="button">Hide</button>` +
    `<ul class="counts" hidden aria-label="Found on this page">${counts}</ul>` +
    `<p class="empty">No ghosts here. Suspiciously clean.</p><div class="hud-break" aria-hidden="true"></div>` +
    `<div class="hits" role="img"><span class="label" aria-hidden="true">Souls counted:</span>` +
    `<span class="odo" aria-hidden="true">${`<span class="cell"><span class="strip"></span></span>`.repeat(6)}</span></div>` +
    `<nav class="ring" aria-label="Haunted WebRing"><button class="prev" type="button">« prev</button> | ` +
    `<span class="ring-name">Haunted WebRing</span> | <button class="next" type="button">next »</button></nav>`;
  setOdometer(hud, 0);
  return hud;
}

/** Show the counts, or the empty state when nothing was found. */
export function setCounts(hud: HTMLElement, c: Counts): void {
  for (const [kind] of KINDS) hud.querySelector(`.count.${kind} .n`)!.textContent = String(c[kind]);
  const empty = KINDS.every(([kind]) => c[kind] === 0);
  (hud.querySelector(".counts") as HTMLElement).hidden = empty;
  (hud.querySelector(".empty") as HTMLElement).hidden = !empty;
}

/** The six digits of `value`, left to right. */
export const odometerDigits = (value: number) => [...String(Math.max(0, Math.floor(value)) % 1e6).padStart(6, "0")].map(Number);

/** Park each digit strip on its digit (16px per digit). */
export function setOdometer(hud: HTMLElement, value: number): void {
  const digits = odometerDigits(value);
  hud.querySelectorAll<HTMLElement>(".strip").forEach((s, i) => (s.style.transform = `translateY(${-16 * digits[i]!}px)`));
  hud.querySelector(".hits")!.setAttribute("aria-label", `Souls counted: ${digits.join("")}`);
}

/** Height of page UI fixed to the bottom (sampled along the bottom 80px), else 0. */
export function sampleBottomLift(doc: Document): number {
  const vh = doc.defaultView!.innerHeight;
  const ys = Array.from({ length: 10 }, (_, i) => vh - 1 - i * 8);
  return Math.max(0, ...pinnedBoxes(doc, ys).filter((r) => r.bottom >= vh - 1).map((r) => Math.ceil(vh - r.top)));
}
