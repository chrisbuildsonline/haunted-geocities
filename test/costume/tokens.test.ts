import { expect, test } from "bun:test";
import { LAYOUT, MOTION, PAGE, PALETTE, SPRITES } from "../../src/content/costume/tokens";
import { designTokens } from "./helpers";

const webSafe = (h: string) => /^#(?:00|33|66|99|cc|ff){3}$/.test(h);

test("page tokens are web-safe", () => {
  const colours = Object.values(PAGE);
  expect(colours.length).toBe(11);
  expect(colours.filter((c) => !webSafe(c))).toEqual([]);
});

test("page tokens match DESIGN.md costume.page", () => {
  const t = designTokens();
  expect(PAGE).toEqual(t.costume.page);
  expect(LAYOUT).toEqual(t.costume.layout);
  expect(LAYOUT).toMatchObject({ frameBevel: 6, edgeFrame: 12, edgeDither: 4, darkLuminance: 0.4, minContrast: 4.5 });
});

test("phosphor is web-safe #ccffff", () => {
  expect(PALETTE.phosphor).toBe("#ccffff");
  expect(webSafe(PALETTE.phosphor)).toBe(true);
  expect(designTokens().costume.palette.phosphor).toBe("#ccffff");
});

test("hero haunt motion values match DESIGN.md", () => {
  expect(MOTION.haunt).toBe(3000);
  expect(MOTION.hero).toEqual(designTokens().motion.hero);
  expect(MOTION.hero).toMatchObject({ scanIn: 150, lidsClose: [150, 450], line: [450, 600], lidsOpen: [600, 800], wipeStart: 700, fxOut: [1600, 1900] });
  expect(MOTION.hero).toMatchObject({ riseStart: 1700, riseStagger: 250, riseMs: 400, risePx: 48, tagDelay: 200, tagMs: 200 });
  expect(MOTION.hero).toMatchObject({ hud: 1900, odometer: [2200, 2800], vampires: 2300, markers: 2800 });
  expect(MOTION.hero).toMatchObject({ roll: [800, 1400], paradeStart: 800, paradeStagger: 100, paradeMs: 1600, paradePhoneStagger: 160, paradePhoneMs: 1000 });
  expect(MOTION.hero).toMatchObject({ captionStart: 1500, captionPhoneStart: 1760 });
});

test("the parade ghosts are drawn at 2x and 3x the lane ghost (the lane ghost's size and 2/3 of it on a phone), and match DESIGN.md", () => {
  expect(SPRITES).toEqual(designTokens().costume.sprites);
  expect(SPRITES).toMatchObject({ paradeGhost: [144, 144], paradeGhostFar: [96, 96], paradeGhostPhone: [48, 48], paradeGhostPhoneFar: [32, 32] });
});

test("graveyardGap is 4 and matches DESIGN.md", () => {
  expect(LAYOUT.graveyardGap).toBe(4);
  expect(designTokens().costume.layout.graveyardGap).toBe(4);
});
