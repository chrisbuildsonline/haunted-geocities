// The gutter starfield: a 64×64 tile painted once to a canvas, tiled only outside the
// page's content column so it never sits over text.
import type { Px } from "./art";
import { LAYOUT, PALETTE as P } from "./tokens";

const dot = (x: number, y: number, color: string, s = 1): Px => ({ x, y, w: s, h: s, color });

export const STAR_TILE = {
  size: LAYOUT.starTile,
  ground: P.crypt,
  pixels: [
    dot(5, 9, P.ghostWhite), dot(27, 3, P.ghostWhite), dot(41, 21, P.ghostWhite),
    dot(59, 33, P.ghostWhite), dot(13, 47, P.ghostWhite), dot(33, 58, P.ghostWhite),
    dot(52, 7, P.star, 2), dot(20, 28, P.star, 2),
  ] as Px[],
  /** The 5×5 4-point twinkle, kept on its own tile so it can fade on its own. */
  twinkle: [
    { x: 46, y: 42, w: 1, h: 5, color: P.bone },
    { x: 44, y: 44, w: 2, h: 1, color: P.bone },
    { x: 47, y: 44, w: 2, h: 1, color: P.bone },
  ] as Px[],
};

/** Paint the tile ("stars": ground + stars, "twinkle": the twinkle on transparent) to a PNG data URL. */
export function paintTile(doc: Document, layer: "stars" | "twinkle"): string {
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = STAR_TILE.size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const px = layer === "stars" ? [dot(0, 0, STAR_TILE.ground, STAR_TILE.size), ...STAR_TILE.pixels] : STAR_TILE.twinkle;
  for (const p of px) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  return canvas.toDataURL("image/png");
}

export type Column = { left: number; right: number };
export type Measure = { box(el: Element): DOMRect; textRects(node: Text): DOMRect[]; viewportWidth: number };

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const MAX_TEXT_NODES = 4000;

const realMeasure = (doc: Document): Measure => ({
  box: (el) => el.getBoundingClientRect(),
  textRects: (node) => {
    const r = doc.createRange();
    r.selectNodeContents(node);
    return [...r.getClientRects()];
  },
  viewportWidth: doc.documentElement.clientWidth || doc.defaultView!.innerWidth,
});

function textNodes(doc: Document): Text[] {
  const out: Text[] = [];
  const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n && out.length < MAX_TEXT_NODES; n = walker.nextNode()) {
    if (n.nodeValue?.trim() && !SKIP.has(n.parentElement?.tagName ?? "")) out.push(n as Text);
  }
  return out;
}

/**
 * The page's content column: the box of main/article (or else the widest block holding over
 * half the page's text), widened to cover every text rect.
 */
export function computeContentColumn(doc: Document, m: Measure = realMeasure(doc)): Column {
  const texts = textNodes(doc);
  let start: Element | null = doc.querySelector("main") ?? doc.querySelector("article");
  if (!start) {
    const total = texts.reduce((n, t) => n + t.nodeValue!.trim().length, 0);
    let widest = 0;
    for (const el of doc.body.querySelectorAll("*")) {
      if (SKIP.has(el.tagName) || (el.textContent?.trim().length ?? 0) * 2 <= total) continue;
      const w = m.box(el).width;
      if (w > widest) [widest, start] = [w, el];
    }
  }
  let left = Infinity;
  let right = -Infinity;
  const add = (r: DOMRect) => {
    if (r.width <= 0) return;
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  };
  if (start) add(m.box(start));
  for (const t of texts) m.textRects(t).forEach(add);
  if (left === Infinity) return { left: m.viewportWidth / 2, right: m.viewportWidth / 2 };
  return { left: Math.max(0, Math.floor(left)), right: Math.min(m.viewportWidth, Math.ceil(right)) };
}

/** Client rects of the page's text (the ghost lanes skip any slot that crosses one). */
export const pageTextRects = (doc: Document): DOMRect[] => {
  const m = realMeasure(doc);
  return textNodes(doc).flatMap((t) => m.textRects(t));
};

/** Gutter widths, or null on narrow pages where neither gutter reaches a lane (64px). */
export function gutterWidths(col: Column, viewportWidth: number): Column | null {
  const left = Math.max(0, col.left);
  const right = Math.max(0, viewportWidth - col.right);
  return left < LAYOUT.laneWidth && right < LAYOUT.laneWidth ? null : { left, right };
}

export function buildStarfield(doc: Document): HTMLElement {
  const field = doc.createElement("div");
  field.id = "starfield";
  field.setAttribute("aria-hidden", "true");
  for (const side of ["left", "right"]) {
    const g = doc.createElement("div");
    g.className = `gutter ${side}`;
    g.hidden = true;
    g.innerHTML = `<div class="fill"></div><div class="edge"></div>`;
    field.append(g);
  }
  return field;
}

/** Clear px between the dither edge and the text column (the lanes are still planned from the full gutter). */
const EDGE_GAP = 4;

/** Size the gutters, EDGE_GAP short of the column; a side too narrow for its 16px dither edge stays hidden. */
export function layoutStarfield(field: HTMLElement, widths: Column | null): void {
  for (const side of ["left", "right"] as const) {
    const g = field.querySelector(`.gutter.${side}`) as HTMLElement;
    const w = Math.max(0, (widths?.[side] ?? 0) - EDGE_GAP);
    g.hidden = w < 16;
    g.style.width = `${w}px`;
  }
}
