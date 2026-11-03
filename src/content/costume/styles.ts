// The costume stylesheet, adopted inside the shadow root. Colours only from tokens.
import { checkerUrl, DIGITS, mapToPx, SIGN_LEGEND, signFrame, svgUrl, type Px } from "./art";
import { VAMPIRE_GLOW, VAMPIRE_GLOW_HI } from "./ghosts";
import { HARD_SHADOW, LAYOUT as L, MOTION as M, PALETTE as P, PIXEL } from "./tokens";

const COMIC = `"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive`;
const TIMES = `"Times New Roman", Times, serif`;

/** An 8×8 strip of moss pixels (2px each): tufts over a solid bed, repeated along the stone's base. */
const mossUrl = () => svgUrl(mapToPx([".M..", "MM.M", "MMMM", "MMMM"], { M: P.moss }, 2), 8, 8);

const signsUrl = () =>
  svgUrl([...mapToPx(signFrame(false), SIGN_LEGEND, PIXEL.iconScale), ...mapToPx(signFrame(true), SIGN_LEGEND, PIXEL.iconScale, 48)], 96, 24);

/** One 10×160 strip of 5×7 digits 0-9, each in a 16px slot, 1px from its top. */
const digitsUrl = () => {
  const px: Px[] = DIGITS.flatMap((d, i) => mapToPx(d, { X: P.ectoplasm }, 2, 0, i * 16 + 1));
  return svgUrl([{ x: 0, y: 0, w: 10, h: 160, color: P.ink }, ...px], 10, 160);
};

export function costumeCss(tiles: { stars: string; twinkle: string }): string {
  const stars = tiles.stars ? `url("${tiles.stars}")` : "none";
  const twinkle = tiles.twinkle ? `url("${tiles.twinkle}")` : "none";
  const ring = `outline: 2px dotted ${P.star}; outline-offset: 2px; box-shadow: 0 0 0 5px ${P.ink};`;
  return `
[hidden] { display: none !important; }
#crypt-root { position: fixed; inset: 0; pointer-events: none; font: 13px ${COMIC}; color: ${P.bone}; }
#crypt-root > * { transition: opacity ${M.base}ms linear; }
.costume-hidden > :not(#show-tab) { opacity: 0; pointer-events: none !important; }

#starfield { position: absolute; inset: 0; z-index: 1; }
#lanes { position: absolute; inset: 0; z-index: 2; }
#markers { position: absolute; inset: 0; z-index: 3; }
#top-bands { position: absolute; top: 0; left: 0; right: 0; z-index: 4; }
#hud { position: fixed; bottom: calc(8px + var(--hg-lift, 0px)); left: 8px; right: 8px; max-width: ${L.hudMaxWidth}px; margin: 0 auto; min-height: ${L.hudMinHeight}px; z-index: 5; box-sizing: border-box; display: flex; align-items: center; flex-wrap: nowrap; gap: 4px 12px; padding: 6px 10px; background-color: ${P.crypt}; border: 1px solid ${P.ink}; box-shadow: inset 2px 2px 0 ${P.hudBevelLight}, inset -2px -2px 0 ${P.bevelDark}, ${HARD_SHADOW}; isolation: isolate; pointer-events: auto; }
#cards { position: absolute; inset: 0; z-index: 6; }
#fx { position: absolute; inset: 0; z-index: 7; overflow: hidden; }

.gutter { position: absolute; top: 0; bottom: 0; opacity: .92; }
.gutter.left { left: 0; }
.gutter.right { right: 0; }
.fill { position: absolute; top: 0; bottom: 0; background-image: ${stars}; background-attachment: fixed; }
.left .fill { left: 0; right: 16px; }
.right .fill { right: 0; left: 16px; }
.fill::after { content: ""; position: absolute; inset: 0; background-image: ${twinkle}; background-attachment: fixed; animation: hg-twinkle ${M.twinkleMs}ms ease-in-out infinite alternate; }
.edge { position: absolute; top: 0; bottom: 0; width: 16px; background-image: ${stars}; background-attachment: fixed; mask-image: ${checkerUrl(P.ink)}; mask-size: 4px 4px; }
.left .edge { right: 0; }
.right .edge { left: 0; }
@keyframes hg-twinkle { from { opacity: .4; } to { opacity: 1; } }

#neighborhood { display: flex; align-items: center; justify-content: space-between; height: ${L.neighborhoodBar}px; padding: 0 4px 0 10px; background: ${P.cryptViolet}; color: ${P.bone}; font: 13px ${TIMES}; box-shadow: inset 0 -1px 0 ${P.spectral}; white-space: nowrap; }
#neighborhood b { letter-spacing: .5px; }
.sign { display: block; width: 48px; height: 24px; overflow: hidden; flex: none; image-rendering: pixelated; }
.sign-strip { display: block; width: 96px; height: 24px; background-image: ${signsUrl()}; animation: hg-sign 1000ms steps(2) infinite; }
@keyframes hg-sign { from { transform: translateX(0); } to { transform: translateX(-96px); } }
#marquee { height: ${L.marquee}px; background-color: ${P.crypt}; background-image: ${stars}; color: ${P.ectoplasm}; font: 14px ${COMIC}; line-height: ${L.marquee}px; overflow: hidden; white-space: nowrap; text-shadow: 1px 1px 0 ${P.ink}; box-shadow: inset 0 -1px 0 ${P.ink}; }
.marquee-track { display: inline-block; padding-left: 100%; animation: hg-marquee 20s linear 1 both; }
@keyframes hg-marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } }
.tab-hidden *, .tab-hidden *::after { animation-play-state: paused !important; }

#hud::before { content: ""; position: absolute; inset: 2px; z-index: -1; background-image: ${stars}; opacity: .3; }
.win95 { position: relative; flex: none; box-sizing: border-box; height: 24px; padding: 0 8px; background: ${P.stone}; color: ${P.ink}; border: 2px solid; border-color: ${P.ghostWhite} ${P.stoneShadow} ${P.stoneShadow} ${P.ghostWhite}; font: 13px ${COMIC}; cursor: pointer; }
.win95:active { border-color: ${P.stoneShadow} ${P.ghostWhite} ${P.ghostWhite} ${P.stoneShadow}; }
.counts { display: flex; gap: 10px; margin: 0; padding: 0; list-style: none; }
.count { display: flex; align-items: center; gap: 4px; }
.count svg { display: block; image-rendering: pixelated; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.empty { flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hud-break { display: none; }
.hits { display: flex; align-items: center; gap: 6px; flex: none; margin-left: auto; font-size: 11px; white-space: nowrap; }
.odo { display: flex; gap: 2px; padding: 2px; background: ${P.ink}; border: 1px solid; border-color: ${P.bevelDark} ${P.hudBevelLight} ${P.hudBevelLight} ${P.bevelDark}; }
.cell { display: block; width: 10px; height: 16px; overflow: hidden; background: ${P.ink}; }
.strip { display: block; width: 10px; height: 160px; background-image: ${digitsUrl()}; }
.ring { display: flex; align-items: center; gap: 4px; flex: none; min-width: 0; font: 13px ${TIMES}; white-space: nowrap; }
.ring button { flex: none; padding: 0 2px; border: 0; background: none; color: ${P.ectoplasm}; font: inherit; text-decoration: underline; cursor: pointer; }
.ring-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

#show-tab { position: absolute; right: 8px; bottom: calc(8px + var(--hg-lift, 0px)); width: 40px; height: 40px; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0; box-shadow: ${HARD_SHADOW}; font-size: 11px; line-height: 12px; pointer-events: auto; }
#show-tab svg { display: block; image-rendering: pixelated; }

button:focus { outline: none; }
button:focus-visible { ${ring} }
.win95:focus-visible::after { content: ""; position: absolute; inset: 2px; border: 1px dotted ${P.ink}; pointer-events: none; }
#show-tab:focus-visible { ${ring} }

.ghost, .vampire { position: absolute; display: flex; flex-direction: column; align-items: center; height: ${L.slotPitch}px; margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; pointer-events: auto; }
.sway { display: block; animation: hg-sway ${M.ghostSway.ms}ms ease-in-out var(--phase, 0ms) infinite alternate; }
.bob { display: block; animation: hg-bob ${M.ghostBob.ms}ms ease-in-out var(--phase, 0ms) infinite alternate; }
.sprite { display: block; width: 48px; height: 48px; filter: drop-shadow(0 0 6px ${P.spectral}) drop-shadow(0 0 2px ${P.ghostShade}); transition: opacity ${M.base}ms linear; }
.sprite svg { display: block; image-rendering: pixelated; }
@keyframes hg-bob { from { transform: translateY(-${M.ghostBob.px}px); } to { transform: translateY(${M.ghostBob.px}px); } }
@keyframes hg-sway { from { transform: translateX(-${M.ghostSway.px}px); } to { transform: translateX(${M.ghostSway.px}px); } }
.tag, .stack { box-sizing: border-box; max-width: min(12ch, 100%); margin-top: 4px; padding: 1px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: ${P.crypt}; color: ${P.bone}; border: 1px solid ${P.spectral}; font: 11px/14px ${COMIC}; }
.stack { position: absolute; display: flex; align-items: center; justify-content: center; height: 48px; margin: 0; padding: 0; font: bold 13px ${COMIC}; box-shadow: ${HARD_SHADOW}; }
.exorcised .sprite { opacity: .4; }
.exorcised .tag { color: ${P.hudBevelLight}; }
.stamp { position: absolute; top: 15px; left: 50%; padding: 0 2px; transform: translateX(-50%) rotate(-12deg); background: ${P.crypt}; color: ${P.curse}; border: 2px solid ${P.curse}; font: bold 11px/13px ${COMIC}; box-shadow: 2px 2px 0 ${P.ink}; }
.ghost:focus-visible { ${ring} }

.vampire .bob { animation: hg-drift 3000ms ease-in-out var(--phase, 0ms) infinite alternate; }
.vampire .sprite { width: 48px; height: 54px; filter: ${VAMPIRE_GLOW}; }
.vampire .tag { margin-top: 2px; }
.vampire.known .sprite { filter: none; }
.vampire.known:not(.exorcised) .sprite { opacity: .6; }
.vampire.known .bob { animation: none; }
@keyframes hg-drift { from { transform: translateY(-2px); } to { transform: translateY(2px); } }
.vampire:focus-visible { ${ring} }

.card { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; width: ${L.cardWidth}px; max-height: 320px; background: ${P.crypt}; border: 2px solid; border-color: ${P.bevelLight} ${P.bevelDark} ${P.bevelDark} ${P.bevelLight}; box-shadow: ${HARD_SHADOW}; pointer-events: auto; transform-origin: top left; }
.card .bar { display: flex; flex: none; align-items: center; gap: 6px; height: 22px; padding: 0 3px 0 6px; background: ${P.cryptViolet}; color: ${P.bone}; font: bold 14px ${TIMES}; }
.card h2 { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; }
.card .close { width: 16px; height: 16px; padding: 0; font: bold 11px/10px ${COMIC}; }
.card-body { padding: 12px; overflow-y: auto; font: 13px/1.35 ${COMIC}; color: ${P.bone}; }
.card-body p { margin: 0; }
.card .cat { display: inline-block; margin-bottom: 10px; padding: 0 6px; background: ${P.cryptViolet}; color: ${P.ectoplasm}; border: 1px solid ${P.spectral}; font-size: 11px; line-height: 16px; letter-spacing: .5px; text-transform: uppercase; }
.domains { margin: 4px 0 10px; padding: 6px 8px 6px 24px; background: ${P.ink}; border: 1px solid; border-color: ${P.bevelDark} ${P.hudBevelLight} ${P.hudBevelLight} ${P.bevelDark}; color: ${P.ectoplasm}; font: 13px/1.4 ${TIMES}; list-style: square; overflow-wrap: anywhere; }
.seen { margin-bottom: 12px !important; }
.card .act { display: block; box-shadow: 0 0 0 1px ${P.ink}; }
.vampire-card .bar { background: ${P.vampireLining}; box-shadow: inset 0 -1px 0 ${P.vampireGlow}; }
.vampire-card .who { margin-bottom: 8px; font-weight: bold; }
.vampire-card .domains { overflow-wrap: normal; word-break: keep-all; }
.did { margin-bottom: 4px !important; }
.did b { color: ${VAMPIRE_GLOW_HI}; font-weight: normal; }
.honest { margin-bottom: 10px !important; color: ${P.hudBevelLight}; font-size: 11px; }
.what { margin-bottom: 12px !important; }
.foot { margin-top: 10px !important; color: ${P.hudBevelLight}; font-size: 11px; }

.tomb-marker { position: absolute; display: block; width: 16px; height: 20px; margin: 0; padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; }
.tomb-marker svg { display: block; image-rendering: pixelated; }
.tomb-marker:hover svg { filter: drop-shadow(0 0 3px ${P.spectral}); }
.tomb-marker:focus-visible { ${ring} }

.card.tombstone-card { display: block; width: ${L.tombstoneWidth}px; height: 208px; max-height: none; overflow: hidden; background: ${P.stone}; border: 2px solid; border-color: ${P.ghostWhite} ${P.stoneShadow} ${P.stoneShadow} ${P.ghostWhite}; border-radius: 88px 88px 0 0; box-shadow: ${HARD_SHADOW}; }
.tombstone-card .close { position: absolute; top: 24px; right: 30px; z-index: 1; }
.tombstone-card .inscription { position: absolute; inset: 16px; bottom: 24px; display: flex; flex-direction: column; justify-content: center; color: ${P.ink}; font-family: ${TIMES}; text-align: center; }
.tombstone-card p { margin: 0; }
.tombstone-card .here-lies { font-size: 11px; line-height: 14px; letter-spacing: 2px; padding-left: 2px; }
.tombstone-card .path { margin: 6px 0; font-size: 13px; line-height: 17px; overflow-wrap: normal; word-break: keep-all; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.tombstone-card .seg { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; vertical-align: top; }
.tombstone-card .status { font-size: 11px; line-height: 14px; }
.tombstone-card .host { font-size: 11px; line-height: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tombstone-card .moss { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: ${mossUrl()} repeat-x left bottom / 8px 8px; }

.vignette { position: absolute; inset: 0; opacity: .4; background: radial-gradient(ellipse at center, transparent 45%, ${P.crypt} 100%); }
.sweep { position: absolute; top: 0; bottom: 0; left: 0; width: 96px; }
.webmaster { position: absolute; left: 0; top: calc(50% - 48px); width: 96px; height: 96px; filter: drop-shadow(0 0 6px ${P.spectral}) drop-shadow(0 0 2px ${P.ghostShade}); }
.webmaster svg { display: block; width: 96px; height: 96px; image-rendering: pixelated; }
.leaving .webmaster svg { transform: scaleX(-1); }
.ectoplasm { position: absolute; top: 0; bottom: 0; left: -16px; width: 32px; background-image: ${checkerUrl(P.ectoplasm)}; background-size: 4px 4px; }
.leaving .ectoplasm { left: 80px; }

@media (max-width: ${L.hudWrapBelow}px) {
  #hud { left: 4px; right: 4px; bottom: calc(4px + var(--hg-lift, 0px)); flex-wrap: wrap; row-gap: 4px; column-gap: 8px; padding: 6px 8px; }
  .empty { flex-basis: 0; }
  .hud-break { display: block; flex-basis: 100%; height: 0; }
  .hits { margin-left: 0; }
  .ring { flex: 1 0 0; }
  #show-tab { right: 4px; bottom: calc(4px + var(--hg-lift, 0px)); }
}

.reduced-motion *, .reduced-motion *::before, .reduced-motion *::after { animation: none !important; transition: opacity ${M.base}ms linear !important; }
.reduced-motion .marquee-track { display: block; padding: 0 10px; overflow: hidden; text-overflow: ellipsis; transform: none; }
`;
}
