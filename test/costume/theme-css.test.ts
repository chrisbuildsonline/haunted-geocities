import { describe, expect, test } from "bun:test";
import { contrastRatio } from "../../src/content/costume/page-theme";
import { dividerPx, SPRITES, tilePx, tintPatternPx, TRAIL_GLYPHS } from "../../src/content/costume/theme-art";
import { lookPageCss, lookShadowCss, lookSprites, tintPattern, WELCOME } from "../../src/content/costume/theme-css";
import { DIVIDERS, PALETTES, pickLook, PRESETS, SPRITE_SETS, TILES, type PaletteId } from "../../src/content/costume/themes";
import { coverLookCss } from "../../src/cover/cover";

describe("theme art", () => {
  test("every sprite is a 16×16 map and every trail glyph 7×7", () => {
    for (const [name, s] of Object.entries(SPRITES)) expect({ name, rows: s.map.length, widths: [...new Set(s.map.map((r) => r.length))] }).toEqual({ name, rows: 16, widths: [16] });
    for (const [name, g] of Object.entries(TRAIL_GLYPHS)) expect({ name, rows: g.length, widths: [...new Set(g.map((r) => r.length))] }).toEqual({ name, rows: 7, widths: [7] });
    for (const set of Object.values(SPRITE_SETS)) for (const s of set) expect(SPRITES[s]).toBeDefined();
  });

  test("every tile is drawn only in its palette's ground and three inks, inside 64×64", () => {
    for (const tile of TILES) for (const [id, c] of Object.entries(PALETTES)) {
      const px = tilePx(tile, c);
      const inks = new Set([c.ground, c.a1, c.a2, c.a3]);
      expect({ tile, id, stray: px.filter((p) => !inks.has(p.color)).length }).toEqual({ tile, id, stray: 0 });
      expect(px.every((p) => p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64)).toBe(true);
    }
  });

  test("the tint pattern is the tint plus white, so the tint is the darkest colour under text", () => {
    for (const tile of TILES) for (const c of Object.values(PALETTES)) {
      expect(new Set(tintPatternPx(tile, c.tint).map((p) => p.color))).toEqual(new Set([c.tint, "#ffffff"]));
    }
  });

  test("every divider draws something in every palette", () => {
    for (const d of DIVIDERS) for (const c of Object.values(PALETTES)) expect(dividerPx(d, c).length).toBeGreaterThan(0);
  });
});

describe("theme CSS", () => {
  const look = (id: string) => pickLook("x.test", id);

  test("the page sheet names the preset and sizes the banner for desktop and phone", () => {
    const css = lookPageCss(look("flame-skull"));
    expect(css).toContain(":root { --hg-theme: flame-skull; --hg-welcome: 72px; }");
    expect(css).toContain(`@media (max-width: ${WELCOME.phoneBelow - 1}px) { :root { --hg-welcome: 56px; } }`);
    expect(css).toMatch(/:where\(hr\) \{ height: 16px !important; border: 0 !important; background: url\("data:image\/svg\+xml,/);
    // images get a bevel drawn as an outline, so nothing moves
    expect(css).toContain(":where(main, article) img { outline: 3px outset #ff9900 !important; outline-offset: -3px !important; }");
  });

  test("the rainbow fill goes only on the measured headings, and never on a dark page", () => {
    const l = look("cloud-angel");
    expect(lookPageCss(l, { rainbow: [] })).not.toContain("background-clip: text");
    const css = lookPageCss(l, { rainbow: ["body > :nth-child(1)"] });
    expect(css).toContain(":is(body > :nth-child(1)) { background-image: linear-gradient(90deg, #990000 0.00% 16.67%");
    expect(css).toContain("-webkit-text-fill-color: transparent");
    expect(lookPageCss(l, { rainbow: ["body > :nth-child(1)"], dark: true })).not.toContain("background-clip: text");
  });

  test("a blinking heading blinks five times and only when motion is allowed", () => {
    const css = lookPageCss(look("toxic-dump"));
    expect(css).toContain("@media (prefers-reduced-motion: no-preference) { :where(h1) { animation: hg-blink 1000ms steps(1) 5 !important; } }");
  });

  test("under reduced motion nothing in the banner, the sprites or the trail moves", () => {
    for (const p of PRESETS) {
      const css = lookShadowCss(look(p.id));
      expect(css).toContain(".reduced-motion .wb-new, .reduced-motion .deco, .reduced-motion .spark { animation: none !important; }");
      expect(css).toContain(".reduced-motion #trail { display: none; }");
    }
  });

  test("the nav-frame quirk dresses one gutter, the table quirk none", () => {
    expect(lookShadowCss(look("spiderweb-attic"))).toContain("#starfield .gutter.left .fill { background: #330066;");
    expect(lookShadowCss(look("ufo-crash"))).toContain("#starfield .gutter.right .fill {");
    expect(lookShadowCss(look("flame-skull"))).not.toContain("#starfield .gutter.");
  });

  test("the banner and the footer show the sprite set's pair", () => {
    expect(lookSprites(look("construction-zone"))).toEqual({ banner: ["worker", "cone"], footer: ["cone", "worker"] });
  });

  test("Classic Crypt keeps its plain parchment; every other preset gets a pattern", () => {
    expect(tintPattern(look("classic-crypt"))).toBeNull();
    for (const p of PRESETS.filter((p) => p.id !== "classic-crypt")) expect(tintPattern(look(p.id))).toMatch(/^data:image\/svg\+xml,/);
  });
});

describe("the cover", () => {
  test("takes the site's plaque and marquee colour, which read at 4.5:1; Classic Crypt keeps its own", () => {
    expect(coverLookCss("127.0.0.1")).toBe("");
    const nps = pickLook("www.nps.gov");
    const c = PALETTES[nps.palette as PaletteId];
    expect(coverLookCss("www.nps.gov")).toContain(`.screen { background-color: ${c.plaque};`);
    expect(coverLookCss("www.nps.gov")).toContain(`.label { color: ${c.plaqueText}; }`);
    for (const p of Object.values(PALETTES)) expect(contrastRatio(p.plaqueText, p.plaque)).toBeGreaterThanOrEqual(4.5);
  });
});
