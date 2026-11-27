// The seeded look as CSS: one sheet for the shadow root (bands, banner, footer, sprites, trail, the
// furniture columns) and the page-sheet rules (theme marker, headings, dividers, section dressing, image bevels).
// Nothing here moves page content except the <hr> divider's height and the banner's top padding.
import { DIGITS, mapToPx, type Px } from "./art";
import { cssPath } from "./page-blocks";
import { relativeLuminance, parseColour } from "./page-theme";
import { dividerPx, spriteSvg, SPRITES, svgData, tilePx, tintPatternPx, twinklePx } from "./theme-art";
import { BANNERS, COUNTERS, FONT_SETS, PALETTES, RAINBOW, SPRITE_SETS, type Look } from "./themes";
import { HARD_SHADOW, LAYOUT as L } from "./tokens";

/** Banner heights (px): the page sheet pads the body top by the bands plus this. A sparse site's one giant banner is taller; the tab bar adds a row. */
export const WELCOME = { height: 72, sparseHeight: 96, tabs: 28, phoneHeight: 56, phoneBelow: 480 } as const;
export const welcomeHeight = (l: Look) => (l.density === "sparse" ? WELCOME.sparseHeight : WELCOME.height) + (l.furniture.includes("tabbar") ? WELCOME.tabs : 0);

export const paletteOf = (l: Look) => PALETTES[l.palette];
export const fontsOf = (l: Look) => FONT_SETS[l.fonts];

/** The tiles for costumeCss: the look's background tile and its fading sparkle layer, as data: URLs. */
export const lookTiles = (l: Look) => ({ stars: svgData(tilePx(l.tile, paletteOf(l)), 64, 64), twinkle: svgData(twinklePx(paletteOf(l)), 64, 64) });

/** The content tint: plain for the classic crypt (its parchment, unchanged), else the tint's pale pattern. */
export const tintPattern = (l: Look): string | null => (l.preset === "classic-crypt" ? null : svgData(tintPatternPx(l.tile, paletteOf(l).tint), 32, 32));

const digitsUrl = (colour: string, cell: string) => {
  const px: Px[] = DIGITS.flatMap((d, i) => mapToPx(d, { X: colour }, 2, 0, i * 16 + 1));
  return `url("${svgData([{ x: 0, y: 0, w: 10, h: 160, color: cell }, ...px], 10, 160)}")`;
};

const MOVES = `
@keyframes hg-spin { 0% { transform: scaleX(1); } 25% { transform: scaleX(.4); } 50% { transform: scaleX(-1); } 75% { transform: scaleX(-.4); } 100% { transform: scaleX(1); } }
@keyframes hg-flap { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.6); } }
@keyframes hg-dbob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes hg-wiggle { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
@keyframes hg-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(.85); } }
@keyframes hg-hop { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
@keyframes hg-blink { 50% { visibility: hidden; } }
@keyframes hg-trail { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(16px); } }`;
const MOVE_CSS: Record<string, string> = {
  spin: "hg-spin 1200ms steps(1) infinite",
  flap: "hg-flap 500ms steps(1) infinite",
  bob: "hg-dbob 1000ms steps(1) infinite",
  wiggle: "hg-wiggle 1000ms steps(1) infinite",
  pulse: "hg-pulse 800ms steps(1) infinite",
  hop: "hg-hop 1000ms steps(1) infinite",
};

/** A decorative sprite: 48×48 pixel art that spins, flaps or bobs (nothing under reduced motion). */
export const spriteMarkup = (name: string) => `<span class="deco" data-sprite="${name}" data-move="${SPRITES[name]!.move}">${spriteSvg(name)}</span>`;

/** The sprites a look shows: the banner's pair, then the footer's. */
export function lookSprites(l: Look): { banner: [string, string]; footer: [string, string] } {
  const [a, b] = SPRITE_SETS[l.sprites];
  return { banner: [a, b], footer: [b, a] };
}

/** The 'Welcome to my homepage!!!' banner: scrolls with the page under the fixed bands. Decorative only. */
export function buildWelcome(doc: Document, l: Look): HTMLElement {
  const w = doc.createElement("div");
  w.id = "welcome";
  w.setAttribute("aria-hidden", "true");
  const [s1, s2] = lookSprites(l).banner;
  w.innerHTML =
    `<div class="wb-plaque">${spriteMarkup(s1)}<span class="wb-text"><span class="wb-title"></span>` +
    `<span class="wb-sub"><span class="wb-new">NEW!</span> Last updated 10/31/1998</span></span>${spriteMarkup(s2)}</div><div class="wb-divider"></div>`;
  w.querySelector(".wb-title")!.textContent = BANNERS[l.banner]!;
  return w;
}

/** The look's sheet for the shadow root, adopted after costumeCss so it wins on the same selectors. */
export function lookShadowCss(l: Look): string {
  const c = paletteOf(l);
  const f = fontsOf(l);
  const tiles = lookTiles(l);
  const tile = `url("${tiles.stars}")`;
  const divider = `url("${svgData(dividerPx(l.divider, c), 64, 16)}")`;
  const counter = COUNTERS[l.counter];
  const bevel = `3px ${l.bevel} ${c.bevelLight}`;
  const tall = l.density === "sparse";
  return [
    `#neighborhood { background: ${c.band}; color: ${c.bandText}; box-shadow: inset 0 -1px 0 ${c.glow}; }`,
    `#marquee { background-color: ${c.ground}; color: ${c.plaqueText}; font-family: ${f.heading === FONT_SETS.classic.heading ? f.heading : f.body}; }`,
    `.marquee-track { background-color: ${c.plaque}; border-color: ${c.plaque}; }`,
    `#crypt-footer { background-color: ${c.ground}; }`,
    `#hud, #graveyard { background-color: ${c.plaque}; }`,
    `.strip { background-image: ${digitsUrl(counter.digit, counter.cell)}; }`,
    `.cell, .odo { background: ${counter.cell}; }`,
    // The banner: the tile, a bevelled plaque with the WordArt title between two sprites, the divider under it.
    `#welcome { position: absolute; left: 0; right: 0; top: 48px; z-index: 0; box-sizing: border-box; height: ${welcomeHeight(l)}px; padding-top: ${tall ? 10 : 6}px; ` +
      `background-color: ${c.ground}; background-image: ${tile}; pointer-events: none; transition: opacity 200ms linear; }`,
    `#welcome.costume-hidden { opacity: 0; }`,
    `.wb-plaque { box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 12px; width: fit-content; max-width: calc(100% - 32px); height: ${tall ? 66 : 48}px; margin: 0 auto; padding: 0 12px; ` +
      `background: ${c.plaque}; border: ${bevel}; box-shadow: ${HARD_SHADOW}; }`,
    `.wb-text { display: flex; flex-direction: column; align-items: center; min-width: 0; }`,
    `.wb-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: bold ${tall ? 36 : 24}px/${tall ? 40 : 28}px ${f.heading}; color: ${c.title}; text-shadow: 2px 2px 0 ${c.shadow}, 3px 3px 0 #000000; letter-spacing: .5px; }`,
    `.wb-sub { font: 12px/14px ${f.body}; color: ${c.plaqueText}; white-space: nowrap; }`,
    `.wb-new { font-weight: bold; color: ${c.title}; animation: hg-blink 1000ms steps(1) infinite; }`,
    `.wb-divider { height: 16px; margin-top: 2px; background-image: ${divider}; background-repeat: repeat-x; image-rendering: pixelated; }`,
    `.deco { display: block; flex: none; width: 48px; height: 48px; image-rendering: pixelated; }`,
    `.wb-plaque .deco { margin: -6px 0; }`,
    `.deco svg { display: block; }`,
    ...Object.entries(MOVE_CSS).map(([m, a]) => `.deco[data-move="${m}"] { animation: ${a}; }`),
    `@media (max-width: ${WELCOME.phoneBelow - 1}px) { #welcome { height: ${WELCOME.phoneHeight}px; padding-top: 4px; } .wb-plaque { height: 34px; padding: 0 8px; } .wb-plaque .deco { display: none; } .wb-title { font-size: 16px; line-height: 18px; } }`,
    // Footer: a divider over the badges and the sprite pair beside the sign-off.
    `.footer-divider { height: 16px; margin: 16px auto 0; background-image: ${divider}; background-repeat: repeat-x; image-rendering: pixelated; }`,
    `.footer-sprites { display: flex; justify-content: center; gap: 24px; margin-top: 12px; }`,
    // The cursor trail: small glyphs that fall and fade.
    `#trail { position: absolute; inset: 0; z-index: 7; pointer-events: none; overflow: hidden; }`,
    `.spark { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; image-rendering: pixelated; animation: hg-trail 700ms linear forwards; }`,
    `.spark svg { display: block; }`,
    // The tab bar under the banner (hidden on a phone, where the banner is short).
    `.wb-tabs { display: flex; justify-content: center; gap: 2px; height: 24px; margin-top: 2px; pointer-events: none; }`,
    `.tab { box-sizing: border-box; height: 24px; padding: 3px 10px 0; background: #cccccc; color: #000000; border: 2px solid; border-color: #ffffff #666666 transparent #ffffff; border-bottom: 0; font: 12px/16px ${f.body}; text-decoration: none; white-space: nowrap; pointer-events: auto; }`,
    `@media (max-width: ${WELCOME.phoneBelow - 1}px) { .wb-tabs { display: none; } }`,
    // The furniture columns: a bevelled frame cell beside the page, the pieces stacked in it.
    `.fur-col { position: absolute; z-index: -1; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; padding: 8px 6px; overflow: hidden; ` +
      `background-color: ${c.band}; border: 3px ${l.bevel === "inset" ? "inset" : "outset"} ${c.bevelLight}; box-shadow: ${HARD_SHADOW}; pointer-events: none; transition: opacity 200ms linear; }`,
    `.fur-col.costume-hidden, #fur-bottom.costume-hidden { opacity: 0; }`,
    // Nothing of ours floats over the page: the starfield is the page's own background now (lookPageCss), so
    // the fixed gutter fills and the phone edge frame are not drawn.
    `#starfield .gutter, #edge-frame { display: none !important; }`,
    `#crypt-footer.page-locked { display: none !important; }`,
    `.fur-col.costume-hidden a, #fur-bottom.costume-hidden a { pointer-events: none; }`,
    `.fur { box-sizing: border-box; padding: 6px; background: ${c.plaque}; color: ${c.plaqueText}; border: 2px ${bevel.replace("3px ", "")}; font: 12px/16px ${f.body}; text-align: center; overflow-wrap: anywhere; }`,
    `.fur p { margin: 2px 0; }`,
    `.fur .big { font: bold 14px/18px ${f.heading}; color: ${c.title}; }`,
    `.fur-title { margin: 0 0 6px; font: bold 14px/18px ${f.heading}; color: ${c.title}; text-shadow: 1px 1px 0 #000000; }`,
    `.fur a { color: ${c.plaqueText}; text-decoration: underline; pointer-events: auto; }`,
    `.navbtn { display: block; margin: 4px 0; padding: 2px 4px; background: #cccccc; color: #000000 !important; border: 2px solid; border-color: #ffffff #666666 #666666 #ffffff; font: bold 12px/16px ${f.body}; text-decoration: none !important; }`,
    `.fur-list { margin: 0; padding: 0 0 0 14px; text-align: left; list-style: square; }`,
    `.award { display: block; margin: 4px auto; padding: 4px; background: #ffcc00; color: #000000; border: 2px solid; border-color: #ffff99 #996600 #996600 #ffff99; font: bold 12px/14px ${f.body}; }`,
    `.news { text-align: left; }`,
    `.new { font-weight: bold; color: ${c.title}; animation: hg-blink 1000ms steps(1) infinite; }`,
    `.fur .deco { margin: 0 auto 4px; }`,
    `.tape { height: 16px; margin-top: 6px; background-image: url("${svgData(dividerPx("tape", c), 64, 16)}"); image-rendering: pixelated; }`,
    `.odo-fake { display: inline-flex; gap: 2px; padding: 2px; background: #000000; border: 2px inset #666666; }`,
    `.odo-fake svg { display: block; background: #000000; }`,
    `#fur-bottom { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-start; gap: 12px; margin: 0 auto 20px; pointer-events: none; transition: opacity 200ms linear; }`,
    `#fur-bottom:empty { display: none; }`,
    `#fur-bottom .fur { width: 200px; }`,
    MOVES,
    `.reduced-motion .wb-new, .reduced-motion .deco, .reduced-motion .spark, .reduced-motion .new { animation: none !important; }`,
    `.reduced-motion #trail { display: none; }`,
  ]
    .filter(Boolean)
    .join("\n");
}

const HEADINGS = ":where(h1, h2, h3)";

/** Headings whose own colour is dark and that draw no ground: the ones a banded rainbow fill can read on. */
export function rainbowHeadings(doc: Document, max = 24): string[] {
  const win = doc.defaultView!;
  const out: string[] = [];
  for (const h of doc.querySelectorAll("h1, h2, h3")) {
    if (out.length >= max) break;
    const cs = win.getComputedStyle(h);
    const colour = parseColour(cs.color);
    const ground = (parseColour(cs.backgroundColor)?.alpha ?? 0) > 0 || (cs.backgroundImage && cs.backgroundImage !== "none" && !/rgb\(153, 0, 0\) 0%/.test(cs.backgroundImage));
    if (!colour || ground || relativeLuminance(colour.hex) >= L.darkLuminance) continue;
    out.push(cssPath(h));
  }
  return out;
}

/**
 * The look's backgrounds, behind the page and never over it: the tile on <html> (seen round the 1998 table)
 * and, on a light page, the tint and its pale pattern on <body>, under the page's own boxes.
 */
export function lookBackgrounds(l: Look, tint: boolean): string {
  const c = paletteOf(l);
  const pattern = tintPattern(l);
  return [
    `html { background: ${c.ground} url("${lookTiles(l).stars}") repeat fixed !important; }`,
    tint ? `body { background: ${c.tint}${pattern ? ` url("${pattern}") repeat` : ""} !important; }` : "",
  ].filter(Boolean).join("\n");
}

/** The look's page-sheet rules: the theme marker, the heading effect, the <hr> divider and image bevels. */
export function lookPageCss(l: Look, o: { rainbow?: string[]; dark?: boolean } = {}): string {
  const c = paletteOf(l);
  const out = [`:root { --hg-theme: ${l.preset}; --hg-welcome: ${welcomeHeight(l)}px; }`, `@media (max-width: ${WELCOME.phoneBelow - 1}px) { :root { --hg-welcome: ${WELCOME.phoneHeight}px; } }`];
  const shadow = o.dark ? "#000000" : c.bevelLight;
  if (l.heading === "wordart" || l.heading === "blink") out.push(`${HEADINGS} { text-shadow: 2px 2px 0 ${shadow}, 3px 3px 0 ${o.dark ? c.glow : c.bevelDark} !important; letter-spacing: .02em !important; }`);
  if (l.heading === "outline") out.push(`${HEADINGS} { text-shadow: 0 0 1px ${c.glow}, 1px 1px 0 ${c.glow}, -1px -1px 0 ${c.glow} !important; }`);
  if (l.heading === "blink") {
    out.push(`@keyframes hg-blink { 50% { visibility: hidden; } }`);
    // five blinks, then it stays (WCAG 2.2.2): nothing blinks for longer than five seconds
    out.push(`@media (prefers-reduced-motion: no-preference) { :where(h1) { animation: hg-blink 1000ms steps(1) 5 !important; } }`);
  }
  if (l.heading === "rainbow" && o.rainbow?.length && !o.dark) {
    const n = RAINBOW.length;
    const stops = RAINBOW.map((s, i) => `${s} ${((i * 100) / n).toFixed(2)}% ${(((i + 1) * 100) / n).toFixed(2)}%`).join(", ");
    out.push(`:is(${o.rainbow.join(", ")}) { background-image: linear-gradient(90deg, ${stops}) !important; -webkit-background-clip: text !important; background-clip: text !important; -webkit-text-fill-color: transparent !important; }`);
  }
  out.push(`:where(hr) { height: 16px !important; border: 0 !important; background: url("${svgData(dividerPx(l.divider, c), 64, 16)}") repeat-x !important; image-rendering: pixelated; }`);
  const frameW = l.dressing === "frames" ? 6 : 3;
  out.push(`:where(main, article) img { outline: ${frameW}px ${l.dressing === "frames" ? "ridge" : l.bevel} ${c.bevelLight} !important; outline-offset: 0 !important; }`);
  out.push(...dressingCss(l, !!o.dark));
  return out.join("\n");
}

/** 8×8 icons at 2px (16px): the heading prefix and the list bullet. */
const ICON8: Record<string, { map: string[]; legend: Record<string, string> }> = {
  skull: { map: ["..kkkk..", ".kWWWWk.", "kWWWWWWk", "kWkWWkWk", "kWWWWWWk", ".kWkkWk.", "..kWWk..", "..kkkk.."], legend: { k: "#000000", W: "#ffffff" } },
  flame: { map: ["...R....", "...RR...", "..ROR...", "..ROOR..", ".ROYYOR.", ".ROYYOR.", ".RROORR.", "..RRRR.."], legend: { R: "#cc0000", O: "#ff6600", Y: "#ffcc00" } },
  star: { map: ["...kk...", "...YY...", "kkYYYYkk", ".kYYYYk.", "..YYYY..", ".YYkkYY.", ".Yk..kY.", "........"], legend: { k: "#996600", Y: "#ffcc00" } },
  ball: { map: ["..kkkk..", ".kBBBBk.", "kBWBBBBk", "kBBBBBBk", "kBBBBBBk", "kBBBBBBk", ".kBBBBk.", "..kkkk.."], legend: { k: "#000000", B: "#3366ff", W: "#ffffff" } },
};
const icon8 = (name: string) => svgData(mapToPx(ICON8[name]!.map, ICON8[name]!.legend, 2), 16, 16);

/** Never dressed: site chrome and what is inside it. */
const NOT_CHROME = `:not(nav *, [role="navigation"] *, [role="banner"] *, [role="contentinfo"] *, header:not(main *, article *) *, footer:not(main *, article *) *)`;
const SECTIONS = "section, aside, blockquote, figure, table, form";
/** The outermost sections only, so nested boxes never double up. */
const TOP_SECTIONS = `:where(${SECTIONS}):not(:is(${SECTIONS}) *)${NOT_CHROME}`;
const LEGENDS = ["~*~ Neat Stuff ~*~", "Check it out!", "My Stuff", "Info!!"];

/** The section dressing and the heading prefix, as page-sheet rules (pseudo-elements, borders, list images). */
export function dressingCss(l: Look, dark: boolean): string[] {
  const c = paletteOf(l);
  const out: string[] = [];
  if (l.prefix !== "none") out.push(`:where(h2, h3)${NOT_CHROME}::before { content: url("${icon8(l.prefix)}") "\\a0" !important; }`);
  const bullet = l.prefix === "none" ? "ball" : l.prefix;
  if (l.dressing === "bullets") out.push(`:where(ul)${NOT_CHROME} { list-style-image: url("${icon8(bullet)}") !important; }`);
  if (l.dressing === "cells" || (l.dressing === "fieldset" && dark)) {
    out.push(`${TOP_SECTIONS} { border: 3px outset ${c.bevelLight} !important; padding: 8px !important; margin-block: 8px !important; }`);
  }
  if (l.dressing === "fieldset" && !dark) {
    out.push(`${TOP_SECTIONS} { border: 2px groove ${c.bevelDark} !important; padding: 14px 10px 8px !important; margin-block: 16px !important; }`);
    out.push(`${TOP_SECTIONS}::before { content: "${LEGENDS[l.banner % LEGENDS.length]}" !important; display: block !important; width: fit-content !important; margin: -24px 0 6px -2px !important; padding: 0 4px !important; background: #ffffff !important; color: ${c.link} !important; font: bold 13px/18px ${fontsOf(l).heading} !important; }`);
  }
  return out;
}
