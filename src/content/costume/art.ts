// Original pixel art for the costume, drawn by hand as character maps, plus the helpers that
// turn a map into a crisp SVG (one path per colour, runs merged). Every colour is a palette token.
import { PALETTE as P } from "./tokens";

export type Px = { x: number; y: number; w: number; h: number; color: string };
export type Legend = Record<string, string>;

/** The 32×32 Webmaster's Ghost (haunt moment): a ghost carrying a "mail the webmaster" envelope. */
export const WEBMASTER = [
  "...........oooooooooo...........",
  ".........ooWWWWWWWWWWoo.........",
  "........oWWWWWWWWWWWWWWo........",
  ".......oWWWWWWWWWWWWWWSSo.......",
  "......oWWWWWWWWWWWWWWWWSSo......",
  ".....oWWWWWWWWWWWWWWWWWWSSo.....",
  ".....oWWWWWWWWWWWWWWWWWWSSo.....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWoWWWWWWWWoWWWWSSo....",
  "....oWWWWWWooWWWWWWWooWWWSSo....",
  "....oWWWWWoooWWWWWWoooWWWSSo....",
  "....oWWWWWoooWWWWWWoooWWWSSo....",
  "....oWWWWWWoWWWWWWWWoWWWWSSo....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWWWWWooWWWoooooooooooo",
  "..oooWWWWWWWWWWooWWWoooYYYYYYooo",
  ".oWWWWWWWWWWWWWWWWWWoYYooYYooYYo",
  ".oWWWWWWWWWWWWWWWWWWoYYYYooYYYYo",
  "..oooWWWWWWWWWWWWWWWoYYYYYYYYYYo",
  "....oWWWWWWWWWWWWWWWoYYYYYYYYYYo",
  "....oWWWWWWWWWWWWWWWoYYYYYYYYYYo",
  "....oWWWWWWWWWWWWWWWoooooooooooo",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWWWWWWWWWWWWWWWWWSSo....",
  "....oWWWWooWWWWooWWWWooWWSSo....",
  ".....oSSo..oSSo..oSSo..oSSo.....",
  "......oo....oo....oo....oo......",
  "................................",
];
export const WEBMASTER_LEGEND: Legend = { o: P.crypt, W: P.ghostWhite, S: P.ghostShade, Y: P.star };

/** The 16×16 tracker ghost: shaded on its right, round eyes, a small "oo" mouth, a 2-row hem in the company tint. */
export const GHOST = [
  ".....oooooo.....",
  "...ooWWWWWWoo...",
  "..oWWWWWWWWWSo..",
  ".oWWWWWWWWWWWSo.",
  ".oWWWWWWWWWWWSo.",
  "oWWWooWWWWooWSSo",
  "oWWWooWWWWooWSSo",
  "oWWWooWWWWooWSSo",
  "oWWWWWWWWWWWWSSo",
  "oWWWWWWooWWWWSSo",
  "oWWWWWWWWWWWWSSo",
  "oWWWWWWWWWWWWSSo",
  "oHHHHHHHHHHHHHHo",
  "oHHHHHHHHHHHHHHo",
  "oHHoooHHHHoooHHo",
  ".oo...oooo...oo.",
];
export const ghostLegend = (hem: string): Legend => ({ o: P.crypt, W: P.ghostWhite, S: P.ghostShade, H: hem });

/** The 24×12 under-construction barricade: striped board, two legs, a lamp on each post. */
export function signFrame(lit: boolean): string[] {
  const board = Array.from({ length: 4 }, (_, r) =>
    "k" + Array.from({ length: 22 }, (_, i) => (Math.floor((i + r) / 3) % 2 ? "k" : "Y")).join("") + "k",
  );
  const lamp = lit ? "L" : "O";
  return [
    `...k${lamp}k............k${lamp}k...`,
    "kkkkkkkkkkkkkkkkkkkkkkkk",
    ...board,
    "kkkkkkkkkkkkkkkkkkkkkkkk",
    "...kGk............kGk...",
    "...kGk............kGk...",
    "...kGk............kGk...",
    "...kGk............kGk...",
    "..kkkkk..........kkkkk..",
  ];
}
export const SIGN_LEGEND: Legend = { k: P.ink, Y: P.star, O: P.curse, L: P.bone, G: P.stone };

/** 8×8 HUD icons, drawn at 2 CSS px per art pixel. */
export const ICONS = {
  ghost: ["..oooo..", ".oWWWWo.", "oWoWWoWo", "oWWWWWWo", "oWWWWWWo", "oWWWWWSo", "oWSWWSSo", "oo.oo.oo"],
  vampire: ["........", "G......G", "GG.GG.GG", "GGGGGGGG", "GGRGGRGG", ".GGGGGG.", "..G..G..", "........"],
  tomb: ["..GGGG..", ".GGGGGG.", ".GGDDGG.", ".GDDDDG.", ".GGDDGG.", ".GGDDGG.", ".GGGGGG.", "MMMMMMMM"],
  curse: [".OOOOOO.", "OOOOOOOO", "OkkOOkkO", "OkkOOkkO", "OOOkkOOO", ".OOOOOO.", ".OkOOkO.", "........"],
} as const;
export const ICON_LEGEND: Legend = {
  o: P.crypt, W: P.ghostWhite, S: P.ghostShade, G: P.stone, R: P.vampireGlow,
  D: P.stoneShadow, M: P.moss, O: P.curse, k: P.ink,
};

/** Our own 5×7 digits for the hit counter. */
export const DIGITS = [
  [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  ["..X..", ".XX..", "X.X..", "..X..", "..X..", "..X..", "XXXXX"],
  [".XXX.", "X...X", "....X", "..XX.", ".X...", "X....", "XXXXX"],
  ["XXXX.", "....X", "....X", ".XXX.", "....X", "....X", "XXXX."],
  ["...X.", "..XX.", ".X.X.", "X..X.", "XXXXX", "...X.", "...X."],
  ["XXXXX", "X....", "XXXX.", "....X", "....X", "X...X", ".XXX."],
  [".XXX.", "X....", "X....", "XXXX.", "X...X", "X...X", ".XXX."],
  ["XXXXX", "....X", "...X.", "..X..", ".X...", ".X...", ".X..."],
  [".XXX.", "X...X", "X...X", ".XXX.", "X...X", "X...X", ".XXX."],
  [".XXX.", "X...X", "X...X", ".XXXX", "....X", "....X", ".XXX."],
];

/** A character map as pixel runs, `scale` CSS px per art pixel, offset by (dx, dy). */
export function mapToPx(rows: readonly string[], legend: Legend, scale: number, dx = 0, dy = 0): Px[] {
  const out: Px[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      const color = legend[c];
      if (color) out.push({ x: dx + x * scale, y: dy + y * scale, w: (end - x) * scale, h: scale, color });
      x = end;
    }
  });
  return out;
}

/** Inline SVG markup: one path per colour, crisp edges, integer coordinates. */
export function svgMarkup(px: readonly Px[], width: number, height: number): string {
  const byColor = new Map<string, string>();
  for (const p of px) byColor.set(p.color, (byColor.get(p.color) ?? "") + `M${p.x} ${p.y}h${p.w}v${p.h}h-${p.w}z`);
  const paths = [...byColor].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${paths}</svg>`;
}

/** The same SVG as a CSS url(). */
export const svgUrl = (px: readonly Px[], width: number, height: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(svgMarkup(px, width, height))}")`;

/** A 2×2-cell checker tile (4×4 px): `color` on transparent, the 1998 dither. */
export const checkerUrl = (color: string) =>
  svgUrl([{ x: 0, y: 0, w: 2, h: 2, color }, { x: 2, y: 2, w: 2, h: 2, color }], 4, 4);
