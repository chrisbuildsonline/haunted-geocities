// The jury read the ghost name tags and the findings line ("Trackers 3 / Vampires 2") as tiny and dim on
// the dark crypt, and saw the marquee cut off at the viewport edge (design/DESIGN.md "Ghosts", "Findings
// strip", "Top bands"). A tag is a lit 14px plaque in its ghost's hem tint that stands off the crypt;
// the findings line is 14px; the marquee dissolves into the band before it reaches either edge.
import { describe, expect, test } from "bun:test";
import { makeSprite, spriteFor, spritesByKey } from "../../src/content/costume/ghosts";
import { costumeCss } from "../../src/content/costume/styles";
import { HEM_TINTS, PALETTE as P } from "../../src/content/costume/tokens";
import type { CompanyHit } from "../../src/data/types";
import { setup } from "./helpers";

const css = costumeCss({ stars: "s", twinkle: "t" });
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const px = (decls: string) => Number(decls.match(/font:\s*(?:bold\s+)?(\d+)px/)?.[1] ?? NaN);

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const hit = (company: string, vampire?: CompanyHit["vampire"]): CompanyHit => ({
  company, count: 1, domains: [`${company.toLowerCase()}.com`], categories: ["Advertising"], fingerprinting: 0, ...(vampire ? { vampire } : {}),
});
const opts = { exorcised: new Set<string>(), onOpen() {}, rise: false };

describe("ghost name tags", () => {
  test("14px crypt ink on the ghost's hem tint (bone for a vampire), with a black edge", () => {
    const tag = rule(".tag, .stack");
    expect(px(tag)).toBeGreaterThanOrEqual(14);
    expect(tag).toContain(`background: var(--tint, ${P.bone})`);
    expect(tag).toContain(`color: ${P.crypt}`);
    expect(tag).toContain(`border: 1px solid ${P.ink}`);
    // one line in a lane still fits the 72px slot: 48px sprite + 4px gap + 16px line + 2px padding + 2px edge
    expect(tag).toMatch(/font: 14px\/16px/);
    expect(tag).toMatch(/padding: 1px 4px/);
  });

  test("every tag ground holds its ink at 4.5:1 and stands off the dark crypt by 4.5:1 too", () => {
    for (const ground of [...HEM_TINTS, P.bone]) {
      expect({ ground, ink: contrast(P.crypt, ground) >= 4.5 }).toEqual({ ground, ink: true });
      expect({ ground, offCrypt: contrast(ground, P.crypt) >= 4.5 }).toEqual({ ground, offCrypt: true });
    }
  });

  test("an exorcised tag goes dark: #ccccff on the crypt (13:1)", () => {
    const ex = rule(".exorcised .tag");
    expect(ex).toContain(`background: ${P.crypt}`);
    expect(ex).toContain(`color: ${P.bevelLight}`);
    expect(contrast(P.bevelLight, P.crypt)).toBeGreaterThanOrEqual(4.5);
  });

  test("a ghost carries its hem tint as --tint for its tag; a vampire has none; a redraw moves it", () => {
    const { doc } = setup();
    const ghost = makeSprite(doc, hit("Criteo"), HEM_TINTS[2], opts);
    expect(ghost.style.getPropertyValue("--tint")).toBe(HEM_TINTS[2]);
    const vampire = makeSprite(doc, hit("Hotjar", { caught: [], knownOnly: true } as unknown as CompanyHit["vampire"]), undefined, opts);
    expect(vampire.style.getPropertyValue("--tint")).toBe("");
    const row = doc.createElement("div");
    row.append(ghost);
    const again = spriteFor(doc, spritesByKey(row), hit("Criteo"), HEM_TINTS[4], opts);
    expect(again).toBe(ghost);
    expect(again.style.getPropertyValue("--tint")).toBe(HEM_TINTS[4]);
  });
});

describe("findings line", () => {
  test("14px bone on the crypt, still one 24px line", () => {
    const f = rule("#findings");
    expect(px(f)).toBeGreaterThanOrEqual(14);
    expect(f).toMatch(/height: 24px/);
    expect(f).toContain(`color: ${P.bone}`);
    expect(contrast(P.bone, P.crypt)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("marquee edges", () => {
  test("the line fades into the band at both ends: 8px of solid crypt at the edge, then an 8px dither, above the line", () => {
    expect(rule("#marquee")).toContain("position: relative");
    const caps = rule("#marquee::before, #marquee::after");
    for (const d of ["position: absolute", "top: 0", "bottom: 0", "width: 8px", "z-index: 1", `border: 0 solid ${P.crypt}`]) {
      expect({ d, ok: caps.includes(d) }).toEqual({ d, ok: true });
    }
    expect(caps).toMatch(/background: url\("data:image\/svg\+xml/);
    expect(rule("#marquee::before")).toContain("left: 0; border-left-width: 8px");
    expect(rule("#marquee::after")).toContain("right: 0; border-right-width: 8px");
    // the still line (reduced motion) starts flush left on its own 8px plaque edge: no caps over it
    expect(css).toMatch(/\.reduced-motion #marquee::before, \.reduced-motion #marquee::after \{ display: none; \}/);
  });
});
