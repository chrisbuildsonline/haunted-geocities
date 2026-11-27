import { describe, expect, test } from "bun:test";
import { contrastRatio, ensureContrast, WEB_SAFE } from "../../src/content/costume/page-theme";
import { fnv1a, mulberry32, seedKey } from "../../src/content/costume/seed";
import {
  BANNERS, BEVELS, clashes, COUNTERS, DIVIDERS, HEADINGS, lookSignature, PALETTES, pickLook, PRESETS, QUIRKS, RAINBOW, SPRITE_SETS, TILES, TRAILS,
  type Axes, type PaletteId,
} from "../../src/content/costume/themes";

const hosts = (n: number) => Array.from({ length: n }, (_, i) => `site-${i}.${["com", "org", "net", "gov", "io"][i % 5]}`);

describe("the site seed", () => {
  test("seedKey lower-cases and strips one www", () => {
    expect(seedKey("WWW.Example.COM")).toBe("example.com");
    expect(seedKey("www.www.x.com")).toBe("www.x.com");
    expect(seedKey("blog.x.com")).toBe("blog.x.com");
  });

  test("fnv1a and mulberry32 are the published algorithms", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    const r = mulberry32(1);
    const a = [r(), r(), r()];
    expect(a.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(1)()).toBe(a[0]!);
  });
});

describe("pickLook", () => {
  test("the same host always gives the same look, and www.x.com equals x.com", () => {
    for (const h of ["nps.gov", "cdc.gov", "example.com", "127.0.0.1", "localhost"]) {
      expect(pickLook(h)).toEqual(pickLook(h));
      expect(pickLook(`www.${h}`)).toEqual(pickLook(h));
      expect(pickLook(h.toUpperCase())).toEqual(pickLook(h));
    }
  });

  test("there are 20 or more named presets with unique ids and names", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
  });

  test("every axis has its spread of options", () => {
    expect(TILES.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(PALETTES).length).toBeGreaterThanOrEqual(8);
    expect(HEADINGS.length).toBeGreaterThanOrEqual(5);
    expect(DIVIDERS.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(SPRITE_SETS).length).toBeGreaterThanOrEqual(5);
    expect(BEVELS.length).toBeGreaterThanOrEqual(4);
    expect(QUIRKS).toEqual(["table", "leftframe", "rightframe"]);
    expect(BANNERS.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(COUNTERS).length).toBeGreaterThanOrEqual(3);
    expect(TRAILS.length).toBeGreaterThanOrEqual(4);
  });

  test("200 hostnames give 20 or more presets and mostly unique signatures", () => {
    const looks = hosts(200).map((h) => pickLook(h));
    expect(new Set(looks.map((l) => l.preset)).size).toBeGreaterThanOrEqual(20);
    expect(new Set(looks.map(lookSignature)).size).toBeGreaterThanOrEqual(190);
    // and every tile and palette turns up
    expect(new Set(looks.map((l) => l.tile)).size).toBe(TILES.length);
    expect(new Set(looks.map((l) => l.palette)).size).toBe(Object.keys(PALETTES).length);
  });

  test("the seed varies two or three axes of the preset, never into a clash", () => {
    for (const h of hosts(300)) {
      const l = pickLook(h);
      const preset = PRESETS.find((p) => p.id === l.preset)!;
      expect(l.name).toBe(preset.name);
      expect(l.varied.length).toBeGreaterThanOrEqual(1);
      expect(l.varied.length).toBeLessThanOrEqual(3);
      const changed = (Object.keys(preset) as (keyof Axes)[]).filter((k) => k in l && k !== ("id" as never) && (l as Axes)[k] !== (preset as Axes)[k]);
      expect(changed.sort()).toEqual([...l.varied].sort());
      expect(clashes(l)).toEqual([]);
    }
  });

  test("the classic crypt keeps its page look: only its trimmings vary", () => {
    for (const h of hosts(400)) {
      const l = pickLook(h, "classic-crypt");
      expect({ tile: l.tile, palette: l.palette, fonts: l.fonts, heading: l.heading, bevel: l.bevel, quirk: l.quirk }).toEqual({
        tile: "stars", palette: "crypt", fonts: "classic", heading: "comic", bevel: "ridge", quirk: "table",
      });
    }
  });

  test("the fixture hosts and the real-site pages wear different presets", () => {
    const ids = ["127.0.0.1", "localhost", "nps.gov", "cdc.gov"].map((h) => pickLook(h).preset);
    expect(new Set(ids).size).toBe(4);
    // the e2e fixture host keeps the classic look, so the column specs keep their colours
    expect(ids[0]).toBe("classic-crypt");
  });

  test("a forced preset wins, an unknown one is ignored", () => {
    const forced = pickLook("127.0.0.1", "flame-skull");
    const { id, name, ...axes } = PRESETS.find((p) => p.id === "flame-skull")!;
    expect(forced).toEqual({ ...axes, site: "127.0.0.1", preset: id, name, varied: [] });
    expect(pickLook("127.0.0.1", "nope").preset).toBe(pickLook("127.0.0.1").preset);
  });
});

describe("contrast and the era palette, for every preset and variation", () => {
  const allColours = (pal: (typeof PALETTES)[PaletteId]) => Object.values(pal);

  test("every colour is web-safe", () => {
    for (const pal of Object.values(PALETTES)) for (const c of allColours(pal)) expect(WEB_SAFE).toContain(c);
    for (const c of RAINBOW) expect(WEB_SAFE).toContain(c);
    for (const c of Object.values(COUNTERS).flatMap((x) => [x.digit, x.cell])) expect(WEB_SAFE).toContain(c);
  });

  test("every palette's text pairs reach 4.5:1", () => {
    for (const [id, pal] of Object.entries(PALETTES)) {
      const pairs: [string, string, string][] = [
        ["bar", pal.bandText, pal.band],
        ["marquee", pal.plaqueText, pal.plaque],
        ["banner title", pal.title, pal.plaque],
        ["link", pal.link, pal.tint],
        ["visited", pal.visited, pal.tint],
        // the classic hover #ff0000 moves to #cc0000 on parchment (design/DESIGN.md), as every link colour may
        ["hover", ensureContrast(pal.hover, pal.tint), pal.tint],
        ["text", "#000000", pal.tint],
      ];
      for (const [what, fg, bg] of pairs) expect({ id, what, ok: contrastRatio(fg, bg) >= 4.5 }).toEqual({ id, what, ok: true });
    }
    for (const [id, c] of Object.entries(COUNTERS)) expect({ id, ok: contrastRatio(c.digit, c.cell) >= 4.5 }).toEqual({ id, ok: true });
  });

  test("walking every preset × every single-axis variation: no clash passes the rules with a contrast miss", () => {
    const axes = { palette: Object.keys(PALETTES), heading: HEADINGS, divider: DIVIDERS, sprites: Object.keys(SPRITE_SETS), bevel: BEVELS, banner: BANNERS.map((_, i) => i), counter: Object.keys(COUNTERS), trail: TRAILS, quirk: QUIRKS };
    let walked = 0;
    for (const preset of PRESETS) {
      expect({ preset: preset.id, clashes: clashes(preset) }).toEqual({ preset: preset.id, clashes: [] });
      for (const [axis, values] of Object.entries(axes)) {
        for (const v of values as unknown[]) {
          const a = { ...preset, [axis]: v } as Axes;
          if (clashes(a).length) continue;
          walked++;
          const pal = PALETTES[a.palette];
          if (a.heading === "rainbow") for (const c of RAINBOW) expect(contrastRatio(c, pal.tint)).toBeGreaterThanOrEqual(4.5);
          // links as the page sheet draws them on a white page under this tint
          for (const c of [pal.link, pal.visited, pal.hover]) expect(contrastRatio(ensureContrast(c, pal.tint), pal.tint)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(pal.title, pal.plaque)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    expect(walked).toBeGreaterThan(PRESETS.length * 20);
  });
});
