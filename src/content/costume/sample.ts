// Read-only sampling of page UI pinned to the viewport edges (cookie bars, fixed headers),
// so the bands and the HUD can sit beside it instead of over it.
import { HOST_TAG } from "../overlay";

const FRACTIONS = [0.05, 0.25, 0.5, 0.75, 0.95];

/** Boxes of fixed/sticky page elements hit at the given y values, smaller than half the viewport. */
export function pinnedBoxes(doc: Document, ys: number[]): DOMRect[] {
  const win = doc.defaultView;
  if (!win || typeof doc.elementsFromPoint !== "function") return [];
  const seen = new Set<Element>();
  const out: DOMRect[] = [];
  for (const y of ys) {
    for (const f of FRACTIONS) {
      for (const el of doc.elementsFromPoint(win.innerWidth * f, y)) {
        if (el.localName === HOST_TAG) continue;
        for (let e: Element | null = el; e && e !== doc.body && e !== doc.documentElement; e = e.parentElement) {
          if (seen.has(e)) break;
          seen.add(e);
          const pos = win.getComputedStyle(e).position;
          if (pos !== "fixed" && pos !== "sticky") continue;
          const r = e.getBoundingClientRect();
          if (r.height > 0 && r.height < win.innerHeight / 2) out.push(r);
          break;
        }
      }
    }
  }
  return out;
}
