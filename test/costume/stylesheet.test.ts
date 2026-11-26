// The graveyard strip's CSS: the HUD's frame, its layer, its pointer box and its focus ring.
import { expect, test } from "bun:test";
import { costumeCss } from "../../src/content/costume/styles";
import { HARD_SHADOW, LAYOUT, PALETTE as P } from "../../src/content/costume/tokens";

const css = costumeCss({ stars: "a", twinkle: "b" });
const block = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("the footer is in flow and takes pointer events; cards stay above the fixed layers", () => {
  const z = (id: string) => Number(block(`#${id}`).match(/z-index:\s*(\d+)/)?.[1]);
  expect(z("cards")).toBe(6);
  expect([z("lanes"), z("markers"), z("top-bands")].every((n) => n < z("cards"))).toBe(true);
  // the footer box (graveyard and HUD inside it) takes pointer events; the fixed root does not, and Hide turns them off
  expect(block("#crypt-footer")).toContain("pointer-events: auto");
  expect(block("#crypt-footer")).toContain("position: relative");
  expect(block("#crypt-root")).toContain("pointer-events: none");
  expect(css).toMatch(/\.costume-hidden > :not\(#show-tab\), #crypt-footer\.costume-hidden\s*\{[^}]*pointer-events: none !important/);
});

test("graveyard has HUD bevel, 1px line, hard shadow and focus ring", () => {
  const g = block("#graveyard");
  for (const d of [
    "position: relative", `background-color: ${P.crypt}`, `border: 1px solid ${P.ink}`,
    `box-shadow: inset 2px 2px 0 ${P.hudBevelLight}, inset -2px -2px 0 ${P.bevelDark}, ${HARD_SHADOW}`,
  ]) {
    expect({ d, ok: g.includes(d) }).toEqual({ d, ok: true });
  }
  expect(g).not.toMatch(/position: fixed|bottom:/);
  expect(block("#crypt-footer > *")).toContain(`max-width: ${LAYOUT.hudMaxWidth}px`);
  expect(g).not.toMatch(/border-radius|blur/);
  const bar = block("#graveyard .gy-bar");
  expect(bar).toContain(`color: ${P.bone}`);
  expect(bar).toMatch(/font: 13px\/20px "Comic Sans MS"/);
  expect(block("#graveyard .gy-empty")).toMatch(/font: 13px[^;]*"Comic Sans MS"/);
  // the sprites keep the costume focus ring
  expect(css).toMatch(/\.ghost:focus-visible\s*\{\s*outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000;/);
  expect(css).toMatch(/\.vampire:focus-visible\s*\{\s*outline: 2px dotted #ffff66/);
});

test("a docked sprite wears its name tag: as wide as the tag, never squeezed, the row one sprite and one tag tall", () => {
  expect(block("#graveyard .tag")).not.toContain("display: none");
  const stone = block("#graveyard .ghost, #graveyard .vampire");
  for (const d of ["flex: 0 0 auto", "width: auto", "min-width: 48px", "height: auto"]) expect({ d, ok: stone.includes(d) }).toEqual({ d, ok: true });
  expect(block("#graveyard .stones")).toContain("gap: 16px");
  expect(block("#graveyard .stones")).toContain("align-items: flex-end");
});

/** Every px font size the sheet sets, from `font:` shorthands and `font-size:`. */
const fontSizes = (sheet: string) =>
  [...sheet.matchAll(/font(?:-size)?:\s*(?:bold\s+|italic\s+)*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

test("no costume text under 12px", () => {
  expect(LAYOUT.minText).toBe(12);
  const sizes = fontSizes(css);
  expect(sizes.length).toBeGreaterThan(20);
  expect(sizes.filter((px) => px < LAYOUT.minText)).toEqual([]);
});

test("card close buttons are 24px hit targets in a 28px title bar", () => {
  expect(block(".card .bar")).toContain("height: 28px");
  expect(block(".card .close")).toMatch(/width: 24px; height: 24px;/);
  expect(block(".card .close")).toMatch(/font: bold 13px/);
});

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test("secondary costume labels are bright: #ccccff on the crypt, 12:1 or more", () => {
  for (const sel of [".hits .sub", ".honest", ".foot", ".exorcised .tag"]) {
    expect({ sel, colour: block(sel).match(/color: (#[0-9a-f]{6})/)?.[1] }).toEqual({ sel, colour: P.bevelLight });
  }
  expect(contrast(P.bevelLight, P.crypt)).toBeGreaterThanOrEqual(12);
  expect(css).not.toMatch(/(?<![\w-])color: #9999cc/); // text; the scrollbar thumb may keep it
});
