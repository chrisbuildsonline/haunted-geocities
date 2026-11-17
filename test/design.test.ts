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
  popup: Record<string, string> & {
    width: number; maxHeight: number; radius: number; blur: number; typeScale: number[];
    tags: Record<string, [string, string]>;
  };
};
const POPUP_COLOURS: Record<string, string> = {
  face: "#c0c0c0", hilite: "#ffffff", light: "#dfdfdf", shadow: "#808080", dark: "#000000",
  title: "#000080", titleInk: "#ffffff", field: "#ffffff", ink: "#000000", sub: "#222222",
  hover: "#ccccff", counter: "#000000", counterInk: "#33ff33", link: "#0000ff", visited: "#800080",
  desktop: "#008080", accent: "#6633cc",
};
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
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
    Popup: ["Windows 95", "bevel", "title bar", "group box", "status bar", "checkbox", "type scale", "accent", "radius"],
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
  test("popup costume tokens are the Win95 palette", () => {
    const p = tokens().popup;
    for (const [k, v] of Object.entries(POPUP_COLOURS)) expect({ [k]: p[k] }).toEqual({ [k]: v });
    expect([p.width, p.maxHeight, p.radius, p.blur]).toEqual([360, 600, 0, 0]);
    expect(p.typeScale).toEqual([12, 13, 24]);
    expect(p.tags).toEqual({
      caught: ["#ccccff", "#330099"], known: ["#cccccc", "#000000"], dead404: ["#ffcccc", "#660000"],
      dead410: ["#ffcc99", "#663300"], exorcised: ["#cccccc", "#333333"],
    });
    for (const old of ["canvas", "surface", "muted", "pill", "pillInk", "toggleOff"]) expect({ old, has: old in p }).toEqual({ old, has: false });
    // styles.css reads the same values as custom properties.
    const css = readFileSync(join(import.meta.dir, "..", "src", "popup", "styles.css"), "utf8");
    const root = css.match(/:root\s*\{([^}]*)\}/)![1]!;
    for (const [k, v] of Object.entries(POPUP_COLOURS)) expect({ k, declared: root.includes(`--${kebab(k)}: ${v};`) }).toEqual({ k, declared: true });
  });

  test("popup costume text pairs have WCAG contrast >= 4.5", () => {
    const p = tokens().popup;
    const pairs: [string, string][] = [
      [p.ink, p.face], [p.sub, p.face], [p.ink, p.field], [p.sub, p.field], [p.ink, p.hover], [p.sub, p.hover],
      [p.titleInk, p.title], [p.counterInk, p.counter], [p.link, p.face], [p.link, p.field], [p.visited, p.face], [p.visited, p.field],
      ...Object.values(p.tags).map(([bg, fg]) => [fg, bg] as [string, string]),
      ["#660000", "#ffcccc"],
    ];
    for (const [fg, bg] of pairs) expect({ fg, bg, ok: contrast(fg, bg) >= 4.5 }).toEqual({ fg, bg, ok: true });
    // The focus ring is not text: 3:1 against both grounds.
    for (const bg of [p.face, p.field]) expect(contrast(p.accent, bg)).toBeGreaterThanOrEqual(3);
  });

  test("popup sub-lines are 12px on grey, so they reach AAA 7:1 on every ground", () => {
    const p = tokens().popup;
    for (const bg of [p.face, p.field, p.hover]) expect({ bg, ok: contrast(p.sub, bg) >= 7 }).toEqual({ bg, ok: true });
  });

  test("the costume's smallest text is 12px", () => {
    const t = tokens() as Tokens & { costume: { layout: { minText: number } } };
    expect(t.costume.layout.minText).toBe(12);
    // No 11px type left in the prose ("11px short of the column" is a distance, not text).
    const type11 = /Comic Sans(?: MS)? 11px|11px (?:bold|`#)|\(11px/;
    expect(section("Costume")).not.toMatch(type11);
    expect(section("Popup")).not.toMatch(type11);
  });

  test("DESIGN.md popup section describes the Win95 costume and no longer the 2024 pill", () => {
    const s = section("Popup");
    for (const w of ["#c0c0c0", "#000080", "#dfdfdf", "#808080", "#008080", "MS Sans Serif", "Times New Roman", "Courier New", "default push button", "hit-counter", "list box"]) {
      expect({ w, found: s.includes(w) }).toEqual({ w, found: true });
    }
    expect(s).toMatch(/era costume wins/i);
    for (const old of ["#eef0f4", "#111318", "#5b6170", "#f5f6f8", "#d6d9e0", "system-ui", "999", "18px", "rgba("]) {
      expect({ old, found: s.includes(old) }).toEqual({ old, found: false });
    }
    expect(s).not.toMatch(/\bpill\b/i);
    expect(doc().split("## Haunt moment")[0]).not.toMatch(/modern control room/i);
  });
});
