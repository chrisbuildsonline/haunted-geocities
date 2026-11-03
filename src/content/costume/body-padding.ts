// The one document-level change: an adopted sheet holding the HUD lift variable and the body
// padding that keeps page content clear of the bands (top) and the HUD (bottom).
import { LAYOUT } from "./tokens";

export type PageSheet = { update(hudHeight: number, lift: number): void; remove(): void };

export function addPageSheet(doc: Document): PageSheet {
  const win = doc.defaultView!;
  const cs = win.getComputedStyle(doc.body);
  const top = cs.paddingTop || "0px";
  const bottom = cs.paddingBottom || "0px";
  const bands = LAYOUT.neighborhoodBar + LAYOUT.marquee;
  const sheet = new win.CSSStyleSheet();
  let hud = -1;
  let lift = -1;
  const update = (h: number, l: number) => {
    if (h === hud && l === lift) return;
    [hud, lift] = [h, l];
    sheet.replaceSync(
      `:root { --hg-lift: ${l}px; }\n` +
        `body { padding-top: calc(${top} + ${bands}px) !important; ` +
        `padding-bottom: calc(${bottom} + ${h}px + 16px + var(--hg-lift)) !important; }`,
    );
  };
  update(0, 0);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  return { update, remove: () => (doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet)) };
}
