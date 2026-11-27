// Seeded 1998 looks (design/DESIGN.md "Themes"). A site's seed picks one of the named presets, then
// swaps two or three of its axes (palette, divider, sprites, trail, ...) for others that the clash
// rules allow. Every option is data; the art lives in theme-art.ts and the CSS in theme-css.ts.
import { contrastRatio, relativeLuminance } from "./page-theme";
import { fnv1a, mulberry32, pick, seedKey } from "./seed";

export type Palette = {
  /** The tile's ground and its three inks. */
  ground: string;
  a1: string;
  a2: string;
  a3: string;
  /** The neighborhood bar. */
  band: string;
  bandText: string;
  /** The solid plaque under the marquee line, the banner title and the cover. Always dark. */
  plaque: string;
  plaqueText: string;
  title: string;
  /** WordArt shadow colour. */
  shadow: string;
  /** The pale tint multiplied over the content column (light pages). */
  tint: string;
  link: string;
  visited: string;
  hover: string;
  bevelLight: string;
  bevelDark: string;
  glow: string;
};

export const PALETTES = {
  crypt: { ground: "#000033", a1: "#ffffff", a2: "#ffff66", a3: "#ffffcc", band: "#330066", bandText: "#ffffcc", plaque: "#000033", plaqueText: "#66ff99", title: "#ffff66", shadow: "#6633cc", tint: "#ffffcc", link: "#0000ff", visited: "#990099", hover: "#ff0000", bevelLight: "#9999cc", bevelDark: "#333366", glow: "#6633cc" },
  inferno: { ground: "#000000", a1: "#cc0000", a2: "#ff6600", a3: "#ffcc00", band: "#660000", bandText: "#ffff99", plaque: "#000000", plaqueText: "#ff9900", title: "#ffcc00", shadow: "#cc0000", tint: "#ffcc99", link: "#0000cc", visited: "#990000", hover: "#cc0000", bevelLight: "#ff9900", bevelDark: "#660000", glow: "#ff3300" },
  toxic: { ground: "#330033", a1: "#66ff00", a2: "#339900", a3: "#ccff66", band: "#003300", bandText: "#ccff66", plaque: "#000000", plaqueText: "#66ff00", title: "#99ff00", shadow: "#663399", tint: "#ccff99", link: "#000099", visited: "#660066", hover: "#cc0000", bevelLight: "#99ff66", bevelDark: "#336600", glow: "#66ff00" },
  sky: { ground: "#3399ff", a1: "#ffffff", a2: "#ccffff", a3: "#99ccff", band: "#000099", bandText: "#ffffff", plaque: "#000066", plaqueText: "#ffff00", title: "#ffffff", shadow: "#ff00cc", tint: "#ccffff", link: "#0000cc", visited: "#660099", hover: "#cc0000", bevelLight: "#99ccff", bevelDark: "#003399", glow: "#3366ff" },
  matrix: { ground: "#000000", a1: "#00ff00", a2: "#009900", a3: "#ccffcc", band: "#003300", bandText: "#00ff00", plaque: "#000000", plaqueText: "#00ff00", title: "#00ff00", shadow: "#006600", tint: "#ccffcc", link: "#006600", visited: "#003366", hover: "#990000", bevelLight: "#00cc00", bevelDark: "#003300", glow: "#00ff00" },
  bubblegum: { ground: "#ff66cc", a1: "#ffffff", a2: "#ff0099", a3: "#ffccff", band: "#660066", bandText: "#ffccff", plaque: "#330033", plaqueText: "#ff99ff", title: "#ffff99", shadow: "#ff0099", tint: "#ffccff", link: "#0000cc", visited: "#660066", hover: "#990033", bevelLight: "#ff99ff", bevelDark: "#990066", glow: "#ff66cc" },
  midnight: { ground: "#000066", a1: "#ffffff", a2: "#cc99ff", a3: "#ff9900", band: "#330066", bandText: "#ccccff", plaque: "#000033", plaqueText: "#ffcc00", title: "#ccffff", shadow: "#9933ff", tint: "#ccccff", link: "#000099", visited: "#660066", hover: "#990000", bevelLight: "#9999ff", bevelDark: "#000033", glow: "#9966ff" },
  construction: { ground: "#993300", a1: "#cc3300", a2: "#cccccc", a3: "#ffcc00", band: "#ffcc00", bandText: "#000000", plaque: "#000000", plaqueText: "#ffcc00", title: "#ffcc00", shadow: "#cc3300", tint: "#ffff99", link: "#0000cc", visited: "#660066", hover: "#cc0000", bevelLight: "#ffcc00", bevelDark: "#663300", glow: "#ff9900" },
  teal: { ground: "#006666", a1: "#00cccc", a2: "#66ffff", a3: "#ffffff", band: "#003333", bandText: "#ccffff", plaque: "#000000", plaqueText: "#66ffff", title: "#ffff66", shadow: "#009999", tint: "#99ffcc", link: "#0000cc", visited: "#660066", hover: "#990000", bevelLight: "#66cccc", bevelDark: "#003333", glow: "#00cccc" },
} as const satisfies Record<string, Palette>;

/** Body and heading fonts: only the 1990s core web fonts. */
export const FONT_SETS = {
  classic: { body: `"Times New Roman", Times, serif`, heading: `"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive` },
  comic: { body: `"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive`, heading: `"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive` },
  arial: { body: `Arial, Helvetica, sans-serif`, heading: `Impact, "Arial Black", Haettenschweiler, sans-serif` },
  courier: { body: `"Courier New", Courier, monospace`, heading: `"Courier New", Courier, monospace` },
  verdana: { body: `Verdana, Geneva, sans-serif`, heading: `"Arial Black", Gadget, sans-serif` },
  georgia: { body: `Georgia, "Times New Roman", serif`, heading: `"Times New Roman", Times, serif` },
} as const;

export const TILES = ["stars", "flames", "bricks", "clouds", "matrix", "slime", "checker", "web", "hearts", "planets"] as const;
export const HEADINGS = ["comic", "wordart", "rainbow", "outline", "blink"] as const;
export const DIVIDERS = ["flames", "skulls", "tape", "rainbow", "drips"] as const;
export const SPRITE_SETS = {
  spooky: ["skull", "bat"],
  construction: ["worker", "cone"],
  mail: ["mailbox", "envelope"],
  space: ["ufo", "alien"],
  web: ["globe", "computer"],
  love: ["heart", "cat"],
} as const;
export const BEVELS = ["ridge", "outset", "inset", "double"] as const;
export const BANNERS = [
  "Welcome to my homepage!!!",
  "Welcome to my Web Site!!",
  "You found my homepage!",
  "~*~ Welcome 2 my crib ~*~",
  "Enter if you dare!!!",
  "Welcome, fellow surfer!",
  "My Totally Kewl Homepage",
  "Welcome to the Haunted Zone!",
] as const;
/** The odometer: digit colour on cell colour. */
export const COUNTERS = {
  green: { digit: "#66ff99", cell: "#000000" },
  red: { digit: "#ff3300", cell: "#000000" },
  amber: { digit: "#ffcc00", cell: "#000000" },
  blue: { digit: "#ffffff", cell: "#000099" },
} as const;
export const TRAILS = ["stars", "sparkles", "bats", "hearts", "fire"] as const;
/**
 * The page's 1998 structure. `main` is the width the page's own body is held to; `left` and `right` are
 * the furniture columns beside it (a nav frame, Cool Links); `align` centres the table or keeps it left.
 * "full" (Classic Crypt only) leaves the page's width alone.
 */
export const LAYOUTS = {
  full: { main: 0, left: 0, right: 0, align: "center" },
  table640: { main: 640, left: 0, right: 0, align: "center" },
  table800: { main: 800, left: 0, right: 0, align: "center" },
  left760: { main: 760, left: 0, right: 0, align: "left" },
  nav2: { main: 620, left: 180, right: 0, align: "center" },
  rightlinks: { main: 620, left: 0, right: 180, align: "center" },
  links3: { main: 560, left: 170, right: 170, align: "center" },
} as const;
export const DENSITIES = ["sparse", "normal", "cluttered"] as const;
/** How the page's own sections are wrapped: bevelled cells, fieldset boxes with a legend, sprite bullets, or thick 3D picture frames. */
export const DRESSINGS = ["cells", "fieldset", "bullets", "frames"] as const;
/** A sprite before every h2 and h3. */
export const PREFIXES = ["none", "skull", "flame", "star"] as const;
/** The 1998 furniture the look puts round the page (the welcome banner is always there). */
export const FURNITURE = ["navbuttons", "construction", "coollinks", "awards", "guestbook", "updated", "whatsnew", "webring", "counter", "bestviewed", "tabbar"] as const;
export type Furniture = (typeof FURNITURE)[number];
/** How many pieces of furniture each density gets: [least, most]. */
export const FURNITURE_COUNT = { sparse: [2, 3], normal: [4, 6], cluttered: [7, 9] } as const;
/** The banded rainbow for headings: every stop dark enough to read on every palette's tint. */
export const RAINBOW = ["#990000", "#993300", "#006600", "#003399", "#0000cc", "#660099"] as const;

export type PaletteId = keyof typeof PALETTES;
export type Axes = {
  tile: (typeof TILES)[number];
  palette: PaletteId;
  fonts: keyof typeof FONT_SETS;
  heading: (typeof HEADINGS)[number];
  divider: (typeof DIVIDERS)[number];
  sprites: keyof typeof SPRITE_SETS;
  bevel: (typeof BEVELS)[number];
  banner: number;
  counter: keyof typeof COUNTERS;
  trail: (typeof TRAILS)[number];
  layout: keyof typeof LAYOUTS;
  density: (typeof DENSITIES)[number];
  dressing: (typeof DRESSINGS)[number];
  prefix: (typeof PREFIXES)[number];
};
export type Preset = Axes & { id: string; name: string; locked?: boolean };

const p = (id: string, name: string, a: Omit<Axes, "banner"> & { banner?: number }, locked?: boolean): Preset => ({ id, name, banner: 0, ...a, ...(locked ? { locked } : {}) });

/** The named sites. The order is part of the seed: a preset's place decides which sites wear it. */
export const PRESETS: readonly Preset[] = [
  p("construction-zone", "Under Construction Zone", { tile: "bricks", palette: "construction", fonts: "arial", heading: "wordart", divider: "tape", sprites: "construction", bevel: "outset", counter: "amber", trail: "sparkles", layout: "left760", density: "cluttered", dressing: "cells", prefix: "star", banner: 1 }),
  p("spiderweb-attic", "Spiderweb Attic", { tile: "web", palette: "midnight", fonts: "georgia", heading: "outline", divider: "skulls", sprites: "spooky", bevel: "ridge", counter: "green", trail: "bats", layout: "nav2", density: "normal", dressing: "fieldset", prefix: "skull", banner: 4 }),
  p("toxic-dump", "Toxic Waste Dump", { tile: "slime", palette: "toxic", fonts: "comic", heading: "blink", divider: "drips", sprites: "spooky", bevel: "inset", counter: "green", trail: "sparkles", layout: "table640", density: "normal", dressing: "bullets", prefix: "skull", banner: 7 }),
  p("bubblegum-club", "Bubblegum Heart Club", { tile: "hearts", palette: "bubblegum", fonts: "comic", heading: "rainbow", divider: "rainbow", sprites: "love", bevel: "outset", counter: "red", trail: "hearts", layout: "links3", density: "cluttered", dressing: "bullets", prefix: "star", banner: 3 }),
  p("classic-crypt", "Classic Crypt", { tile: "stars", palette: "crypt", fonts: "classic", heading: "comic", divider: "skulls", sprites: "spooky", bevel: "ridge", counter: "green", trail: "stars", layout: "full", density: "sparse", dressing: "frames", prefix: "none", banner: 0 }, true),
  p("ufo-crash", "UFO Crash Site", { tile: "planets", palette: "midnight", fonts: "verdana", heading: "outline", divider: "rainbow", sprites: "space", bevel: "double", counter: "blue", trail: "stars", layout: "rightlinks", density: "normal", dressing: "fieldset", prefix: "star", banner: 4 }),
  p("cyber-cafe", "Cyber Cafe 2000", { tile: "checker", palette: "teal", fonts: "verdana", heading: "wordart", divider: "rainbow", sprites: "web", bevel: "outset", counter: "blue", trail: "sparkles", layout: "links3", density: "cluttered", dressing: "cells", prefix: "none", banner: 5 }),
  p("haunted-dungeon", "Haunted Dungeon", { tile: "bricks", palette: "crypt", fonts: "georgia", heading: "outline", divider: "skulls", sprites: "spooky", bevel: "inset", counter: "red", trail: "bats", layout: "table800", density: "sparse", dressing: "frames", prefix: "skull", banner: 7 }),
  p("hellfire-bbs", "Hellfire BBS", { tile: "flames", palette: "inferno", fonts: "courier", heading: "blink", divider: "flames", sprites: "web", bevel: "double", counter: "red", trail: "fire", layout: "nav2", density: "cluttered", dressing: "cells", prefix: "flame", banner: 4 }),
  p("slime-lab", "Slime Time Lab", { tile: "slime", palette: "teal", fonts: "arial", heading: "wordart", divider: "drips", sprites: "space", bevel: "ridge", counter: "green", trail: "sparkles", layout: "rightlinks", density: "normal", dressing: "bullets", prefix: "none", banner: 6 }),
  p("sky-hangout", "Sky High Hangout", { tile: "clouds", palette: "sky", fonts: "verdana", heading: "wordart", divider: "rainbow", sprites: "mail", bevel: "outset", counter: "blue", trail: "sparkles", layout: "table640", density: "sparse", dressing: "frames", prefix: "star", banner: 5 }),
  p("love-shack", "Pixel Love Shack", { tile: "hearts", palette: "bubblegum", fonts: "georgia", heading: "outline", divider: "rainbow", sprites: "love", bevel: "double", counter: "red", trail: "hearts", layout: "nav2", density: "normal", dressing: "bullets", prefix: "star", banner: 2 }),
  p("checker-arcade", "Checkerboard Arcade", { tile: "checker", palette: "construction", fonts: "arial", heading: "wordart", divider: "tape", sprites: "web", bevel: "outset", counter: "amber", trail: "stars", layout: "links3", density: "cluttered", dressing: "cells", prefix: "star", banner: 6 }),
  p("space-outpost", "Deep Space Outpost", { tile: "planets", palette: "midnight", fonts: "courier", heading: "blink", divider: "rainbow", sprites: "space", bevel: "inset", counter: "green", trail: "stars", layout: "table800", density: "normal", dressing: "fieldset", prefix: "star", banner: 2 }),
  p("cloud-angel", "Cloud Angel Page", { tile: "clouds", palette: "sky", fonts: "comic", heading: "rainbow", divider: "rainbow", sprites: "love", bevel: "ridge", counter: "blue", trail: "sparkles", layout: "rightlinks", density: "normal", dressing: "fieldset", prefix: "star", banner: 0 }),
  p("neon-webmaster", "Neon Webmaster Den", { tile: "web", palette: "toxic", fonts: "verdana", heading: "outline", divider: "drips", sprites: "web", bevel: "double", counter: "green", trail: "sparkles", layout: "left760", density: "normal", dressing: "cells", prefix: "none", banner: 1 }),
  p("matrix-den", "Matrix Hacker Den", { tile: "matrix", palette: "matrix", fonts: "courier", heading: "outline", divider: "skulls", sprites: "web", bevel: "inset", counter: "green", trail: "stars", layout: "links3", density: "cluttered", dressing: "cells", prefix: "skull", banner: 4 }),
  p("bat-cave", "Midnight Bat Cave", { tile: "stars", palette: "midnight", fonts: "comic", heading: "wordart", divider: "skulls", sprites: "spooky", bevel: "ridge", counter: "red", trail: "bats", layout: "nav2", density: "normal", dressing: "frames", prefix: "skull", banner: 7 }),
  p("email-corner", "E-Mail Me Corner", { tile: "checker", palette: "sky", fonts: "comic", heading: "blink", divider: "rainbow", sprites: "mail", bevel: "outset", counter: "blue", trail: "hearts", layout: "table640", density: "normal", dressing: "bullets", prefix: "none", banner: 2 }),
  p("lava-lounge", "Lava Lamp Lounge", { tile: "slime", palette: "inferno", fonts: "georgia", heading: "wordart", divider: "drips", sprites: "love", bevel: "double", counter: "amber", trail: "fire", layout: "rightlinks", density: "normal", dressing: "fieldset", prefix: "flame", banner: 6 }),
  p("flame-skull", "Flame Skull Shrine", { tile: "flames", palette: "inferno", fonts: "arial", heading: "wordart", divider: "flames", sprites: "spooky", bevel: "outset", counter: "red", trail: "fire", layout: "nav2", density: "cluttered", dressing: "cells", prefix: "flame", banner: 4 }),
  p("robot-lab", "Retro Robot Lab", { tile: "checker", palette: "midnight", fonts: "courier", heading: "outline", divider: "tape", sprites: "web", bevel: "inset", counter: "amber", trail: "sparkles", layout: "table800", density: "normal", dressing: "cells", prefix: "none", banner: 1 }),
];

/** What the seed may swap; a locked preset keeps its page look and only changes its trimmings. */
const VARY = ["palette", "divider", "sprites", "bevel", "heading", "banner", "counter", "trail", "layout", "density", "dressing", "prefix"] as const;
const VARY_LOCKED = ["divider", "sprites", "banner", "counter", "trail"] as const;
type VaryAxis = (typeof VARY)[number];

const OPTIONS: { [K in VaryAxis]: readonly Axes[K][] } = {
  palette: Object.keys(PALETTES) as PaletteId[],
  divider: DIVIDERS,
  sprites: Object.keys(SPRITE_SETS) as (keyof typeof SPRITE_SETS)[],
  bevel: BEVELS,
  heading: HEADINGS,
  banner: BANNERS.map((_, i) => i),
  counter: Object.keys(COUNTERS) as (keyof typeof COUNTERS)[],
  trail: TRAILS,
  layout: (Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]).filter((l) => l !== "full"),
  density: DENSITIES,
  dressing: DRESSINGS,
  prefix: PREFIXES,
};

const lum = (hex: string) => relativeLuminance(hex);

/** The combinations that clash. Each rule names itself when it blocks a look. */
export const CLASH_RULES: readonly { name: string; blocks: (a: Axes) => boolean }[] = [
  { name: "flames and matrix need a near-black ground", blocks: (a) => (a.tile === "flames" || a.tile === "matrix") && lum(PALETTES[a.palette].ground) >= 0.05 },
  { name: "clouds need a sky-light ground", blocks: (a) => a.tile === "clouds" && lum(PALETTES[a.palette].ground) < 0.15 },
  { name: "rainbow headings need every stop at 4.5:1 on the tint", blocks: (a) => a.heading === "rainbow" && RAINBOW.some((c) => contrastRatio(c, PALETTES[a.palette].tint) < 4.5) },
  { name: "no pink checkerboard", blocks: (a) => a.tile === "checker" && a.palette === "bubblegum" },
  { name: "the matrix tile is only green", blocks: (a) => a.tile === "matrix" && a.palette !== "matrix" },
  { name: "a sparse site is one plain table", blocks: (a) => a.density === "sparse" && (LAYOUTS[a.layout].left > 0 || LAYOUTS[a.layout].right > 0) },
  { name: "three columns are only for a cluttered site", blocks: (a) => a.layout === "links3" && a.density !== "cluttered" },
];

export const clashes = (a: Axes) => CLASH_RULES.filter((r) => r.blocks(a)).map((r) => r.name);

export type Look = Axes & { site: string; preset: string; name: string; varied: VaryAxis[]; furniture: Furniture[] };

/** `n` distinct pieces of furniture in a seeded order. */
function pickFurniture(rnd: () => number, density: Axes["density"]): Furniture[] {
  const [lo, hi] = FURNITURE_COUNT[density];
  const n = lo + Math.floor(rnd() * (hi - lo + 1));
  const pool = [...FURNITURE];
  return Array.from({ length: n }, () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
}

/**
 * The look for `hostname`: the same for every page of the site, www or not. `force` (a preset id, the
 * e2e build's ?hgtheme=) shows that preset as designed, nothing varied.
 */
export function pickLook(hostname: string, force?: string | null): Look {
  const site = seedKey(hostname);
  const rnd = mulberry32(fnv1a(site));
  const drawn = pick(rnd, PRESETS);
  const forced = PRESETS.find((x) => x.id === force);
  const { id, name, locked, ...axes } = forced ?? drawn;
  const look: Axes = { ...axes };
  // A forced preset (visual baselines) is shown as designed, with nothing varied.
  if (forced) return { ...look, site, preset: id, name, varied: [], furniture: locked ? [] : pickFurniture(mulberry32(fnv1a(id)), look.density) };
  const pool: VaryAxis[] = [...(locked ? VARY_LOCKED : VARY)];
  const n = 2 + Math.floor(rnd() * 2);
  const varied: VaryAxis[] = [];
  for (let i = 0; i < n; i++) {
    const axis = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    const fits = (OPTIONS[axis] as readonly unknown[]).filter((v) => v !== look[axis] && !clashes({ ...look, [axis]: v } as Axes).length);
    if (!fits.length) continue;
    (look as Record<string, unknown>)[axis] = pick(rnd, fits);
    varied.push(axis);
  }
  // Classic Crypt keeps the page's own structure: no furniture beyond the banner.
  return { ...look, site, preset: id, name, varied, furniture: locked ? [] : pickFurniture(rnd, look.density) };
}

/** Every axis of a look in one string: two sites with the same signature look the same. */
export const lookSignature = (l: Axes & { preset: string; furniture?: readonly string[] }) =>
  [l.preset, l.tile, l.palette, l.fonts, l.heading, l.divider, l.sprites, l.bevel, l.banner, l.counter, l.trail, l.layout, l.density, l.dressing, l.prefix, (l.furniture ?? []).join(",")].join("|");
