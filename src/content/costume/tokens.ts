// The costume half of the `## Tokens` JSON in design/DESIGN.md (test/costume.test.ts keeps
// them equal). Every colour the costume draws comes from PALETTE or HEM_TINTS.

export const PALETTE = {
  crypt: "#000033",
  cryptViolet: "#330066",
  spectral: "#6633cc",
  ectoplasm: "#66ff99",
  ghostWhite: "#ffffff",
  ghostShade: "#ccffff",
  vampireGlow: "#ff0033",
  vampireLining: "#660000",
  bone: "#ffffcc",
  star: "#ffff66",
  stone: "#cccccc",
  stoneShadow: "#666666",
  moss: "#336633",
  curse: "#ff9900",
  ink: "#000000",
  bevelLight: "#ccccff",
  bevelDark: "#333366",
  hudBevelLight: "#9999cc",
  phosphor: "#ccffff",
} as const;

/** The content column restyle (page sheet): link colours, the parchment tint and the guestbook frame. */
export const PAGE = {
  link: "#0000ff",
  visited: "#990099",
  hover: "#ff0000",
  hoverFallback: "#cc0000",
  darkLink: "#66ccff",
  darkVisited: "#cc99ff",
  parchment: "#ffffcc",
  frameLight: "#9999cc",
  frameDark: "#333366",
  frameLine: "#000000",
  glow: "#6633cc",
} as const;

export const HEM_TINTS =["#ff99cc", "#99ccff", "#ccff99", "#ffcc99", "#cc99ff", "#99ffcc"] as const;

export const FONTS = ["Comic Sans MS", "Times New Roman"] as const;

export const PIXEL = { spriteScale: 3, iconScale: 2 } as const;

export const SPRITES = {
  ghost: [48, 48],
  vampire: [48, 54],
  webmasterGhost: [96, 96],
  tombstoneMarker: [16, 20],
  badgeIcon: [12, 12],
  hudIcon: [16, 16],
} as const;

export const LAYOUT = {
  laneWidth: 64,
  slotPitch: 72,
  neighborhoodBar: 24,
  marquee: 24,
  hudMinHeight: 40,
  hudMaxWidth: 720,
  hudWrapBelow: 400,
  cardWidth: 248,
  tombstoneWidth: 176,
  starTile: 64,
  minText: 12,
  frameBevel: 6,
  frameGap: 4,
  edgeFrame: 12,
  edgeDither: 4,
  darkLuminance: 0.4,
  minContrast: 4.5,
  graveyardGap: 4,
} as const;

export const HARD_SHADOW = "4px 4px 0 #000000";
export const FOCUS_RING = "2px dotted #ffff66, halo 0 0 0 5px #000000";

export const MOTION = {
  fast: 120,
  base: 200,
  slow: 300,
  haunt: 3000,
  unhaunt: 1100,
  reducedHaunt: 300,
  reducedUnhaunt: 200,
  easeOut: "cubic-bezier(.2,.8,.2,1)",
  easeInOut: "cubic-bezier(.45,0,.2,1)",
  ghostBob: { px: 4, ms: 4000 },
  ghostSway: { px: 6, ms: 7000 },
  marqueePxPerSec: 60,
  twinkleMs: 2000,
  /** The hero haunt moment (ms, [start, end] pairs): CRT death, wipe, ghosts rising with name tags. */
  hero: {
    scanIn: 150,
    lidsClose: [150, 450],
    line: [450, 600],
    lidsOpen: [600, 800],
    wipeStart: 700,
    fxOut: [1600, 1900],
    riseStart: 1700,
    riseStagger: 250,
    riseMs: 400,
    risePx: 48,
    tagDelay: 200,
    tagMs: 200,
    hud: 1900,
    odometer: [2200, 2800],
    vampires: 2300,
    markers: 2800,
  },
} as const;
