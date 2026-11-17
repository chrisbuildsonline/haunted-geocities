// The graveyard strip's CSS: the HUD's frame, its layer, its pointer box and its focus ring.
import { expect, test } from "bun:test";
import { costumeCss } from "../../src/content/costume/styles";
import { HARD_SHADOW, LAYOUT, PALETTE as P } from "../../src/content/costume/tokens";

const css = costumeCss({ stars: "a", twinkle: "b" });
const block = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("graveyard z-index is 5, cards 6", () => {
  const z = (id: string) => Number(block(`#${id}`).match(/z-index:\s*(\d+)/)?.[1]);
  expect(z("graveyard")).toBe(5);
  expect(z("hud")).toBe(5);
  expect(z("cards")).toBe(6);
  expect([z("lanes"), z("markers"), z("top-bands")].every((n) => n < z("graveyard"))).toBe(true);
  // its own box takes pointer events; the root around it does not, and Hide turns them off
  expect(block("#graveyard")).toContain("pointer-events: auto");
  expect(block("#crypt-root")).toContain("pointer-events: none");
  expect(css).toMatch(/\.costume-hidden > :not\(#show-tab\)\s*\{[^}]*pointer-events: none !important/);
});

test("graveyard has HUD bevel, 1px line, hard shadow and focus ring", () => {
  const g = block("#graveyard");
  for (const d of [
    "position: fixed", "left: 8px", "right: 8px", `max-width: ${LAYOUT.hudMaxWidth}px`, "margin: 0 auto", `background-color: ${P.crypt}`, `border: 1px solid ${P.ink}`,
    `box-shadow: inset 2px 2px 0 ${P.hudBevelLight}, inset -2px -2px 0 ${P.bevelDark}, ${HARD_SHADOW}`,
  ]) {
    expect({ d, ok: g.includes(d) }).toEqual({ d, ok: true });
  }
  expect(g).toContain(`+ ${LAYOUT.graveyardGap}px)`);
  expect(g).not.toMatch(/border-radius|blur/);
  const bar = block("#graveyard .gy-bar");
  expect(bar).toContain(`color: ${P.bone}`);
  expect(bar).toMatch(/font: 11px\/16px "Comic Sans MS"/);
  expect(block("#graveyard .gy-empty")).toMatch(/font: 13px[^;]*"Comic Sans MS"/);
  // the sprites keep the costume focus ring
  expect(css).toMatch(/\.ghost:focus-visible\s*\{\s*outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000;/);
  expect(css).toMatch(/\.vampire:focus-visible\s*\{\s*outline: 2px dotted #ffff66/);
  // no name tag under a docked sprite: the row is one sprite tall
  expect(block("#graveyard .tag")).toContain("display: none");
});
