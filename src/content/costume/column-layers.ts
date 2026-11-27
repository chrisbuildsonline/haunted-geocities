// The parchment tint and the guestbook frame over the content column. Both are pseudo-elements
// of <html> drawn by the page sheet, not shadow-root nodes: a `mix-blend-mode` inside the fixed
// <hg-crypt> host blends only within the host's own stacking context, so it cannot multiply with
// the page (the 17.1 spike). They sit in document coordinates, so they scroll with the page on the
// compositor and never lag it. z-index is one under the host, so every costume layer is above them.
// They run the full height of the document, like a 1998 page-long centred table: the top edge is
// under the bands, so no strip of the modern page shows between the bands and the frame.
import { LAYOUT as L, PAGE } from "./tokens";

/** The column across the document (document x) and the document's height. */
export type Span = { left: number; right: number; height: number };
export type Box = { left: number; top: number; width: number; height: number };

/** How far the frame reaches outside the column: the gap, the 6px ridge and the 1px line. */
export const FRAME_OUT = L.frameGap + L.frameBevel + 1;
export const TINT = "::before";
export const FRAME = "::after";
const Z = 2147483646;

/** `s` grown by `by` on both sides, kept inside [0, width], from the top of the document to its end. */
function grow(s: Span, by: number, width: number): Box {
  const left = Math.max(0, Math.floor(s.left - by));
  const right = Math.min(width, Math.ceil(s.right + by));
  return { left, top: 0, width: right - left, height: Math.ceil(s.height) };
}

/** The tint covers the column plus the gap, so the frame's inner edge meets it. */
export const tintBox = (s: Span, width: number) => grow(s, L.frameGap, width);
export const frameBox = (s: Span, width: number) => grow(s, L.frameGap + L.frameBevel, width);

/** The document's height without the pseudo-elements themselves: the end of <body> (with its margin), at least the viewport. */
export function documentHeight(doc: Document): number {
  const win = doc.defaultView!;
  const body = doc.body.getBoundingClientRect().bottom + win.scrollY + (parseFloat(win.getComputedStyle(doc.body).marginBottom) || 0);
  return Math.max(win.innerHeight, Math.ceil(body));
}

const place = (b: Box, z = Z) =>
  `position: absolute !important; display: block !important; box-sizing: border-box !important; ` +
  `left: ${b.left}px !important; top: ${b.top}px !important; width: ${b.width}px !important; height: ${b.height}px !important; ` +
  `margin: 0 !important; padding: 0 !important; transform: none !important; ` +
  `content: "" !important; pointer-events: none !important; z-index: ${z} !important;`;

/** A seeded look's tint and frame: the tint colour and its pale pattern, the bevel style and colours. */
export type LayerLook = { tint: string; pattern: string | null; bevel: "ridge" | "outset" | "inset" | "double"; light: string; dark: string; glow: string };

export function columnLayersCss(o: { tint: Box | null; frame: Box | null; hidden: boolean; look?: LayerLook }): string {
  const opacity = `opacity: ${o.hidden ? 0 : 1} !important;`;
  const out: string[] = [];
  if (o.tint) {
    out.push(`html${TINT} { ${place(o.tint)} border: 0 !important; background: ${o.look ? o.look.tint : PAGE.parchment}${o.look?.pattern ? ` url("${o.look.pattern}") repeat` : ""} !important; mix-blend-mode: multiply !important; ${opacity} }`);
  }
  if (o.frame) {
    const [hi, lo, glow] = o.look ? [o.look.light, o.look.dark, o.look.glow] : [PAGE.frameLight, PAGE.frameDark, PAGE.glow];
    const bevel = o.look?.bevel ?? "ridge";
    // A 6px ridge: an outer 3px band (border) light top-left, an inner 3px band (inset shadows) reversed.
    // Outset and inset are one 6px band; double is two 2px lines.
    const [border, inner] =
      bevel === "ridge" ? [`3px solid !important; border-color: ${hi} ${lo} ${lo} ${hi}`, `inset 3px 3px 0 ${lo}, inset -3px -3px 0 ${hi}, `]
      : bevel === "double" ? [`6px double ${hi}`, ""]
      : [`6px solid !important; border-color: ${bevel === "outset" ? `${hi} ${lo} ${lo} ${hi}` : `${lo} ${hi} ${hi} ${lo}`}`, ""];
    out.push(
      // A seeded look's frame is under the page (z-index -1): it shows round the table, never over the page.
      `html${FRAME} { ${place(o.frame, o.look ? -1 : Z)} border: ${border} !important; ` +
        `box-shadow: ${inner}0 0 0 1px ${PAGE.frameLine}, 0 0 6px 1px ${glow} !important; ` +
        `background: none !important; mix-blend-mode: normal !important; ${opacity} }`,
    );
  }
  // Hide fades them with the rest of the costume; with reduced motion they change at once.
  const sel = [o.tint && `html${TINT}`, o.frame && `html${FRAME}`].filter(Boolean).join(", ");
  if (sel) out.push(`@media (prefers-reduced-motion: no-preference) { ${sel} { transition: opacity 200ms linear; } }`);
  return out.join("\n");
}
