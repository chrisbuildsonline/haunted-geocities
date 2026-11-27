// The caption still keeps the restyled panels clear: scripts/still-frame.ts picks the frame of the parade
// where no parade ghost (named or filler) covers a crypt window, and docs/real-site.json records the boxes
// of the chosen frame so the committed stills can be checked here without a browser.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CLEAR, overlaps, pickStill, type Box, type Frame } from "../scripts/still-frame";

const root = join(import.meta.dir, "..");
const read = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });
const view = { width: 1280, height: 1000 };
const panel = box(720, 270, 500, 230);

describe("overlaps", () => {
  test("boxes that share area overlap; boxes further apart than the gap do not", () => {
    expect(overlaps(box(0, 0, 100, 100), box(50, 50, 100, 100))).toBe(true);
    expect(overlaps(box(0, 0, 100, 100), box(100, 0, 100, 100))).toBe(false);
    expect(overlaps(box(0, 0, 100, 100), box(120, 0, 100, 100), 28)).toBe(true);
    expect(overlaps(box(0, 0, 100, 100), box(129, 0, 100, 100), 28)).toBe(false);
    expect(overlaps(box(0, 0, 100, 100), box(0, 129, 100, 100), 28)).toBe(false);
  });
});

describe("pickStill", () => {
  const named = (company: string, b: Box) => ({ company, box: b });
  const filler = (b: Box) => ({ box: b });

  test("skips a frame where any ghost covers a panel, even one with more names in view", () => {
    const frames: Frame[] = [
      { k: 1, mid: 35, panels: [panel], ghosts: [named("A", box(0, 300, 144, 144)), named("B", box(800, 300, 96, 96)), named("C", box(400, 600, 144, 144))] },
      { k: 2, mid: 35, panels: [panel], ghosts: [named("A", box(0, 300, 144, 144)), named("C", box(400, 600, 144, 144)), named("B", box(800, 560, 96, 96))] },
    ];
    expect(pickStill(frames, view)).toMatchObject({ k: 2, shows: ["A", "C", "B"] });
  });

  test("a filler ghost over a panel rules its frame out too", () => {
    const frames: Frame[] = [
      { k: 1, mid: 35, panels: [panel], ghosts: [named("A", box(0, 300, 144, 144)), filler(box(1137, 300, 96, 96))] },
      { k: 2, mid: 35, panels: [panel], ghosts: [named("A", box(0, 600, 144, 144))] },
    ];
    expect(pickStill(frames, view)?.k).toBe(2);
  });

  test("counts only named ghosts wholly in view, and takes the latest of the clear frames that show the most", () => {
    const frames: Frame[] = [
      { k: 1, mid: 35, panels: [panel], ghosts: [named("A", box(0, 600, 144, 144)), named("B", box(300, 900, 144, 144))] },
      { k: 2, mid: 35, panels: [panel], ghosts: [named("A", box(0, 500, 144, 144)), filler(box(300, 700, 96, 96))] },
      { k: 3, mid: 35, panels: [panel], ghosts: [named("A", box(0, 400, 144, 144)), named("B", box(300, -20, 144, 144))] },
    ];
    expect(pickStill(frames, view)).toMatchObject({ k: 3, shows: ["A"] });
  });

  test("a block across the page's width (every lane must cross it) does not rule a frame out; a window does", () => {
    const band = box(12, 575, 1256, 140);
    const frames: Frame[] = [
      { k: 1, mid: 35, panels: [panel, band], ghosts: [named("A", box(0, 600, 144, 144))] },
      { k: 2, mid: 35, panels: [panel, band], ghosts: [named("A", box(800, 300, 144, 144))] },
    ];
    expect(pickStill(frames, view)).toMatchObject({ k: 1, panels: [panel] });
  });

  test("no frame at all when every frame has a ghost over a panel", () => {
    const frames: Frame[] = [{ k: 1, mid: 35, panels: [panel], ghosts: [named("A", box(700, 480, 144, 144))] }];
    expect(pickStill(frames, view)).toBeNull();
  });
});

describe("the committed stills", () => {
  type Page = { page: string; stillShows: string[]; stillClear?: { panels: Box[]; ghosts: Box[] } };
  const record = JSON.parse(read("docs/real-site.json") || '{"pages":[]}') as { pages: Page[] };

  test("each still records the restyled panels in its frame and every parade ghost, none closer to a panel than the gap", () => {
    expect(record.pages.length).toBeGreaterThan(0);
    for (const p of record.pages) {
      const clear = p.stillClear ?? { panels: [], ghosts: [] };
      expect({ page: p.page, panels: clear.panels.length > 0, ghosts: clear.ghosts.length }).toEqual({ page: p.page, panels: true, ghosts: 6 });
      const covered = clear.ghosts.filter((g) => clear.panels.some((q) => overlaps(g, q, CLEAR)));
      expect({ page: p.page, covered }).toEqual({ page: p.page, covered: [] });
    }
  });

  test("the capture script picks its still with pickStill and records stillClear", () => {
    const source = read("scripts/real-site.pw.ts");
    expect(source).toContain('from "./still-frame"');
    expect(source).toMatch(/pickStill\(/);
    expect(source).toContain("stillClear");
  });
});
