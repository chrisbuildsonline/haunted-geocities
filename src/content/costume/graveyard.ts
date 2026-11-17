// The docked graveyard: on a page with no 64px gutter (full-overlay mode) the ghosts and vampires
// stand in a strip docked 4px above the HUD, in lane order, one 48px button each, scrolling sideways
// when they do not fit. The same sprites, labels and cards as in the lanes (ghosts.ts).
import type { CompanyHit } from "../../data/types";
import { orderCompanies, spriteFor, spritesByKey, tintsOf, type GhostOptions } from "./ghosts";
import { icon } from "./hud";

/** The empty strip, hidden until render.ts docks the companies in it. */
export function buildGraveyard(doc: Document): HTMLElement {
  const strip = doc.createElement("div");
  strip.id = "graveyard";
  strip.hidden = true;
  strip.setAttribute("role", "region");
  strip.setAttribute("aria-label", "Graveyard of trackers");
  strip.innerHTML =
    `<div class="gy-bar" aria-hidden="true"><span class="gy-icon">${icon("tomb")}</span><span class="gy-title"></span></div>` +
    `<div class="stones"></div><p class="gy-empty">No graves yet.</p>`;
  strip.querySelector(".gy-title")!.textContent = "Graveyard";
  return strip;
}

/**
 * Dock `companies` in the strip: each company keeps its element across updates, and the DOM order
 * (which is the visual and the Tab order) follows the lane order by moving the other sprites around
 * a focused one, never the focused one itself (moving it would drop its focus).
 */
export function updateDocked(strip: HTMLElement, companies: readonly CompanyHit[], opts: GhostOptions): void {
  const doc = strip.ownerDocument;
  const row = strip.querySelector<HTMLElement>(".stones")!;
  const sorted = orderCompanies(companies);
  const tints = tintsOf(sorted);
  const old = spritesByKey(row);
  const keep = sorted.map((hit, i) => {
    const el = spriteFor(doc, old, hit, tints.get(hit.company), opts);
    el.style.setProperty("--phase", `${-i * 700}ms`);
    return el;
  });
  for (const el of old.values()) el.remove();

  if (keep.some((el, i) => row.children[i] !== el)) {
    const active = (strip.getRootNode() as Document | ShadowRoot).activeElement;
    const pinned = keep.find((el) => el === active && el.parentNode === row);
    const at = pinned ? keep.indexOf(pinned) : -1;
    keep.forEach((el, i) => {
      if (el === pinned) return;
      if (pinned && i < at) row.insertBefore(el, pinned);
      else row.append(el);
    });
  }
  row.hidden = keep.length === 0;
  (strip.querySelector(".gy-empty") as HTMLElement).hidden = keep.length > 0;
}
