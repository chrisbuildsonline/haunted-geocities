import { describe, expect, test } from "bun:test";
import { BADGE_SKULL, BADGE_SKULL_LEGEND, curseBadgeSvg } from "../../src/content/costume/art";
import { costumeCss } from "../../src/content/costume/styles";
import { PALETTE as P } from "../../src/content/costume/tokens";

const css = costumeCss({ stars: "", twinkle: "" });
const WEB_SAFE = /^#([03369cf]{2}){3}$/i;
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("badge art and CSS (req 40, 45, 59)", () => {
  test("BADGE_SKULL is 6x6 with web-safe colours", () => {
    expect(BADGE_SKULL).toHaveLength(6);
    for (const row of BADGE_SKULL) expect(row).toHaveLength(6);
    for (const c of Object.values(BADGE_SKULL_LEGEND)) expect(c).toMatch(WEB_SAFE);
    expect(BADGE_SKULL_LEGEND).toEqual({ W: P.ghostWhite, k: P.ink });
  });
  test("curseBadgeSvg is 12x12 with pixelated crisp edges", () => {
    const svg = curseBadgeSvg();
    expect(svg).toContain('width="12" height="12" viewBox="0 0 12 12"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });
  test("CSS: 18px badge, #ff9900 ground, black 1px border, 2px hard shadow, bold 11px Comic Sans", () => {
    expect(css).toMatch(/\.curse-badge \{[^}]*position: absolute;[^}]*height: 18px;[^}]*background: #ff9900;[^}]*color: #000000;[^}]*border: 1px solid #000000;[^}]*box-shadow: 2px 2px 0 #000000;[^}]*font: bold 11px\/16px "Comic Sans MS"/);
    expect(css).toMatch(/\.curse-badge \{[^}]*pointer-events: auto;/);
    expect(css).toMatch(/\.curse-badge svg \{[^}]*image-rendering: pixelated;/);
    expect(css).toMatch(/\.curse-card \.quote \{[^}]*overflow-wrap: anywhere;/);
  });
  test("CSS: focus ring is the costume ring", () => {
    expect(css).toMatch(/\.curse-badge:focus-visible \{ outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 2px 2px 0 #000000, 0 0 0 5px #000000;/);
  });
  test("badge text contrast is at least 4.5:1", () => {
    expect(contrast(P.ink, P.curse)).toBeGreaterThanOrEqual(4.5);
  });
  test("badge text meets 4.5:1 against its ground", () => {
    expect(contrast("#000000", "#ff9900")).toBeGreaterThanOrEqual(4.5);
  });
});
