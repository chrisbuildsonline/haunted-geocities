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
