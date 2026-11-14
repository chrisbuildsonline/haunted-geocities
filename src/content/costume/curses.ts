// Cursed badges on the page: an 18px orange CURSED! tag beside each dark pattern, in the #markers layer
// of the shadow root. Beside the element's last line box when that spot is free of page text and on
// screen, else above its first line box, else in the gutter lane at the same y, else nowhere (the HUD
// count and the popup list still have it). The badge never touches the page element.
import type { Curse } from "../../data/types";
import { KIND_INFO, type DarkPattern } from "../dark-patterns";
import { curseBadgeSvg } from "./art";
import type { Rect, Slot } from "./ghosts";
import { textNear } from "./tombstones";
import { LAYOUT as L, MOTION as M } from "./tokens";

const H = 18;
const GAP = 4;

/** The line boxes of an element's contents (a block's own box is as wide as its container). */
export function lineRects(el: Element): Rect[] {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
}

/** The topmost, then leftmost line. */
export const firstLine = (rects: readonly Rect[]): Rect => rects.reduce((a, r) => (r.top < a.top || (r.top === a.top && r.left < a.left) ? r : a));
/** The bottommost, then rightmost line. */
export const lastLine = (rects: readonly Rect[]): Rect => rects.reduce((a, r) => (r.bottom > a.bottom || (r.bottom === a.bottom && r.right > a.right) ? r : a));

/**
 * Where a badge `w` wide goes: (a) 4px right of the last line box, centred on it; (b) 4px above the
 * first line box, left edges aligned; (c) the gutter lane slot that holds the last line's y, on the
 * edge nearest the element; otherwise nowhere. Whole pixels, inside the viewport, over no page text.
 */
export function curseSpot(first: Rect, last: Rect, w: number, viewportWidth: number, text: readonly Rect[], slots: readonly Slot[]): { x: number; y: number } | null {
  const fits = (x: number, y: number) => x >= 0 && y >= 0 && x + w <= viewportWidth && !text.some((r) => r.left < x + w && r.right > x && r.top < y + H && r.bottom > y);
  const a = { x: Math.round(last.right + GAP), y: Math.round((last.top + last.bottom) / 2 - H / 2) };
  if (fits(a.x, a.y)) return a;
  const b = { x: Math.round(first.left), y: Math.round(first.top - GAP - H) };
  if (fits(b.x, b.y)) return b;
  let best: { x: number; y: number } | null = null;
  let dist = Infinity;
  for (const s of slots) {
    if (s.y > a.y || a.y + H > s.y + L.slotPitch) continue;
    const x = s.side === "left" ? s.x + s.w - w : s.x;
    if (x < 0 || x + w > viewportWidth) continue; // a lane narrower than the badge would push it off screen
    const d = Math.abs(x - last.right);
    if (d < dist) [best, dist] = [{ x, y: a.y }, d];
  }
  return best;
}

export interface CurseOptions {
  /** The gutter lane slots (planSlots) at the current layout. */
  slots: () => readonly Slot[];
  /** Fade a new badge in: true once the haunt moment is over and motion is allowed. */
  fade: () => boolean;
  onOpen: (curse: Curse, badge: HTMLElement) => void;
}

export interface CurseBadges {
  /** The full pattern list: adds a badge for each new element, removes those that left, keeps the rest. */
  update(patterns: readonly DarkPattern[]): void;
  /** Re-place every badge now (the page moved). */
  place(): void;
  /** Remove the badges, the observer and the listeners. */
  stop(): void;
}

type Entry = { pattern: DarkPattern; el: HTMLButtonElement; onScreen: boolean };

export function mountCurses(markers: HTMLElement, opts: CurseOptions): CurseBadges {
  const doc = markers.ownerDocument;
  const win = doc.defaultView!;
  let entries: Entry[] = [];

  const place = () => {
    const vw = doc.documentElement.clientWidth || win.innerWidth;
    const slots = opts.slots();
    const cache = new Map<Element, Rect[]>();
    for (const e of entries) {
      e.el.style.display = ""; // measure the width before placing
      const w = e.el.offsetWidth;
      const lines = e.onScreen && e.pattern.element.isConnected ? lineRects(e.pattern.element) : [];
      const spot = lines.length ? curseSpot(firstLine(lines), lastLine(lines), w, vw, textNear(e.pattern.element, cache), slots) : null;
      if (spot) Object.assign(e.el.style, { left: `${spot.x}px`, top: `${spot.y}px` });
      e.el.style.display = spot ? "" : "none";
    }
  };

  // Scroll (in any scroller) and resize move the elements: re-place once per frame.
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

  // An element off screen hides its badge: the observer only reads the page and only touches the badge.
  const io =
    typeof win.IntersectionObserver === "function"
      ? new win.IntersectionObserver((seen) => {
          for (const s of seen) for (const e of entries) if (e.pattern.element === s.target) e.onScreen = s.isIntersecting;
          place();
        })
      : null;

  return {
    update(patterns) {
      const keep = new Set(patterns.map((p) => p.element));
      for (const e of entries) {
        if (keep.has(e.pattern.element)) continue;
        e.el.remove();
        io?.unobserve(e.pattern.element);
      }
      entries = entries.filter((e) => keep.has(e.pattern.element));
      for (const p of patterns) {
        if (entries.some((e) => e.pattern.element === p.element)) continue;
        const el = doc.createElement("button");
        el.type = "button";
        el.className = "curse-badge";
        el.dataset.kind = p.kind;
        el.setAttribute("aria-label", `${KIND_INFO[p.kind].title}: ${p.snippet}`);
        el.innerHTML = `${curseBadgeSvg()}<span>CURSED!</span>`;
        el.addEventListener("click", () => opts.onOpen({ kind: p.kind, snippet: p.snippet }, el));
        markers.append(el);
        entries.push({ pattern: p, el, onScreen: true });
        io?.observe(p.element);
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
