import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const path = join(import.meta.dir, "..", "design", "DESIGN.md");
// read lazily so a missing file fails each test with a clear message instead of crashing the file at import
const doc = () => {
  if (!existsSync(path)) throw new Error("design/DESIGN.md is missing");
  return readFileSync(path, "utf8");
};
// text under the first "## <name>..." heading, up to the next "## " heading
const section = (name: string) => {
  const parts = doc().split(/^## /m).slice(1);
  const hit = parts.find((p) => p.toLowerCase().startsWith(name.toLowerCase()));
  if (hit === undefined) throw new Error(`design/DESIGN.md has no "## ${name}" section`);
  return hit;
};

const HEX = /^#[0-9a-f]{6}$/i;
const SAFE = new Set(["00", "33", "66", "99", "cc", "ff"]);
const webSafe = (h: string) => HEX.test(h) && [1, 3, 5].every((i) => SAFE.has(h.slice(i, i + 2).toLowerCase()));
const luminance = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

type Tokens = {
  costume: { palette: Record<string, string>; fonts: string[] };
  popup: {
    canvas: string; surface: string; ink: string; muted: string; accent: string;
    pill: string; pillInk: string; radius: number; typeScale: number[];
  };
};
const jsonBlocks = () => [...section("Tokens").matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]!);
const tokens = (): Tokens => JSON.parse(jsonBlocks()[0] ?? "null");

describe("design/DESIGN.md", () => {
  test("exists", () => expect(existsSync(path)).toBe(true));
  for (const h of ["Costume", "Popup", "Haunt moment", "Motion", "Tokens"]) {
    test(`has a "## ${h}" section`, () => expect(section(h)).toBeString());
  }
  test("has no TODO or TBD", () => expect(doc()).not.toMatch(/TODO|TBD/));
});

describe("section vocabulary", () => {
  const words: Record<string, string[]> = {
    Costume: ["overlay", "HUD", "starfield", "marquee", "ghost", "vampire", "tombstone", "badge", "neighborhood"],
    Popup: ["canvas", "surface", "radius", "shadow", "type scale", "accent", "pill"],
    "Haunt moment": ["prefers-reduced-motion"],
  };
  for (const [s, ws] of Object.entries(words)) {
    for (const w of ws) {
      test(`${s} mentions "${w}"`, () => expect(section(s).toLowerCase()).toContain(w.toLowerCase()));
    }
  }
  test("Haunt moment states a duration in ms", () => expect(section("Haunt moment")).toMatch(/\d+\s?ms/));
});

describe("tokens", () => {
  test("Tokens has exactly one json block that parses", () => {
    expect(jsonBlocks()).toHaveLength(1);
    expect(() => tokens()).not.toThrow();
  });
  test("costume palette has at least 6 web-safe colours", () => {
    const p = tokens().costume.palette;
    expect(Object.keys(p).length).toBeGreaterThanOrEqual(6);
    for (const [k, v] of Object.entries(p)) expect({ [k]: webSafe(v) }).toEqual({ [k]: true });
  });
  test('costume fonts include "Comic Sans MS" or "Times New Roman"', () => {
    const f = tokens().costume.fonts;
    expect(f.includes("Comic Sans MS") || f.includes("Times New Roman")).toBe(true);
  });
  test("popup colours are 6-digit hex", () => {
    const p = tokens().popup;
    for (const k of ["canvas", "surface", "ink", "muted", "accent", "pill", "pillInk"] as const) {
      expect({ [k]: p[k] }).toEqual({ [k]: expect.stringMatching(HEX) });
    }
  });
  test("popup radius is 16-20", () => {
    const r = tokens().popup.radius;
    expect(r).toBeGreaterThanOrEqual(16);
    expect(r).toBeLessThanOrEqual(20);
  });
  test("popup typeScale has 4+ strictly ascending steps topping out at 28+", () => {
    const t = tokens().popup.typeScale;
    expect(t.length).toBeGreaterThanOrEqual(4);
    t.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(t[i]!));
    expect(Math.max(...t)).toBeGreaterThanOrEqual(28);
  });
  for (const [fg, bg, min] of [
    ["ink", "surface", 4.5], ["muted", "surface", 4.5], ["pillInk", "pill", 4.5], ["accent", "surface", 3],
  ] as const) {
    test(`${fg} on ${bg} has WCAG contrast >= ${min}`, () => {
      const p = tokens().popup;
      expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(min);
    });
  }
});
