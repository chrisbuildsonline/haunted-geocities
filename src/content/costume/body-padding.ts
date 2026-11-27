// The page sheet: the one document-level change. One adopted sheet holding the lift variable (for the
// ghost icon), the body padding that keeps page content clear of the bands (top; the footer is in
// flow after the page, so nothing pads the bottom), the
// content column restyle (fonts, links), the parchment tint and guestbook frame, and in
// full-overlay mode the inline padding that keeps text out from under the 12px edge frame.
import { columnLayersCss, type Box } from "./column-layers";
import { blocksCss, type Blocks } from "./page-blocks";
import { restyleCss, type Theme } from "./page-theme";
import type { LayerLook } from "./column-layers";
import { LAYOUT } from "./tokens";

export type PageLook = { theme: Theme | null; overlay: boolean; tint: Box | null; frame: Box | null; hidden: boolean; blocks: Blocks | null };
/** The seeded look's part of the page sheet: fonts, its own rules (marker, headings, dividers) and the tint/frame look. */
export type SiteLook = {
  fonts: { body: string; heading: string };
  css: () => string;
  layers: LayerLook;
  /** The look's backgrounds, drawn behind the page (never over it): the tile on html, the tint on a light page's body. */
  backgrounds: (tint: boolean) => string;
};
export type PageSheet = { update(lift: number): void; set(look: Partial<PageLook>): void; remove(): void };

/** A computed length usable inside calc() ("0" is not). */
const len = (v: string) => (v && v !== "0" ? v : "0px");

/** A computed scroll-padding ("auto" is none). */
const scrollLen = (v: string) => (v && v !== "auto" ? len(v) : "0px");

/** `site`: the seeded look; its banner adds `--hg-welcome` to the top padding. */
export function addPageSheet(doc: Document, site?: SiteLook): PageSheet {
  const win = doc.defaultView!;
  const cs = win.getComputedStyle(doc.body);
  const [top, left, right] = [cs.paddingTop, cs.paddingLeft, cs.paddingRight].map(len) as [string, string, string];
  const scrollTop = scrollLen(win.getComputedStyle(doc.documentElement).scrollPaddingTop);
  const bands = LAYOUT.neighborhoodBar + LAYOUT.marquee;
  const edge = LAYOUT.edgeFrame;
  const sheet = new win.CSSStyleSheet();
  let lift = 0;
  let look: PageLook = { theme: null, overlay: false, tint: null, frame: null, hidden: false, blocks: null };
  let text = "";
  const render = () => {
    const inline = look.overlay ? ` padding-left: calc(${left} + ${edge}px) !important; padding-right: calc(${right} + ${edge}px) !important;` : "";
    const next = [
      `:root { --hg-lift: ${lift}px; }`,
      site ? site.css() : "",
      `body { padding-top: calc(${top} + ${bands}px${site ? " + var(--hg-welcome, 0px)" : ""}) !important;${inline} }`,
      // Scroll padding: a link that takes focus, or an anchor jumped to, scrolls clear of the bands.
      `:root { scroll-padding-top: calc(${scrollTop} + ${bands}px) !important; }`,
      look.theme ? restyleCss(look.theme, site?.fonts) : "",
      look.blocks ? blocksCss(look.blocks) : "",
      site && !look.hidden ? site.backgrounds(!!look.theme?.tint) : "",
      columnLayersCss({ tint: site ? null : look.theme?.tint ? look.tint : null, frame: look.overlay ? null : look.frame, hidden: look.hidden, look: site?.layers }),
    ]
      .filter(Boolean)
      .join("\n");
    if (next === text) return;
    text = next;
    sheet.replaceSync(text);
  };
  render();
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  return {
    update: (l) => {
      lift = l;
      render();
    },
    set: (patch) => {
      look = { ...look, ...patch };
      render();
    },
    remove: () => (doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet)),
  };
}
