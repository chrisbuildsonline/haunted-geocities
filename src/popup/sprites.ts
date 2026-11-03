// Original pixel-art sprites, drawn as one crisp SVG path per sprite ("X" = filled pixel).

const SPRITES = {
  ghost: [
    "....XXXX....",
    "..XXXXXXXX..",
    ".XXXXXXXXXX.",
    ".XXXXXXXXXX.",
    "XXX..XX..XXX",
    "XXX..XX..XXX",
    "XXXXXXXXXXXX",
    "XXXXX..XXXXX",
    "XXXXXXXXXXXX",
    "XXXXXXXXXXXX",
    "XXXXXXXXXXXX",
    "XX..XXXX..XX",
  ],
  vampire: [
    "X......X",
    "XX....XX",
    "XXX..XXX",
    "XXXXXXXX",
    "X.XXXX.X",
    "..XXXX..",
    "...XX...",
    "........",
  ],
  tombstone: [
    "..XXXX..",
    ".XXXXXX.",
    ".XX..XX.",
    ".X....X.",
    ".XX..XX.",
    ".XX..XX.",
    ".XXXXXX.",
    "XXXXXXXX",
  ],
  curse: [
    ".XXXXXX.",
    "XXXXXXXX",
    "X..XX..X",
    "X..XX..X",
    "XXX..XXX",
    ".XXXXXX.",
    ".X.XX.X.",
    "........",
  ],
} as const;

export type SpriteName = keyof typeof SPRITES;

const SVG_NS = "http://www.w3.org/2000/svg";

/** The list-row ghost: ink outline and eyes, white body, the company's hem tint (as in the costume). */
const TINTED_GHOST = [
  "...oooooo...",
  "..oWWWWWWo..",
  ".oWWWWWWWWo.",
  "oWWWWWWWWWWo",
  "oWWooWWooWWo",
  "oWWooWWooWWo",
  "oWWWWWWWWWWo",
  "oWWWWWWWWWWo",
  "oHHHHHHHHHHo",
  "oHHHHHHHHHHo",
  "oHoHHooHHoHo",
  ".o.oo..oo.o.",
];

/** The tinted ghost at 2x (24px), decorative. */
export function tintedGhost(doc: Document, hem: string): SVGSVGElement {
  return pixelSvg(doc, TINTED_GHOST, [["o", "#111318"], ["W", "#ffffff"], ["H", hem]]);
}

/** The list-row vampire bust: widow's peak, red eyes, fangs, the blood-lined collar and a red clasp. */
export const VAMPIRE_BUST = [
  "...oooooo...",
  "..oooooooo..",
  "o.ooWooWoo.o",
  "oLoWWWWWWoLo",
  "oLoWRWWRWoLo",
  "oLoWWWWWWoLo",
  "oLoWooooWoLo",
  "oLLoWooWoLLo",
  "ooLLoRRoLLoo",
  "oooLLooLLooo",
  "oLooooooooLo",
  "oo.oo..oo.oo",
];
const VAMPIRE_FILLS = [["o", "#111318"], ["W", "#ffffff"], ["L", "#660000"], ["R", "#ff0033"]] as const;

/** The vampire bust at 2x (24px), decorative. */
export function vampireTile(doc: Document): SVGSVGElement {
  return pixelSvg(doc, VAMPIRE_BUST, VAMPIRE_FILLS);
}

/** The list-row headstone: ink outline and carved cross, white stone shaded on its right, moss at the foot. */
export const TOMB_TILE = [
  "....oooo....",
  "..ooWWWWoo..",
  ".oWWWWWWWSo.",
  ".oWWWooWWSo.",
  ".oWWooooWSo.",
  ".oWWWooWWSo.",
  ".oWWWooWWSo.",
  ".oWWWWWWWSo.",
  ".oWWWWWWWSo.",
  ".oMWWMWMWMo.",
  "MMMMMMMMMMMM",
  "MMMMMMMMMMMM",
];

/** The headstone at 2x (24px), decorative. */
export function tombTile(doc: Document): SVGSVGElement {
  return pixelSvg(doc, TOMB_TILE, [["o", "#111318"], ["W", "#ffffff"], ["S", "#cccccc"], ["M", "#336633"]]);
}

function pixelSvg(doc: Document, rows: readonly string[], fills: readonly (readonly [string, string])[]): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ width: "24", height: "24", viewBox: "0 0 12 12", "shape-rendering": "crispEdges", "aria-hidden": "true", focusable: "false" })) {
    svg.setAttribute(k, v);
  }
  for (const [ch, fill] of fills) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", rows.flatMap((row, y) => [...row].map((c, x) => (c === ch ? `M${x} ${y}h1v1h-1z` : ""))).join(""));
    path.setAttribute("fill", fill);
    svg.appendChild(path);
  }
  return svg;
}

/** An inline, decorative SVG of the named sprite at `size` CSS pixels. */
export function sprite(doc: Document, name: SpriteName, size: number, className: string): SVGSVGElement {
  const rows = SPRITES[name];
  const d = rows
    .flatMap((row, y) => [...row].map((c, x) => (c === "X" ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", `0 0 ${rows[0]!.length} ${rows.length}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}
