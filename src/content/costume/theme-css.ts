// The seeded look as CSS: one sheet for the shadow root (bands, banner, footer, sprites, trail, the
// gutters' layout quirk) and the page-sheet rules (theme marker, headings, dividers, image bevels).
// Nothing here moves page content except the <hr> divider's height and the banner's top padding.
import { DIGITS, mapToPx, type Px } from "./art";
import { cssPath } from "./page-blocks";
import { relativeLuminance, parseColour } from "./page-theme";
import { dividerPx, spriteSvg, SPRITES, svgData, tilePx, tintPatternPx, twinklePx } from "./theme-art";
import { BANNERS, COUNTERS, FONT_SETS, PALETTES, RAINBOW, SPRITE_SETS, type Look } from "./themes";
import { HARD_SHADOW, LAYOUT as L } from "./tokens";

/** Banner heights (px): the page sheet pads the body top by the bands plus this. */
export const WELCOME = { height: 72, phoneHeight: 56, phoneBelow: 480 } as const;

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
  spin: "hg-spin 1200ms steps(4) infinite",
  flap: "hg-flap 500ms steps(2) infinite",
  bob: "hg-dbob 1000ms steps(2) infinite",
  wiggle: "hg-wiggle 1000ms steps(2) infinite",
  pulse: "hg-pulse 800ms steps(2) infinite",
  hop: "hg-hop 1000ms steps(3) infinite",
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
  const frame = l.quirk === "table" ? "" : l.quirk === "leftframe" ? "left" : "right";
  return [
    `#neighborhood { background: ${c.band}; color: ${c.bandText}; box-shadow: inset 0 -1px 0 ${c.glow}; }`,
    `#marquee { background-color: ${c.ground}; color: ${c.plaqueText}; font-family: ${f.heading === FONT_SETS.classic.heading ? f.heading : f.body}; }`,
    `.marquee-track { background-color: ${c.plaque}; border-color: ${c.plaque}; }`,
    `#crypt-footer { background-color: ${c.ground}; }`,
    `#hud, #graveyard { background-color: ${c.plaque}; }`,
    `.strip { background-image: ${digitsUrl(counter.digit, counter.cell)}; }`,
    `.cell, .odo { background: ${counter.cell}; }`,
    // The banner: the tile, a bevelled plaque with the WordArt title between two sprites, the divider under it.
    `#welcome { position: absolute; left: 0; right: 0; top: 48px; z-index: 2147483647; box-sizing: border-box; height: ${WELCOME.height}px; padding-top: 6px; ` +
      `background-color: ${c.ground}; background-image: ${tile}; pointer-events: none; transition: opacity 200ms linear; }`,
    `#welcome.costume-hidden { opacity: 0; }`,
    `.wb-plaque { box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 12px; width: fit-content; max-width: calc(100% - 32px); height: 48px; margin: 0 auto; padding: 0 12px; ` +
      `background: ${c.plaque}; border: ${bevel}; box-shadow: ${HARD_SHADOW}; }`,
    `.wb-text { display: flex; flex-direction: column; align-items: center; min-width: 0; }`,
    `.wb-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: bold 24px/28px ${f.heading}; color: ${c.title}; text-shadow: 2px 2px 0 ${c.shadow}, 3px 3px 0 #000000; letter-spacing: .5px; }`,
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
    // The layout quirk: one gutter is a 1998 nav frame (a solid panel with a bevelled inner edge).
    frame && `#starfield .gutter.${frame} .fill { background: ${c.band}; box-shadow: inset ${frame === "left" ? "-" : ""}3px 0 0 ${c.bevelLight}, inset ${frame === "left" ? "-" : ""}6px 0 0 ${c.bevelDark}; }`,
    frame && `#starfield .gutter.${frame} .fill::after { content: none; }`,
    frame && `#starfield .gutter.${frame} .edge { display: none; }`,
    MOVES,
    `.reduced-motion .wb-new, .reduced-motion .deco, .reduced-motion .spark { animation: none !important; }`,
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

/** The look's page-sheet rules: the theme marker, the heading effect, the <hr> divider and image bevels. */
export function lookPageCss(l: Look, o: { rainbow?: string[]; dark?: boolean } = {}): string {
  const c = paletteOf(l);
  const out = [`:root { --hg-theme: ${l.preset}; --hg-welcome: ${WELCOME.height}px; }`, `@media (max-width: ${WELCOME.phoneBelow - 1}px) { :root { --hg-welcome: ${WELCOME.phoneHeight}px; } }`];
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
  out.push(`:where(main, article) img { outline: 3px ${l.bevel} ${c.bevelLight} !important; outline-offset: -3px !important; }`);
  return out.join("\n");
}
