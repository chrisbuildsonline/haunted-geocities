// Real-site blocks. Photo-heavy sites draw dark hero panels and bands on a light page, and pill-shaped
// search boxes; the column restyle alone leaves them modern (and gives their links the light page's
// blue, on a dark ground). Here they get the costume too, as page-sheet rules: a dark block becomes a
// crypt window (square, the HUD's bevel, 1px line and hard shadow, the crypt ground where the page had
// a colour, dark-page link colours), a dark band too small for a block gets light links that read on
// it, and a search box (or a search launcher button) a 1998 sunken white field. No page node is
// touched: each rule is addressed by a structural path from <body>, measured again on every relayout.
import { CHROME, ensureContrast, parseColour, relativeLuminance } from "./page-theme";
import { HARD_SHADOW, LAYOUT as L, PAGE, PALETTE as P } from "./tokens";

/** A dark block: its path, whether its own colour is swapped for the crypt (no picture), and its button links. */
export type DarkBlock = { path: string; ground: boolean; keep: string[] };
/** A band: light text with links on a dark ground too small to be a block; `on` is the colour its links are checked on. */
export type Band = { path: string; on: string; keep: string[] };
/**
 * A search box: the visible field (the input itself, or the pill around a bare input or a launcher
 * button). `label` is the launcher button whose text must read whole: it and the field get at least
 * the widths that show all of it (`width`, measured).
 */
export type SearchField = { path: string; input: boolean; width?: number; label?: { path: string; width: number } };
export type Blocks = { dark: DarkBlock[]; bands: Band[]; search: SearchField[] };

/** A hero block is at least this big; smaller dark boxes (buttons, badges, top bars) stay as they are. */
const MIN_W = 240;
const MIN_H = 96;
const MAX_BLOCKS = 32;
const MAX_FIELDS = 8;
/** A pill counts as the field when it is at most this much taller than its input. */
const FIELD_SLACK = 32;
/** A search launcher reads as a field from this width; narrower, it is an icon button. */
const LAUNCHER_W = 120;

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

/** A ground: whether it is dark, and the colour its links are checked on (a gradient's lightest stop; the crypt for a picture). */
export type Ground = { dark: boolean; on: string };

/**
 * What a box draws behind its text, or null when it draws nothing (or too faint a colour) and its
 * parent's ground shows through. A gradient counts by its stops 40% opaque or more (dark only if they
 * all are); a picture is dark, as the light text on it says, and its links are checked on the crypt.
 */
export function groundOf(background: string, image: string): Ground | null {
  if (/url\(/.test(image)) return { dark: true, on: P.crypt };
  const stops = image !== "none" ? (image.match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}\b/gi) ?? []) : [background];
  const solid = stops.map(parseColour).filter((c) => !!c && c.alpha >= 0.4).map((c) => c!.hex);
  if (!solid.length) return null;
  const on = solid.reduce((a, b) => (relativeLuminance(b) > relativeLuminance(a) ? b : a));
  return { dark: relativeLuminance(on) < L.darkLuminance, on };
}

/** Never a block, and nothing inside it is either: site chrome keeps its look, as it keeps its link colours. */
const isChrome = (el: Element) =>
  /^(nav|svg|iframe|video|canvas|picture|select|template)$/.test(el.localName) ||
  /^(banner|navigation|contentinfo)$/.test(el.getAttribute("role") ?? "") ||
  (/^(header|footer)$/.test(el.localName) && !el.parentElement?.closest("main, article"));
/** Never a block itself (a control or a link dressed as a button), though a block may sit inside. */
const NOT_BLOCK = /^(a|button|input|textarea|img|code|pre)$/;

const hasGround = (cs: CSSStyleDeclaration) => (parseColour(cs.backgroundColor)?.alpha ?? 0) > 0 || (!!cs.backgroundImage && cs.backgroundImage !== "none");

/** The search boxes and, on a light page, the dark blocks and bands, in document order. */
export function findBlocks(doc: Document, opts: { darkPage?: boolean } = {}): Blocks {
  const win = doc.defaultView!;
  const style = (el: Element) => win.getComputedStyle(el);
  const textLinks = (el: Element) => [...el.querySelectorAll("a[href]")];
  const buttonLinks = (el: Element) => textLinks(el).filter((a) => hasGround(style(a))).map(cssPath);
  const dark: DarkBlock[] = [];
  const bands: Band[] = [];
  // `under` is the ground showing through behind `parent`'s children; `covered` once a block or band holds them.
  const visit = (parent: Element, under: Ground | null, covered: boolean) => {
    for (const el of parent.children) {
      if (dark.length >= MAX_BLOCKS || isChrome(el)) continue;
      const cs = style(el);
      if (cs.display === "none" || cs.position === "fixed" || cs.position === "sticky") continue;
      const ground = groundOf(cs.backgroundColor, cs.backgroundImage) ?? under;
      let holds = covered;
      if (!NOT_BLOCK.test(el.localName) && isDarkBlock({ color: cs.color, background: cs.backgroundColor, image: cs.backgroundImage })) {
        const r = el.getBoundingClientRect();
        if (r.width >= MIN_W && r.height >= MIN_H) {
          dark.push({ path: cssPath(el), ground: !cs.backgroundImage || cs.backgroundImage === "none", keep: buttonLinks(el) });
          holds = true;
        }
      }
      // Light text on a dark ground, too small for a block (a strip of slide titles on a gradient): its links go light too,
      // checked on the lighter of its own ground and a dark one under it (a carousel moves the current slide's ground on).
      const text = parseColour(cs.color);
      if (!holds && !NOT_BLOCK.test(el.localName) && ground?.dark && text && relativeLuminance(text.hex) >= L.darkLuminance) {
        holds = true;
        const on = under?.dark && relativeLuminance(under.on) > relativeLuminance(ground.on) ? under.on : ground.on;
        if (textLinks(el).length && bands.length < MAX_BLOCKS) bands.push({ path: cssPath(el), on, keep: buttonLinks(el) });
      }
      visit(el, ground, holds);
    }
  };
  if (!opts.darkPage && doc.body) visit(doc.body, groundOf(style(doc.body).backgroundColor, style(doc.body).backgroundImage), false);

  const search: SearchField[] = [];
  const seen = new Set<string>();
  for (const box of doc.body?.querySelectorAll("input, button") ?? []) {
    if (search.length >= MAX_FIELDS) break;
    const input = box.localName === "input";
    const type = (box.getAttribute("type") ?? (input ? "text" : "submit")).toLowerCase();
    if (input && !/^(text|search)$/.test(type)) continue;
    // A launcher: a plain button (not a submit) that names search and shows a label; it opens the real search box.
    const label = box.textContent?.trim() ?? "";
    const named = input
      ? type === "search" || !!box.closest('[role="search"]') || ["name", "placeholder", "aria-label", "id"].some((a) => /search/i.test(box.getAttribute(a) ?? ""))
      : type === "button" && !!label && /search/i.test(`${box.getAttribute("aria-label") ?? ""} ${label}`);
    const r = box.getBoundingClientRect();
    if (!named || r.width === 0 || r.height === 0) continue;
    // A bare input or launcher in a styled pill: the pill is what the eye reads as the box.
    let field: Element = box;
    if (!hasGround(style(box))) {
      let up = box.parentElement;
      for (let i = 0; up && up.localName !== "body" && i < 3; i++, up = up.parentElement) {
        if (!hasGround(style(up))) continue;
        if (up.getBoundingClientRect().height <= r.height + FIELD_SLACK) field = up;
        break;
      }
    }
    if (!input && (!hasGround(style(field)) || field.getBoundingClientRect().width < LAUNCHER_W)) continue;
    const path = cssPath(field);
    if (seen.has(path)) continue;
    seen.add(path);
    if (input) search.push({ path, input: field === box });
    else {
      // The label's whole width (to the right edge of what the pill clips, plus the button's end padding), and the pill's padding around it.
      const end = Math.max(...[...box.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right));
      const bs = style(box);
      const width = Math.ceil(Math.max(r.width, end - r.left + (parseFloat(bs.paddingRight) || 0) + (parseFloat(bs.borderRightWidth) || 0)));
      search.push({ path, input: false, width: width + Math.max(0, Math.round(field.getBoundingClientRect().width - r.width)), label: { path: cssPath(box), width } });
    }
  }
  return { dark, bands, search };
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
  // The dark page's link colours, checked on the crypt in a dark block and on a band's lightest colour;
  // button links and site chrome keep theirs.
  const links = (boxes: { path: string; keep: string[] }[], on: string) => {
    if (!boxes.length) return;
    const light = (c: string) => ensureContrast(c, on, L.minContrast, true);
    const t = { link: light(PAGE.darkLink), visited: light(PAGE.darkVisited), hover: light(PAGE.hover) };
    const keep = [...new Set(boxes.flatMap((d) => d.keep))];
    const link = `:where(:not(${CHROME}))${keep.length ? `:not(${keep.join(", ")})` : ""}`;
    const inside = `:is(${boxes.map((d) => d.path).join(", ")})`;
    out.push(
      `${inside} a:link${link} { color: ${t.link} !important; }`,
      `${inside} a:visited${link} { color: ${t.visited} !important; }`,
      `${inside} a:is(:link, :visited):hover${link} { color: ${t.hover} !important; }`,
    );
  };
  links(b.dark, P.crypt);
  for (const on of new Set(b.bands.map((x) => x.on))) links(b.bands.filter((x) => x.on === on), on);
  for (const s of b.search) {
    out.push(
      `${s.path} { background-color: ${P.ghostWhite} !important; background-image: none !important; color: ${P.ink} !important; border-radius: 0 !important; box-shadow: ${SUNKEN} !important; }`,
    );
    // A launcher's label reads whole: its pill and button grow to it rather than clip it.
    if (s.label) {
      const l = s.label.path;
      out.push(`${s.path} { min-width: ${s.width}px !important; }`, `${l} { min-width: ${s.label.width}px !important; }`, `:is(${l}, ${l} *) { color: ${P.ink} !important; }`);
    }
    if (!s.input) out.push(`${s.path} input { color: ${P.ink} !important; background-color: transparent !important; }`);
    // #666666 on white is 5.7:1.
    out.push(`${s.input ? `${s.path}::placeholder` : `${s.path} input::placeholder`} { color: ${P.stoneShadow} !important; opacity: 1 !important; }`);
  }
  return out.join("\n");
}
