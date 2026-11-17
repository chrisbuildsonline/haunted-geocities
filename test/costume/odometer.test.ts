// The HUD odometer says what it counts: "Souls counted", tracker requests blocked or seen.
import { expect, test } from "bun:test";
import { buildHud, setOdometer } from "../../src/content/costume/hud";
import { contrastRatio } from "../../src/content/costume/page-theme";
import { costumeCss } from "../../src/content/costume/styles";
import { LAYOUT, PALETTE } from "../../src/content/costume/tokens";
import { setup } from "./helpers";

const SUB = "tracker requests blocked or seen";
const css = costumeCss({ stars: "a", twinkle: "b" });
const rule = (src: string, sel: string) => src.match(new RegExp(`(?:^|\\n|\\}\\s*)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

function hud() {
  const { doc } = setup();
  return buildHud(doc);
}

test("label reads 'Souls counted' with the sub-label", () => {
  const h = hud();
  const hits = h.querySelector(".hits")!;
  expect(hits.querySelector(".label")!.textContent).toBe("Souls counted");
  expect(hits.querySelector(".sub")!.textContent).toBe(SUB);
  // the sub-label sits under the label, and both stay decorative: the accessible name is the aria-label
  expect(hits.querySelector(".hits-label")!.contains(hits.querySelector(".sub"))).toBe(true);
  expect(hits.querySelector(".hits-label")!.getAttribute("aria-hidden")).toBe("true");
  expect(hits.getAttribute("role")).toBe("img");
});

test("title and aria-label say tracker requests blocked or seen", () => {
  const hits = hud().querySelector(".hits")!;
  expect(hits.getAttribute("title")).toBe(SUB);
  expect(hits.getAttribute("aria-label")).toBe(`Souls counted: 000000, ${SUB}`);
});

test("aria-label keeps the six digits", () => {
  const h = hud();
  setOdometer(h, 1234);
  expect(h.querySelector(".hits")!.getAttribute("aria-label")).toBe(`Souls counted: 001234, ${SUB}`);
  setOdometer(h, 7);
  expect(h.querySelector(".hits")!.getAttribute("aria-label")).toBe(`Souls counted: 000007, ${SUB}`);
});

test("HUD stays within two rows at 375px with the new label", () => {
  // Below 400px the sub-label is visually hidden (still in the title and the aria-label), so row 2
  // holds the one-line label, the odometer and the web ring as before.
  const narrow = css.slice(css.indexOf("@media (max-width: 400px)"));
  expect(rule(narrow, ".hits .sub")).toMatch(/position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\)/);
  expect(rule(narrow, ".hits")).toContain("margin-left: 0");
  // above it, the label column stacks the two lines and the HUD may not wrap
  expect(rule(css, ".hits-label")).toContain("flex-direction: column");
  expect(rule(css, "#hud")).toContain("flex-wrap: nowrap");
});

test("sub-label contrast is at least 4.5:1 and at least 12px", () => {
  const sub = rule(css, ".hits .sub");
  const px = Number(sub.match(/font-size:\s*(\d+)px/)?.[1] ?? rule(css, ".hits").match(/font-size:\s*(\d+)px/)?.[1]);
  expect(px).toBeGreaterThanOrEqual(LAYOUT.minText);
  const colour = sub.match(/color:\s*(#[0-9a-f]{6})/)?.[1] ?? PALETTE.bone;
  expect(contrastRatio(colour, PALETTE.crypt)).toBeGreaterThanOrEqual(4.5);
});
