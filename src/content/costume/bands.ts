// The top bands: the neighborhood bar (with the under-construction sign) and the marquee.
import { pinnedBoxes } from "./sample";
import { MOTION } from "./tokens";

const AREAS = ["Area51", "Heartland", "SiliconValley", "SunsetStrip", "Tokyo", "Vienna"];

/** A stable placeholder neighborhood per host (real assignments come from src/data/ later). */
export function neighborhoodFor(host: string): string {
  let h = 0x811c9dc5;
  for (const c of host) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return `${AREAS[h % AREAS.length]}/Vault/${1000 + ((h >>> 8) % 9000)}`;
}

export const MARQUEE_LINES = [
  "~*~ Welcome to my haunted homepage!!! ~*~",
  "~*~ Best viewed at 800x600 ~*~",
  "~*~ Sign my guestbook before you leave ~*~",
];

/** Seconds for the marquee to travel `px` at 60px/s. */
export const marqueeSeconds = (px: number) => px / MOTION.marqueePxPerSec;

export function buildBands(doc: Document, neighborhood: string): HTMLElement {
  const bands = doc.createElement("div");
  bands.id = "top-bands";
  bands.innerHTML =
    `<div id="neighborhood"><span class="where">You are in: <b></b></span>` +
    `<span class="sign" role="img" aria-label="Under construction"><span class="sign-strip"></span></span></div>` +
    `<div id="marquee"><span class="marquee-track"></span></div>`;
  bands.querySelector("b")!.textContent = neighborhood;
  return bands;
}

/** Bottom of page UI fixed or sticky at y=0 (sampled along the top row), else 0. */
export function topOffset(doc: Document): number {
  return Math.max(0, ...pinnedBoxes(doc, [1]).filter((r) => r.top <= 1).map((r) => Math.ceil(r.bottom)));
}
