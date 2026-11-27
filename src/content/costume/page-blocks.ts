// Real-site blocks. Photo-heavy sites draw dark hero panels and bands on a light page, and pill-shaped
// search boxes; the column restyle alone leaves them modern (and gives their links the light page's
// blue, on a dark ground). Here they get the costume too, as page-sheet rules: a dark block becomes a
// crypt window (square, the HUD's bevel, 1px line and hard shadow, the crypt ground where the page had
// a colour, dark-page link colours), a dark band too small for a block gets light links that read on
// it, and a search box (or a search launcher button) a 1998 sunken white field. No page node is
// touched: each rule is addressed by a structural path from <body>, measured again on every relayout.
import { CHROME, ensureContrast, parseColour, relativeLuminance } from "./page-theme";
import { HARD_SHADOW, LAYOUT as L, PAGE, PALETTE as P } from "./tokens";

/**
 * A dark block: its path, whether its own colour is swapped for the crypt (no picture), and its button links.
 * `photo`: the box holding the light text set straight on a photo (cdc.gov's slide title and button), framed
 * outside its box so the text gets a crypt margin without anything moving.
 */
export type DarkBlock = { path: string; ground: boolean; keep: string[]; photo?: boolean };
/** A band: light text with links on a dark ground too small to be a block; `on` is the colour its links are checked on. */
export type Band = { path: string; on: string; keep: string[] };
/**
 * A search box: the visible field (the input itself, or the pill around a bare input or a launcher
 * button). `label` is the launcher button whose text must read whole: it and the field get at least
 * the widths that show all of it (`width`, measured).
 */
export type SearchField = { path: string; input: boolean; width?: number; label?: { path: string; width: number } };
/** `outline`: outline buttons (no ground, a visible border, light text) on a dark ground, which become raised 1998 buttons. */
export type Blocks = { dark: DarkBlock[]; bands: Band[]; search: SearchField[]; outline: string[] };

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
const isLight = (colour: string) => {
  const c = parseColour(colour);
  return !!c && relativeLuminance(c.hex) >= L.darkLuminance;
};
/** A link or button drawn as an outline: no ground, a visible border, light text (cdc.gov's "Learn More"). */
const isOutline = (cs: CSSStyleDeclaration) =>
  !hasGround(cs) && (parseFloat(cs.borderTopWidth) || 0) >= 1 && !/^(none|hidden)$/.test(cs.borderTopStyle) && (parseColour(cs.borderTopColor)?.alpha ?? 0) > 0 && isLight(cs.color);

/** A picture fills this much of a box (an <img> child), or more: the box is a photo, its ground dark as a background picture's is. */
const PHOTO_FILL = 0.9;
/** The text panel on a photo covers at most this much of it, so the photo still shows. */
const PANEL_SHARE = 0.6;
const area = (r: DOMRect) => r.width * r.height;

/** The search boxes and, on a light page, the dark blocks and bands, in document order. */
export function findBlocks(doc: Document, opts: { darkPage?: boolean } = {}): Blocks {
  const win = doc.defaultView!;
  const style = (el: Element) => win.getComputedStyle(el);
  const textLinks = (el: Element) => [...el.querySelectorAll("a[href]")];
  const buttonLinks = (el: Element) =>
    textLinks(el)
      .filter((a) => hasGround(style(a)) || isOutline(style(a)))
      .map(cssPath);
  const big = (r: DOMRect) => r.width >= MIN_W && r.height >= MIN_H;
  // A photo: a box of a block's size that an <img> (or <picture>) child fills.
  const isPhoto = (el: Element) => {
    const pic = [...el.children].find((c) => /^(img|picture)$/.test(c.localName));
    const box = el.getBoundingClientRect();
    return !!pic && big(box) && area(pic.getBoundingClientRect()) >= PHOTO_FILL * area(box);
  };
  // The box holding all the light text set straight on a photo: the smallest that is not a link or a control,
  // is a block's size, and leaves most of the photo showing. Site chrome inside the photo does not count.
  const textPanel = (photo: Element): Element | null => {
    const inChrome = (e: Element) => {
      for (let a: Element | null = e; a && a !== photo; a = a.parentElement) if (isChrome(a)) return true;
      return false;
    };
    const lit = [...photo.querySelectorAll("*")].filter((e) => {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue?.trim()) || inChrome(e)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && isLight(style(e).color);
    });
    let box: Element | null = lit[0] ?? null;
    while (box && box !== photo && !lit.every((e) => box!.contains(e))) box = box.parentElement;
    while (box && box !== photo && (NOT_BLOCK.test(box.localName) || !big(box.getBoundingClientRect()))) box = box.parentElement;
    return box && box !== photo && area(box.getBoundingClientRect()) <= PANEL_SHARE * area(photo.getBoundingClientRect()) ? box : null;
  };
  const dark: DarkBlock[] = [];
  const bands: Band[] = [];
  const outline: string[] = [];
  const panels = new Set<Element>();
  // `under` is the ground showing through behind `parent`'s children; `covered` once a block or band holds them.
  const visit = (parent: Element, under: Ground | null, covered: boolean) => {
    for (const el of parent.children) {
      if (dark.length >= MAX_BLOCKS || isChrome(el)) continue;
      const cs = style(el);
      if (cs.display === "none" || cs.position === "fixed" || cs.position === "sticky") continue;
      const photo = !NOT_BLOCK.test(el.localName) && isPhoto(el);
      const ground = panels.has(el) ? { dark: true, on: P.crypt } : (groundOf(cs.backgroundColor, cs.backgroundImage) ?? (photo ? { dark: true, on: P.crypt } : under));
      let holds = covered || panels.has(el);
      const panel = photo && !covered ? textPanel(el) : null;
      if (panel) {
        panels.add(panel);
        dark.push({ path: cssPath(panel), ground: true, keep: buttonLinks(panel), photo: true });
      }
      // An outline button on a dark ground: a raised 1998 button.
      if (/^(a|button)$/.test(el.localName) && ground?.dark && outline.length < MAX_BLOCKS && isOutline(cs)) outline.push(cssPath(el));
      if (!panels.has(el) && !NOT_BLOCK.test(el.localName) && isDarkBlock({ color: cs.color, background: cs.backgroundColor, image: cs.backgroundImage })) {
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
  return { dark, bands, search, outline };
}

/** The HUD's frame drawn inside the block (box-shadow only, so nothing moves): 1px line, 2px bevel, hard shadow. */
const CRYPT_BEVEL = `inset 0 0 0 1px ${P.ink}, inset 3px 3px 0 ${P.hudBevelLight}, inset -3px -3px 0 ${P.bevelDark}, ${HARD_SHADOW}`;
/** A sunken 1998 field in web-safe greys: dark top-left, light bottom-right. */
const SUNKEN = `inset 1px 1px 0 ${P.stoneShadow}, inset 2px 2px 0 ${P.ink}, inset -1px -1px 0 ${P.ghostWhite}, inset -2px -2px 0 ${P.stone}`;

/**
 * The same crypt window drawn outside a text panel on a photo (box-shadow spreads, so nothing moves): 12px of
 * crypt round the text, a 3px bevel (light top-left, dark bottom-right), a 1px line and the hard shadow.
 */
const PANEL_FRAME = `0 0 0 12px ${P.crypt}, -3px -3px 0 12px ${P.hudBevelLight}, 3px 3px 0 12px ${P.bevelDark}, 0 0 0 15px ${P.bevelDark}, 0 0 0 16px ${P.ink}, 4px 4px 0 16px ${P.ink}`;
/**
 * A raised 1998 button in the crypt's colours: the border keeps its width, only its colours and corners change.
 * Its violet face is an inset shadow, not a ground, so measured again with its costume on (and hovered, where
 * the page would light its ground) it is still an outline button, still costumed.
 */
const RAISED = `border-radius: 0 !important; border-style: solid !important; border-color: ${P.hudBevelLight} ${P.bevelDark} ${P.bevelDark} ${P.hudBevelLight} !important; background-color: transparent !important; background-image: none !important; color: ${P.bone} !important; box-shadow: inset 0 0 0 999px ${P.cryptViolet}, 2px 2px 0 ${P.ink} !important;`;

export function blocksCss(b: Blocks): string {
  const out: string[] = [];
  for (const d of b.dark) {
    if (d.photo) out.push(`${d.path} { border-radius: 0 !important; background-color: ${P.crypt} !important; box-shadow: ${PANEL_FRAME} !important; }`);
    else out.push(`${d.path} { border-radius: 0 !important; box-shadow: ${CRYPT_BEVEL} !important;${d.ground ? ` background-color: ${P.crypt} !important;` : ""} }`);
  }
  for (const o of b.outline) out.push(`${o} { ${RAISED} }`);
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
