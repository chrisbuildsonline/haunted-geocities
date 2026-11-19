// Real-site blocks. Photo-heavy sites draw dark hero panels and bands on a light page, and pill-shaped
// search boxes; the column restyle alone leaves them modern (and gives their links the light page's
// blue, on a dark ground). Here they get the costume too, as page-sheet rules: a dark block becomes a
// crypt window (square, the HUD's bevel, 1px line and hard shadow, the crypt ground where the page had
// a colour, dark-page link colours) and a search box a 1998 sunken white field. No page node is
// touched: each rule is addressed by a structural path from <body>, measured again on every relayout.
import { CHROME, parseColour, relativeLuminance, themeFor } from "./page-theme";
import { HARD_SHADOW, LAYOUT as L, PALETTE as P } from "./tokens";

/** A dark block: its path, whether its own colour is swapped for the crypt (no picture), and its button links. */
export type DarkBlock = { path: string; ground: boolean; keep: string[] };
/** A search box: the visible field (the input itself, or the pill around a bare input). */
export type SearchField = { path: string; input: boolean };
export type Blocks = { dark: DarkBlock[]; search: SearchField[] };

/** A hero block is at least this big; smaller dark boxes (buttons, badges, top bars) stay as they are. */
const MIN_W = 240;
const MIN_H = 96;
const MAX_BLOCKS = 32;
const MAX_FIELDS = 8;
/** A pill counts as the field when it is at most this much taller than its input. */
const FIELD_SLACK = 32;

/** `body > :nth-child(i) > …`: selects `el` and nothing else while the page keeps its structure. */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e?.parentElement && e.localName !== "body"; e = e.parentElement) {
    parts.unshift(`:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`);
  }
  return ["body", ...parts].join(" > ");
}

/** Light text on a dark colour (40% opaque or more) or on a picture: the page means this box to be dark. */
export function isDarkBlock(s: { color: string; background: string; image: string }): boolean {
  const text = parseColour(s.color);
  if (!text || relativeLuminance(text.hex) < L.darkLuminance) return false;
  if (s.image && s.image !== "none") return true;
  const bg = parseColour(s.background);
  return !!bg && bg.alpha >= 0.4 && relativeLuminance(bg.hex) < L.darkLuminance;
}

/** Never a block, and nothing inside it is either: site chrome keeps its look, as it keeps its link colours. */
const isChrome = (el: Element) =>
  /^(nav|svg|iframe|video|canvas|picture|select|template)$/.test(el.localName) ||
  /^(banner|navigation|contentinfo)$/.test(el.getAttribute("role") ?? "") ||
  (/^(header|footer)$/.test(el.localName) && !el.parentElement?.closest("main, article"));
/** Never a block itself (a control or a link dressed as a button), though a block may sit inside. */
const NOT_BLOCK = /^(a|button|input|textarea|img|code|pre)$/;

const hasGround = (cs: CSSStyleDeclaration) => (parseColour(cs.backgroundColor)?.alpha ?? 0) > 0 || (!!cs.backgroundImage && cs.backgroundImage !== "none");

/** The search boxes and, on a light page, the dark blocks, in document order. */
export function findBlocks(doc: Document, opts: { darkPage?: boolean } = {}): Blocks {
  const win = doc.defaultView!;
  const style = (el: Element) => win.getComputedStyle(el);
  const dark: DarkBlock[] = [];
  const visit = (parent: Element) => {
    for (const el of parent.children) {
      if (dark.length >= MAX_BLOCKS || isChrome(el)) continue;
      const cs = style(el);
      if (cs.display === "none" || cs.position === "fixed" || cs.position === "sticky") continue;
      if (!NOT_BLOCK.test(el.localName) && isDarkBlock({ color: cs.color, background: cs.backgroundColor, image: cs.backgroundImage })) {
        const r = el.getBoundingClientRect();
        if (r.width >= MIN_W && r.height >= MIN_H) {
          const keep = [...el.querySelectorAll("a[href]")].filter((a) => hasGround(style(a))).map(cssPath);
          dark.push({ path: cssPath(el), ground: !cs.backgroundImage || cs.backgroundImage === "none", keep });
        }
      }
      visit(el);
    }
  };
  if (!opts.darkPage && doc.body) visit(doc.body);

  const search: SearchField[] = [];
  const seen = new Set<string>();
  for (const input of doc.body?.querySelectorAll("input") ?? []) {
    if (search.length >= MAX_FIELDS) break;
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    if (!/^(text|search)$/.test(type)) continue;
    const named = type === "search" || !!input.closest('[role="search"]') || ["name", "placeholder", "aria-label", "id"].some((a) => /search/i.test(input.getAttribute(a) ?? ""));
    const r = input.getBoundingClientRect();
    if (!named || r.width === 0 || r.height === 0) continue;
    // A bare input in a styled pill: the pill is what the eye reads as the box.
    let field: Element = input;
    if (!hasGround(style(input))) {
      let up = input.parentElement;
      for (let i = 0; up && up.localName !== "body" && i < 3; i++, up = up.parentElement) {
        if (!hasGround(style(up))) continue;
        if (up.getBoundingClientRect().height <= r.height + FIELD_SLACK) field = up;
        break;
      }
    }
    const path = cssPath(field);
    if (seen.has(path)) continue;
    seen.add(path);
    search.push({ path, input: field === input });
  }
  return { dark, search };
}

/** The HUD's frame drawn inside the block (box-shadow only, so nothing moves): 1px line, 2px bevel, hard shadow. */
const CRYPT_BEVEL = `inset 0 0 0 1px ${P.ink}, inset 3px 3px 0 ${P.hudBevelLight}, inset -3px -3px 0 ${P.bevelDark}, ${HARD_SHADOW}`;
/** A sunken 1998 field in web-safe greys: dark top-left, light bottom-right. */
const SUNKEN = `inset 1px 1px 0 ${P.stoneShadow}, inset 2px 2px 0 ${P.ink}, inset -1px -1px 0 ${P.ghostWhite}, inset -2px -2px 0 ${P.stone}`;

export function blocksCss(b: Blocks): string {
  const out: string[] = [];
  for (const d of b.dark) {
    out.push(`${d.path} { border-radius: 0 !important; box-shadow: ${CRYPT_BEVEL} !important;${d.ground ? ` background-color: ${P.crypt} !important;` : ""} }`);
  }
  if (b.dark.length) {
    // The dark page's link colours, checked on the crypt; button links and site chrome keep theirs.
    const t = themeFor(P.crypt);
    const keep = [...new Set(b.dark.flatMap((d) => d.keep))];
    const link = `:where(:not(${CHROME}))${keep.length ? `:not(${keep.join(", ")})` : ""}`;
    const inside = `:is(${b.dark.map((d) => d.path).join(", ")})`;
    out.push(
      `${inside} a:link${link} { color: ${t.link} !important; }`,
      `${inside} a:visited${link} { color: ${t.visited} !important; }`,
      `${inside} a:is(:link, :visited):hover${link} { color: ${t.hover} !important; }`,
    );
  }
  for (const s of b.search) {
    out.push(
      `${s.path} { background-color: ${P.ghostWhite} !important; background-image: none !important; color: ${P.ink} !important; border-radius: 0 !important; box-shadow: ${SUNKEN} !important; }`,
    );
    if (!s.input) out.push(`${s.path} input { color: ${P.ink} !important; background-color: transparent !important; }`);
    // #666666 on white is 5.7:1.
    out.push(`${s.input ? `${s.path}::placeholder` : `${s.path} input::placeholder`} { color: ${P.stoneShadow} !important; opacity: 1 !important; }`);
  }
  return out.join("\n");
}
