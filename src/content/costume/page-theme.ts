// The content column restyle: 1998 fonts and link colours for the page itself, as rules in the
// page sheet. Link colours are checked against the page's own background (multiplied by the
// parchment tint on light pages) and moved to the nearest web-safe colour that reaches 4.5:1.
import { LAYOUT as L, PAGE } from "./tokens";

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const STEPS = [0, 0x33, 0x66, 0x99, 0xcc, 0xff];
export const WEB_SAFE: string[] = STEPS.flatMap((r) => STEPS.flatMap((g) => STEPS.map((b) => toHex([r, g, b]))));

/**
 * `colour` if it reaches 4.5:1 on `bg`, else the nearest web-safe colour (RGB distance) that does.
 * `lighter`: only colours lighter than `bg` (on a gradient checked at its lightest colour, a lighter
 * colour reads on all of it), white when none reaches 4.5:1.
 */
export function ensureContrast(colour: string, bg: string, min: number = L.minContrast, lighter = false): string {
  const ok = (h: string) => contrastRatio(h, bg) >= min && (!lighter || relativeLuminance(h) > relativeLuminance(bg));
  if (ok(colour)) return colour;
  const c = toRgb(colour);
  const dist = (h: string) => toRgb(h).reduce((s, v, i) => s + (v - c[i]!) ** 2, 0);
  // Black or white always reaches 4.5:1 on any background, so without `lighter` there is always a candidate.
  const pool = WEB_SAFE.filter(ok);
  return pool.length ? pool.reduce((best, h) => (dist(h) < dist(best) ? h : best)) : "#ffffff";
}

const multiply = (a: string, b: string) => toHex(toRgb(a).map((v, i) => (v * toRgb(b)[i]!) / 255) as Rgb);

/** A computed CSS colour as its #rrggbb and its alpha, or null when it is not a hex or rgb() colour. */
export function parseColour(css: string): { hex: string; alpha: number } | null {
  const hex = css.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  if (hex) return { hex: "#" + (hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex).toLowerCase(), alpha: 1 };
  const m = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { hex: toHex([m[1], m[2], m[3]].map((v) => parseFloat(v!)) as Rgb), alpha };
}

/** A computed CSS colour as #rrggbb over white, or null when it is fully transparent. */
function opaque(css: string): string | null {
  const c = parseColour(css);
  if (!c || c.alpha === 0) return null;
  return toHex(toRgb(c.hex).map((v) => 255 - (255 - v) * c.alpha) as Rgb);
}

/** The page's background: body, else html when the body is transparent, else white. Images are ignored. */
export function pageBackground(doc: Document): string {
  const win = doc.defaultView!;
  for (const el of [doc.body, doc.documentElement]) {
    const c = el && opaque(win.getComputedStyle(el).backgroundColor || "");
    if (c) return c;
  }
  return "#ffffff";
}

export type Theme = {
  /** Background luminance under 0.4. */
  dark: boolean;
  /** The parchment tint is drawn (light pages only). */
  tint: boolean;
  /** What text sits on: the page background, multiplied by the tint where it is drawn. */
  background: string;
  link: string;
  visited: string;
  hover: string;
};

export function themeFor(pageBg: string): Theme {
  const dark = relativeLuminance(pageBg) < L.darkLuminance;
  const background = dark ? pageBg : multiply(pageBg, PAGE.parchment);
  return {
    dark,
    tint: !dark,
    background,
    link: ensureContrast(dark ? PAGE.darkLink : PAGE.link, background),
    visited: ensureContrast(dark ? PAGE.darkVisited : PAGE.visited, background),
    hover: ensureContrast(PAGE.hover, background),
  };
}

export const isDarkPage = (doc: Document) => themeFor(pageBackground(doc)).dark;
export const pageTheme = (doc: Document) => themeFor(pageBackground(doc));

const TIMES = `"Times New Roman", Times, serif`;
const COMIC = `"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive`;

// Elements that keep their own font, with everything inside them: form controls, code, maths,
// and icon fonts (whose glyphs would turn into letters).
const KEEP = [
  "input", "textarea", "select", "button", "option", "optgroup",
  "pre", "code", "kbd", "samp", "tt", "var", "svg", "math", "i",
  '[class*="icon"]', '[class*="Icon"]', '[class*="fa-"]', '[class~="fa"]', '[class*="material"]', '[class*="glyph"]',
  "[data-icon]", '[aria-hidden="true"]',
].join(", ");
// Links that keep their colours: site chrome (often on its own dark bar) and links dressed as buttons.
export const CHROME = [
  "nav *", '[role="navigation"] *', '[role="banner"] *', '[role="contentinfo"] *',
  "header:not(main *, article *) *", "footer:not(main *, article *) *",
  '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[class*="btn"]', '[class*="button"]', '[class*="Button"]',
].join(", ");

/**
 * The restyle rules. `:where()` keeps the selectors at zero specificity so the later heading rule
 * wins over the body rule; `!important` wins over the page's own rules, as the padding does.
 */
export function restyleCss(t: Theme): string {
  const text = `:not(${KEEP}, :is(${KEEP}) *)`;
  const link = `:where(:not(${CHROME}))`;
  return [
    `:where(body, body *${text}) { font-family: ${TIMES} !important; }`,
    `:where(h1, h2, h3, :is(h1, h2, h3) *${text}) { font-family: ${COMIC} !important; }`,
    `a[href]${link} { text-decoration: underline !important; }`,
    `a:link${link} { color: ${t.link} !important; }`,
    `a:visited${link} { color: ${t.visited} !important; }`,
    `a:is(:link, :visited):hover${link} { color: ${t.hover} !important; }`,
    `@media (prefers-reduced-motion: reduce) { a[href] { transition: none !important; } }`,
  ].join("\n");
}
