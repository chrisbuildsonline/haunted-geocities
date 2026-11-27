// The seeded looks' pixel art: 64×64 tiles drawn in a palette's inks, the pale tint patterns, the
// <hr> dividers, 16×16 sprites and the cursor-trail glyphs. All original, all web-safe colours.
import { mapToPx, svgMarkup, type Legend, type Px } from "./art";
import { fnv1a, mulberry32 } from "./seed";
import { STAR_TILE } from "./starfield";
import { PALETTE as P } from "./tokens";
import type { Look, Palette } from "./themes";

/** An SVG as a raw data: URL (for CSS url("…") and <img>). */
export const svgData = (px: readonly Px[], w: number, h: number) => `data:image/svg+xml,${encodeURIComponent(svgMarkup(px, w, h))}`;

const dot = (x: number, y: number, color: string, w = 1, h = w): Px => ({ x: ((x % 64) + 64) % 64, y: ((y % 64) + 64) % 64, w, h, color });
const S = 64;
const TAU = Math.PI * 2;

/** A blob (filled circle) of radius r at (cx, cy), wrapped onto the tile. */
function blob(cx: number, cy: number, r: number, color: string, out: Px[], size = S) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) out.push({ x: (((cx + x) % size) + size) % size, y: (((cy + y) % size) + size) % size, w: 1, h: 1, color });
  }
}

/** A Bresenham line, clipped to the tile. */
function line(x0: number, y0: number, x1: number, y1: number, color: string, out: Px[]) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < S && y0 < S) out.push({ x: x0, y: y0, w: 1, h: 1, color });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];

/** The 64×64 background tile for `tile` in palette `c`: ground first, then the inks. */
export function tilePx(tile: Look["tile"], c: Palette): Px[] {
  const rnd = mulberry32(fnv1a(tile));
  const out: Px[] = [{ x: 0, y: 0, w: S, h: S, color: c.ground }];
  switch (tile) {
    case "stars":
      for (const p of STAR_TILE.pixels) out.push({ ...p, color: p.color === P.ghostWhite ? c.a1 : c.a2 });
      break;
    case "flames": {
      // Pointed tongues of fire from the bottom edge: an outer ink, a hotter middle, a core.
      const tongue = (cx: number, h: number, half: number, color: string) => {
        for (let y = 0; y < h; y += 2) {
          const w = Math.round(half * (1 - (y / h) ** 1.4));
          if (w > 0) out.push(dot(cx - w, S - 2 - y, color, w * 2, 2));
        }
      };
      const tongues = [0, 8, 16, 24, 32, 40, 48, 56].map((x) => [x + Math.floor(rnd() * 4), 26 + Math.floor(rnd() * 30)] as const);
      for (const [x, h] of tongues) tongue(x, h, 7, c.a1);
      for (const [x, h] of tongues) tongue(x, Math.round(h * 0.68), 5, c.a2);
      for (const [x, h] of tongues) tongue(x, Math.round(h * 0.36), 3, c.a3);
      for (let i = 0; i < 6; i++) out.push(dot(Math.floor(rnd() * 32) * 2, Math.floor(rnd() * 14) * 2, c.a3, 2));
      break;
    }
    case "bricks":
      for (let row = 0; row < 8; row++) {
        const y = row * 8;
        out.push({ x: 0, y: y + 6, w: S, h: 2, color: c.a2 });
        for (let b = 0; b < 4; b++) {
          const x = b * 16 + (row % 2) * 8;
          out.push(dot(x, y, c.a2, 2, 6), dot(x + 2, y, c.a1, 12, 1), dot(x + 4 + Math.floor(rnd() * 8), y + 3, c.a1));
        }
      }
      break;
    case "clouds":
      for (const [cx, cy] of [[12, 14], [44, 40], [26, 56]] as const) {
        for (const [ox, oy, r] of [[0, 0, 6], [7, -3, 7], [14, 1, 5], [-6, 2, 4]] as const) blob(cx + ox, cy + oy + 2, r, c.a3, out);
        for (const [ox, oy, r] of [[0, 0, 6], [7, -3, 7], [14, 1, 5], [-6, 2, 4]] as const) blob(cx + ox, cy + oy, r, c.a1, out);
      }
      break;
    case "matrix":
      for (let col = 0; col < 8; col++) {
        const head = Math.floor(rnd() * 9);
        for (let g = 0; g < 9; g++) {
          if (rnd() < 0.35) continue;
          const colour = g === head ? c.a3 : g === head - 1 ? c.a1 : c.a2;
          for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (rnd() < 0.55) out.push(dot(col * 8 + 2 + xx, g * 7 + yy, colour));
        }
      }
      break;
    case "slime":
      out.push({ x: 0, y: 0, w: S, h: 5, color: c.a1 });
      for (let i = 0; i < 7; i++) {
        const x = i * 9 + Math.floor(rnd() * 4), w = 3 + Math.floor(rnd() * 3), len = 8 + Math.floor(rnd() * 30);
        out.push(dot(x, 4, c.a1, w, len), dot(x, 4, c.a2, 1, len));
        blob(x + Math.floor(w / 2), 4 + len, Math.ceil(w / 2), c.a1, out);
      }
      for (let i = 0; i < 6; i++) out.push(dot(Math.floor(rnd() * 64), 20 + Math.floor(rnd() * 44), c.a3, 2));
      break;
    case "checker":
      for (let y = 0; y < S; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < S; x += 32)
        for (let yy = 0; yy < 16; yy += 2) for (let xx = 0; xx < 16; xx += 2) out.push(dot(x + xx + ((yy / 2) % 2), y + yy, c.a1, 1, 2));
      break;
    case "web":
      for (let a = 0; a <= 90; a += 18) line(0, 0, Math.round(63 * Math.cos((a * Math.PI) / 180)), Math.round(63 * Math.sin((a * Math.PI) / 180)), c.a1, out);
      for (const r of [14, 28, 42, 56]) for (let a = 0; a < 90; a += 18) {
        const p = (d: number) => [Math.round(r * Math.cos((d * Math.PI) / 180)), Math.round(r * Math.sin((d * Math.PI) / 180))] as const;
        const [x0, y0] = p(a), [x1, y1] = p(a + 18);
        line(x0, y0, x1, y1, c.a2, out);
      }
      line(48, 0, 48, 40, c.a2, out);
      out.push(...mapToPx(["k.k.k", ".kkk.", "kkkkk", ".kkk.", "k.k.k"], { k: c.a3 }, 1, 46, 40));
      break;
    case "hearts":
      for (const [x, y, col] of [[6, 6, c.a1], [38, 14, c.a2], [18, 38, c.a2], [48, 48, c.a1]] as const) out.push(...mapToPx(HEART, { X: col }, 1, x, y));
      for (let i = 0; i < 6; i++) out.push(dot(Math.floor(rnd() * 64), Math.floor(rnd() * 64), c.a3));
      break;
    case "planets":
      for (const p of STAR_TILE.pixels) out.push({ ...p, color: c.a1 });
      blob(22, 26, 8, c.a3, out);
      out.push({ x: 10, y: 26, w: 25, h: 1, color: c.a2 }, { x: 12, y: 27, w: 21, h: 1, color: c.a2 });
      blob(50, 48, 3, c.a2, out);
      break;
  }
  return out;
}

/** The fading second layer: two small 4-point sparkles in the brightest ink. */
export const twinklePx = (c: Palette): Px[] =>
  [[46, 42], [14, 20]].flatMap(([x, y]) => [{ x: x!, y: y!, w: 1, h: 5, color: c.a3 }, { x: x! - 2, y: y! + 2, w: 2, h: 1, color: c.a3 }, { x: x! + 1, y: y! + 2, w: 2, h: 1, color: c.a3 }]);

/**
 * The pale pattern multiplied over the content column: the tint with white shapes (white leaves the
 * page as it is), so the darkest colour under the text is always the tint itself.
 */
export function tintPatternPx(tile: Look["tile"], tint: string): Px[] {
  const W = "#ffffff";
  const out: Px[] = [{ x: 0, y: 0, w: 32, h: 32, color: tint }];
  switch (tile) {
    case "bricks":
      for (let row = 0; row < 4; row++) out.push({ x: 0, y: row * 8 + 7, w: 32, h: 1, color: W }, { x: (row % 2) * 8, y: row * 8, w: 1, h: 7, color: W }, { x: (row % 2) * 8 + 16, y: row * 8, w: 1, h: 7, color: W });
      break;
    case "checker":
      out.push({ x: 0, y: 0, w: 16, h: 16, color: W }, { x: 16, y: 16, w: 16, h: 16, color: W });
      break;
    case "clouds":
      blob(10, 10, 4, W, out, 32);
      blob(15, 9, 5, W, out, 32);
      blob(26, 25, 3, W, out, 32);
      break;
    case "hearts":
      out.push(...mapToPx(HEART, { X: W }, 1, 4, 4), ...mapToPx(HEART, { X: W }, 1, 20, 20));
      break;
    case "matrix":
      out.push(...mapToPx(["W.W", "WWW", "..W"], { W }, 1, 4, 4), ...mapToPx([".W.", "WW.", ".W."], { W }, 1, 20, 18));
      break;
    case "web":
      for (let i = 0; i < 32; i++) out.push({ x: i, y: i, w: 1, h: 1, color: W }, { x: 31 - i, y: i, w: 1, h: 1, color: W });
      break;
    default:
      out.push({ x: 4, y: 6, w: 2, h: 2, color: W }, { x: 22, y: 12, w: 2, h: 2, color: W }, { x: 12, y: 24, w: 2, h: 2, color: W }, { x: 28, y: 28, w: 1, h: 1, color: W });
  }
  return out;
}

/** The divider strip for <hr> and under the banner: 64×16, repeated along x. */
export function dividerPx(kind: Look["divider"], c: Palette): Px[] {
  const out: Px[] = [];
  switch (kind) {
    case "flames":
      for (let x = 0; x < 64; x += 2) {
        const h = Math.round(9 + 4 * Math.sin((TAU * x) / 16) + 2 * Math.sin((TAU * x) / 32));
        out.push({ x, y: 16 - h, w: 2, h, color: c.a1 === "#ffffff" ? "#cc0000" : c.a1 }, { x, y: 16 - Math.round(h * 0.6), w: 2, h: Math.round(h * 0.6), color: "#ff6600" }, { x, y: 16 - Math.round(h * 0.25), w: 2, h: Math.round(h * 0.25), color: "#ffcc00" });
      }
      break;
    case "skulls":
      out.push({ x: 0, y: 7, w: 64, h: 2, color: c.bevelDark });
      for (const x of [12, 44]) out.push(...mapToPx([".kkkk.", "kWWWWk", "kWkkWk", "kWWWWk", ".kWWk.", ".kkkk."], { k: "#000000", W: "#ffffff" }, 2, x, 2));
      break;
    case "tape":
      out.push({ x: 0, y: 0, w: 64, h: 16, color: "#ffcc00" });
      for (let x = -16; x < 64; x += 16) for (let y = 0; y < 16; y++) out.push(...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: x + y + i, y, w: 1, h: 1, color: "#000000" })).filter((p) => p.x >= 0 && p.x < 64));
      out.push({ x: 0, y: 0, w: 64, h: 1, color: "#000000" }, { x: 0, y: 15, w: 64, h: 1, color: "#000000" });
      break;
    case "rainbow":
      ["#ff0000", "#ff9900", "#ffff00", "#00cc00", "#0066ff", "#9900cc"].forEach((color, i) => out.push({ x: 0, y: 2 + i * 2, w: 64, h: 2, color }));
      break;
    case "drips": {
      const ink = c.a1 === "#ffffff" ? "#66ff00" : c.a1;
      out.push({ x: 0, y: 0, w: 64, h: 4, color: ink });
      for (const [x, len] of [[3, 6], [13, 11], [22, 4], [31, 9], [42, 12], [53, 5], [59, 8]] as const) out.push({ x, y: 4, w: 3, h: len, color: ink }, { x: x - 1, y: 3 + len, w: 5, h: 2, color: ink });
      break;
    }
  }
  return out.filter((p) => p.x >= 0);
}

// Sprites: 16×16 at 3 CSS px per art pixel (48×48), outlined in black.
export const SPRITE_LEGEND: Legend = {
  k: "#000000", W: "#ffffff", G: "#cccccc", Y: "#ffcc00", O: "#ff6600", R: "#cc0000", B: "#3366ff", N: "#000099",
  P: "#9933cc", L: "#66ff00", g: "#009900", K: "#ff99cc", T: "#996633", S: "#ffcc99", C: "#00cccc",
};

export const SPRITES: Record<string, { map: string[]; move: "spin" | "flap" | "bob" | "wiggle" | "pulse" | "hop" }> = {
  skull: { move: "spin", map: ["....kkkkkkkk....", "...kWWWWWWWWk...", "..kWWWWWWWWWWk..", ".kWWWWWWWWWWWGk.", ".kWWWWWWWWWWWGk.", ".kWkkkWWWWkkkGk.", ".kWkkkWWWWkkkGk.", ".kWkkkWWWWkkkGk.", ".kWWWWWkkWWWWGk.", "..kWWWWkkWWWGk..", "...kWWWWWWWGk...", "...kWkWkWkWkk...", "...kWkWkWkWGk...", "....kWWWWWGk....", ".....kkkkkk.....", "................"] },
  bat: { move: "flap", map: ["................", "................", "k..............k", "kk....k..k....kk", "kPk...kkkk...kPk", "kPPk.kPPPPk.kPPk", "kPPPkPYPPYPkPPPk", "kPPPPPPPPPPPPPPk", "kPPPPPPPPPPPPPPk", ".kPPPkPWWPkPPPk.", "..kPk.kPPk.kPk..", "...k...kk...k...", "................", "................", "................", "................"] },
  worker: { move: "wiggle", map: ["......kkkk......", ".....kYYYYk.....", "....kYYYYYYk....", "...kkkkkkkkkk...", ".....kSSSSk.....", ".....kSkSkk.....", ".....kSSSSk.....", "......kSSk......", "....kOOOOOOk..T.", "...kOOYOOYOOk.T.", "...kSkOOOOkSk.T.", "....kNNNNNNkkkT.", "....kNNkkNNk.kTk", "....kNNkkNNk.GGG", "...kkkk..kkkkGGG", "................"] },
  cone: { move: "hop", map: [".......kk.......", "......kOOk......", "......kOOk......", ".....kOWWOk.....", ".....kWWWWk.....", "....kOOOOOOk....", "....kOOOOOOk....", "...kOWWWWWWOk...", "...kWWWWWWWWk...", "..kOOOOOOOOOOk..", "..kOOOOOOOOOOk..", ".kkkkkkkkkkkkkk.", "kGGGGGGGGGGGGGGk", "kkkkkkkkkkkkkkkk", "................", "................"] },
  mailbox: { move: "wiggle", map: ["................", "....kkkkkkk.....", "...kBBBBBBBk.kkk", "..kBBBBBBBBBkRRk", "..kBkkkkkkkBkRRk", "..kBkWWWWWkBk.k.", "..kBkkkkkkkBk.k.", "..kBBBBBBBBBk.k.", "..kkkkkkkkkkk.k.", "......kTTk....k.", "......kTTk......", "......kTTk......", "......kTTk......", "....kkkkkkkk....", "....kggggggk....", "................"] },
  envelope: { move: "hop", map: ["................", "................", "................", "kkkkkkkkkkkkkkkk", "kkWWWWWWWWWWWWkk", "kWkWWWWWWWWWWkWk", "kWWkWWWWWWWWkWWk", "kWWWkWWWWWWkWWWk", "kWWWWkWWWWkWWWWk", "kWWWWWkRRkWWWWWk", "kWWWWWWkkWWWWWWk", "kWWWWWWWWWWWWWWk", "kkkkkkkkkkkkkkkk", "................", "................", "................"] },
  ufo: { move: "bob", map: ["................", "................", "......kkkk......", ".....kCCWCk.....", "....kCCCCCCk....", "..kkkkkkkkkkkk..", ".kGGGGGGGGGGGGk.", "kGYGGYGGYGGYGGGk", ".kGGGGGGGGGGGGk.", "..kkkkkkkkkkkk..", "....L..L..L.....", "...L...L...L....", "................", "................", "................", "................"] },
  alien: { move: "bob", map: ["....kkkkkkkk....", "...kLLLLLLLLk...", "..kLLLLLLLLLLk..", ".kLLLLLLLLLLLLk.", ".kLkkkLLLLkkkLk.", ".kLkkkkLLkkkkLk.", ".kLLkkkLLkkkLLk.", "..kLLLLLLLLLLk..", "...kLLLLLLLLk...", "....kLLkkLLk....", ".....kLLLLk.....", "......kkkk......", "....kgggggk.....", "...kgggggggk....", "...kgkgggkgk....", "................"] },
  globe: { move: "spin", map: [".....kkkkkk.....", "...kkBBBBBBkk...", "..kBBggBBBBBBk..", ".kBgggggBBBggBk.", ".kBggggBBBgggBk.", "kBBBgggBBBBggBBk", "kBBBBggBBBBBBBBk", "kBBBBBBBBggggBBk", "kBBBBBBBgggggBBk", "kBggBBBBBggggBBk", "kBgggBBBBBggBBBk", ".kBggBBBBBBBBBk.", ".kBBBBBgggBBBBk.", "..kBBBBggBBBBk..", "...kkBBBBBBkk...", ".....kkkkkk....."] },
  computer: { move: "bob", map: ["..kkkkkkkkkkkk..", "..kGGGGGGGGGGk..", "..kGkkkkkkkkGk..", "..kGkNNNNNNkGk..", "..kGkNLLNNNkGk..", "..kGkNNNNNNkGk..", "..kGkNLLLNNkGk..", "..kGkkkkkkkkGk..", "..kGGGGGGGRGGk..", "..kkkkkkkkkkkk..", ".....kGGGGk.....", "...kkkkkkkkkk...", "..kGGGGGGGGGGk..", "..kGkGkGkGkGGk..", "..kkkkkkkkkkkk..", "................"] },
  heart: { move: "pulse", map: ["................", "..kkkk....kkkk..", ".kRRRRk..kRRRRk.", "kRRWWRRkkRRRRRRk", "kRWWRRRRRRRRRRRk", "kRWRRRRRRRRRRRRk", "kRRRRRRRRRRRRRRk", ".kRRRRRRRRRRRRk.", "..kRRRRRRRRRRk..", "...kRRRRRRRRk...", "....kRRRRRRk....", ".....kRRRRk.....", "......kRRk......", ".......kk.......", "................", "................"] },
  cat: { move: "wiggle", map: ["................", ".kk.........kk..", ".kGk.......kGk..", ".kGGkkkkkkkGGk..", ".kGGGGGGGGGGGk..", ".kGYYGGGGGYYGk..", ".kGkYGGGGGkYGk..", ".kGGGGGKGGGGGk..", "WkGGGGkkkGGGGkW.", ".kGGGGGGGGGGGk..", "..kGGGGGGGGGk...", "...kkGGGGGkk....", "....kGGGGGk.....", "...kGGkGkGGk....", "...kkkkkkkkk.k..", "................"] },
};

export const spriteSvg = (name: string) => svgMarkup(mapToPx(SPRITES[name]!.map, SPRITE_LEGEND, 3), 48, 48);

/** Cursor-trail glyphs: 7×7 at 2 CSS px (14×14). */
export const TRAIL_GLYPHS: Record<Look["trail"], string[]> = {
  stars: ["...Y...", "...Y...", "YYYYYYY", ".YYYYY.", "..YYY..", ".YY.YY.", "Y.....Y"],
  sparkles: ["...W...", "...W...", "..WCW..", "WWCCCWW", "..WCW..", "...W...", "...W..."],
  bats: [".......", "P.....P", "PP...PP", "PPPPPPP", "PPYPYPP", ".PPPPP.", "..P.P.."],
  hearts: [".KK.KK.", "KKKKKKK", "KKKKKKK", ".KKKKK.", "..KKK..", "...K...", "......."],
  fire: ["...Y...", "..YO...", "..OYO..", ".OYYO..", ".ORYRO.", ".ORRRO.", "..OOO.."],
};
export const trailSvg = (kind: Look["trail"]) => svgMarkup(mapToPx(TRAIL_GLYPHS[kind], SPRITE_LEGEND, 2), 14, 14);
