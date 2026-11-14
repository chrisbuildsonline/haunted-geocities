// The top bands: the neighborhood bar (with the under-construction sign) and the marquee.
import type { Neighborhood } from "../../data/neighborhood";
import { pinnedBoxes } from "./sample";
import { MOTION } from "./tokens";

export const MARQUEE_LINES = [
  "~*~ Welcome to my haunted homepage!!! ~*~",
  "~*~ Best viewed at 800x600 ~*~",
  "~*~ Sign my guestbook before you leave ~*~",
];

/** Seconds for the marquee to travel `px` at 60px/s. */
export const marqueeSeconds = (px: number) => px / MOTION.marqueePxPerSec;

/** The bands for neighborhood `n`: the address and the tagline go in as text, never markup. */
export function buildBands(doc: Document, n: Neighborhood): HTMLElement {
  const bands = doc.createElement("div");
  bands.id = "top-bands";
  bands.innerHTML =
    `<div id="neighborhood"><span class="where">You are in: <b></b></span><span class="tagline"></span>` +
    `<span class="sign" role="img" aria-label="Under construction"><span class="sign-strip"></span></span></div>` +
    `<div id="marquee"><span class="marquee-track"></span></div>`;
  bands.querySelector("b")!.textContent = n.address;
  bands.querySelector(".tagline")!.textContent = n.tagline;
  return bands;
}

/** Bottom of page UI fixed or sticky at y=0 (sampled along the top row), else 0. */
export function topOffset(doc: Document): number {
  return Math.max(0, ...pinnedBoxes(doc, [1]).filter((r) => r.top <= 1).map((r) => Math.ceil(r.bottom)));
}
