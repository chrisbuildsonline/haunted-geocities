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
} as const;

export const HEM_TINTS = ["#ff99cc", "#99ccff", "#ccff99", "#ffcc99", "#cc99ff", "#99ffcc"] as const;

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
  minText: 11,
} as const;

export const HARD_SHADOW = "4px 4px 0 #000000";
export const FOCUS_RING = "2px dotted #ffff66, halo 0 0 0 5px #000000";

export const MOTION = {
  fast: 120,
  base: 200,
  slow: 300,
  haunt: 2500,
  unhaunt: 1100,
  reducedHaunt: 300,
  reducedUnhaunt: 200,
  easeOut: "cubic-bezier(.2,.8,.2,1)",
  easeInOut: "cubic-bezier(.45,0,.2,1)",
  ghostBob: { px: 4, ms: 4000 },
  ghostSway: { px: 6, ms: 7000 },
  marqueePxPerSec: 60,
  twinkleMs: 2000,
} as const;
