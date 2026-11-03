// Tombstones on the page: a 16×20 stone beside each dead link, in the #markers layer of the shadow
// root. Beside the link's last line box when that spot is free of page text and on screen, else in the
// nearest gutter lane at the same y, else nowhere (the HUD count and the popup list still have it).
import type { DeadLink } from "../../data/types";
import { mapToPx, svgMarkup, TOMB, TOMB_LEGEND } from "./art";
import type { Rect, Slot } from "./ghosts";
import { LAYOUT as L, MOTION as M, PIXEL, SPRITES } from "./tokens";

const [W, H] = SPRITES.tombstoneMarker;
const GAP = 4;
const MAX_TEXT_NODES = 400;

export const tombMarkerSvg = () => svgMarkup(mapToPx(TOMB, TOMB_LEGEND, PIXEL.iconScale), W, H);

export const markerLabel = (d: DeadLink) => `Dead link: ${d.path}, ${d.status}`;

export const statusText = (status: number) => (status === 410 ? "410 · Gone" : "404 · Not Found");

/** The path cut after every "/", each piece keeping its slash: "/a/b.html" → ["/", "a/", "b.html"]. */
export const pathSegments = (path: string) => path.split(/(?<=\/)/).filter(Boolean);

/**
 * Append `path` to `el` as text that may break only after a "/": one unbreakable segment per piece
 * (its text set as text, never parsed), a <wbr> after every "/". A segment too wide for the line is
 * cut at its start by the CSS (direction: rtl), so the end of a filename stays readable; the <bdi>
 * keeps the segment's own text left-to-right.
 */
export function appendPath(el: HTMLElement, path: string): void {
  const doc = el.ownerDocument;
  for (const part of pathSegments(path)) {
    const seg = doc.createElement("span");
    seg.className = "seg";
    seg.append(Object.assign(doc.createElement("bdi"), { textContent: part }));
    el.append(seg);
    if (part.endsWith("/")) el.append(doc.createElement("wbr"));
  }
}

/**
 * Where a link's stone goes: 4px after its last line box and centred on it, on whole pixels, when
 * that box is inside the viewport and covers no page text; otherwise the inner edge of the gutter
 * lane slot that holds it at the same y, nearest the link; otherwise nowhere.
 */
export function markerSpot(last: Rect, viewportWidth: number, text: readonly Rect[], slots: readonly Slot[]): { x: number; y: number } | null {
  const y = Math.round((last.top + last.bottom) / 2 - H / 2);
  const x = Math.round(last.right + GAP);
  const overText = text.some((r) => r.left < x + W && r.right > x && r.top < y + H && r.bottom > y);
  if (x >= 0 && x + W <= viewportWidth && !overText) return { x, y };
  let best: { x: number; y: number } | null = null;
  let dist = Infinity;
  for (const s of slots) {
    if (s.y > y || y + H > s.y + L.slotPitch) continue;
    const lx = s.side === "left" ? s.x + s.w - W : s.x;
    const d = Math.abs(lx - last.right);
    if (d < dist) [best, dist] = [{ x: lx, y }, d];
  }
  return best;
}

export interface TombstoneOptions {
  /** The gutter lane slots (planSlots) at the current layout. */
  slots: () => readonly Slot[];
  /** Fade a new marker in: true once the haunt moment is over and motion is allowed. */
  fade: () => boolean;
  onOpen: (dead: DeadLink, marker: HTMLElement) => void;
}

export interface TombstoneMarkers {
  /** The full dead list: adds a marker for each link not yet marked. */
  update(dead: readonly DeadLink[]): void;
  /** Re-place every marker now (the page moved). */
  place(): void;
  /** Remove the markers, the observer and the listeners. */
  stop(): void;
}

type Entry = { dead: DeadLink; link: HTMLAnchorElement; el: HTMLButtonElement; onScreen: boolean };

const fragmentFree = (href: string) => {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.href;
  } catch {
    return href;
  }
};

/** Text rects around a link: its block and that block's siblings (the lines a stone beside it could touch). */
function textNear(link: Element, cache: Map<Element, Rect[]>): Rect[] {
  const doc = link.ownerDocument;
  const win = doc.defaultView!;
  let block: Element = link;
  while (block.parentElement && win.getComputedStyle(block).display.startsWith("inline")) block = block.parentElement;
  const scope = block.parentElement && block.parentElement !== doc.documentElement ? block.parentElement : block;
  let rects = cache.get(scope);
  if (rects) return rects;
  rects = [];
  const walker = doc.createTreeWalker(scope, 4 /* NodeFilter.SHOW_TEXT */);
  const range = doc.createRange();
  let n = 0;
  for (let t = walker.nextNode(); t && n < MAX_TEXT_NODES; t = walker.nextNode()) {
    if (!t.nodeValue?.trim()) continue;
    n++;
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) if (r.width > 0) rects.push(r);
  }
  cache.set(scope, rects);
  return rects;
}

export function mountTombstones(markers: HTMLElement, opts: TombstoneOptions): TombstoneMarkers {
  const doc = markers.ownerDocument;
  const win = doc.defaultView!;
  let entries: Entry[] = [];

  const place = () => {
    const vw = doc.documentElement.clientWidth || win.innerWidth;
    const slots = opts.slots();
    const cache = new Map<Element, Rect[]>();
    for (const e of entries) {
      const last = e.onScreen ? [...e.link.getClientRects()].at(-1) : undefined;
      const spot = last ? markerSpot(last, vw, textNear(e.link, cache), slots) : null;
      if (spot) Object.assign(e.el.style, { left: `${spot.x}px`, top: `${spot.y}px` });
      e.el.style.display = spot ? "" : "none";
    }
  };

  // Scroll (in any scroller) and resize move the links: re-place once per frame.
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  const listen = { passive: true, capture: true } as const;
  win.addEventListener("scroll", schedule, listen);
  win.addEventListener("resize", schedule);

  // A link off screen hides its stone: the observer only reads the page and only touches the marker.
  const io =
    typeof win.IntersectionObserver === "function"
      ? new win.IntersectionObserver((seen) => {
          for (const s of seen) for (const e of entries) if (e.link === s.target) e.onScreen = s.isIntersecting;
          place();
        })
      : null;

  return {
    update(dead) {
      const links = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")];
      for (const d of dead) {
        if (entries.some((e) => e.dead.url === d.url)) continue;
        const matching = links.filter((a) => fragmentFree(a.href) === d.url);
        const link = matching.find((a) => a.getClientRects().length > 0) ?? matching[0];
        if (!link) continue;
        const el = doc.createElement("button");
        el.type = "button";
        el.className = "tomb-marker";
        el.dataset.url = d.url;
        el.setAttribute("aria-label", markerLabel(d));
        el.innerHTML = tombMarkerSvg();
        el.addEventListener("click", () => opts.onOpen(d, el));
        markers.append(el);
        entries.push({ dead: d, link, el, onScreen: true });
        io?.observe(link);
        if (opts.fade()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.base, easing: "linear" });
      }
      place();
    },
    place,
    stop() {
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      io?.disconnect();
      win.removeEventListener("scroll", schedule, listen);
      win.removeEventListener("resize", schedule);
      for (const e of entries) e.el.remove();
      entries = [];
    },
  };
}
