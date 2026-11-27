// The real-site proof: `bun run docs:realsite` films the haunt on live public pages over the real network
// and commits docs/real-site-haunt.gif, a caption still per page and docs/real-site.json. These tests hold
// the committed record to its shape, keep the README (GIF right under the title) and the demo script
// honest about which shots are fixtures, and keep the live-network run out of the CI and Docker gates.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
const readme = read("README.md");
const demo = read("docs/demo-script.md");
const devpost = read("docs/devpost.md");
const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

type Page = { page: string; still: string; gif?: string; trackersFound: number; parade: string[]; stillShows?: string[] };
const record = (read("docs/real-site.json") ? JSON.parse(read("docs/real-site.json")) : { pages: [] }) as { captured?: string; pages: Page[] };
const GIF = "docs/real-site-haunt.gif";
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

const DISCLOSURE =
  "A pre-period prototype exists outside the entry and was rebuilt from lessons, not copied; Tracker Radar ingest output is the only reused data.";

describe("real-site proof", () => {
  test("docs/real-site.json records one or two live public pages, each with its count and parade", () => {
    expect(record.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.pages.length).toBeGreaterThanOrEqual(1);
    expect(record.pages.length).toBeLessThanOrEqual(2);
    for (const p of record.pages) {
      expect(p.page).toMatch(/^https:\/\//);
      expect(p.page).not.toMatch(/127\.0\.0\.1|localhost|fixtures?/);
      expect(p.trackersFound).toBeGreaterThan(0);
      expect(p.parade.length).toBeGreaterThan(0);
      expect(p.parade.length).toBeLessThanOrEqual(Math.min(6, p.trackersFound));
    }
    expect(record.pages.filter((p) => p.gif === GIF)).toHaveLength(1);
  });

  test("each caption still shows the named tracker ghosts of its parade, not only the caption", () => {
    for (const p of record.pages) {
      const shows = p.stillShows ?? [];
      expect({ page: p.page, enough: shows.length >= Math.min(3, p.parade.length) }).toEqual({ page: p.page, enough: true });
      for (const c of shows) expect(p.parade).toContain(c);
    }
    expect(read("scripts/real-site.pw.ts")).toContain("stillShows");
  });

  test("the GIF is a 560px GIF under 2 MB, and each caption still is a 1280px PNG under 1 MB", () => {
    const gif = readFileSync(join(root, GIF));
    expect(gif.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(gif.readUInt16LE(6)).toBe(560);
    expect(statSync(join(root, GIF)).size).toBeLessThan(2 * 1024 * 1024);
    for (const p of record.pages) {
      const png = readFileSync(join(root, p.still));
      expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1280);
      expect(png.length).toBeLessThan(1024 * 1024);
    }
  });

  test("the README shows the real-site GIF right under the title, and keeps the disclosure on line 5", () => {
    const lines = readme.split("\n");
    expect(lines[0]).toBe("# Haunted GeoCities");
    const first = lines.slice(1).find((l) => l.trim() !== "");
    expect(first).toMatch(new RegExp(`^!\\[[^\\]]+\\]\\(${GIF.replaceAll(".", "\\.")}\\)$`));
    expect(lines[4]).toBe(DISCLOSURE);
  });

  test("the README names each live page, its count and its still, and says the other shots are fixtures", () => {
    const intro = readme.split(/^## What it does\s*$/m)[0]!;
    for (const p of record.pages) {
      expect(intro).toContain(host(p.page));
      expect(intro).toContain(`Trackers found: ${p.trackersFound}`);
      expect(intro).toContain(`(${p.still})`);
    }
    expect(intro).toContain("bun run docs:realsite");
    expect(intro).toMatch(/fixture pages in `fixtures\/`[^.]*made-up[^.]*not real sites/);
  });

  test("the demo script says its opening page is a fixture and points at the real-site GIF", () => {
    const opening = demo.split(/^## /m)[1] ?? "";
    expect(opening).toMatch(/`news\.html` is a fixture[^.]*made-up[^.]*not a real site/);
    expect(demo).toContain(GIF);
    for (const p of record.pages) expect(demo).toContain(host(p.page));
  });

  test("the Devpost write-up names the live pages and their counts", () => {
    for (const p of record.pages) {
      expect(devpost).toContain(host(p.page));
      expect(devpost).toContain(`Trackers found: ${p.trackersFound}`);
    }
  });

  test("the capture runs in a time zone where it is mid-afternoon, never the witching hour (local 00:00-00:59)", async () => {
    const { afternoonZone } = await import("../scripts/afternoon");
    for (let h = 0; h < 24; h++) {
      const now = new Date(Date.UTC(2026, 10, 27, h, 30));
      const hour = new Intl.DateTimeFormat("en-US", { timeZone: afternoonZone(now), hour: "numeric", hourCycle: "h23" }).format(now);
      expect({ h, hour }).toEqual({ h, hour: "15" });
    }
    expect(read("scripts/real-site.pw.ts")).toMatch(/timezoneId: afternoonZone\(\)/);
  });

  test("the e2e, visual and README-shot browser lives on that afternoon too, so no run or docs shot catches the witching hour", () => {
    const fixtures = read("e2e/fixtures.ts");
    expect(fixtures).toMatch(/import \{ afternoonZone \} from "\.\.\/scripts\/afternoon"/);
    const launch = fixtures.slice(fixtures.indexOf("launchPersistentContext("));
    expect(launch.slice(0, launch.indexOf("});"))).toMatch(/timezoneId: afternoonZone\(\)/);
    // the README shots and the visual tests launch through that same fixture
    expect(read("e2e/readme.shots.ts")).toMatch(/from "\.\/fixtures"/);
    expect(read("e2e-visual/visual.spec.ts")).toMatch(/from "\.\.\/e2e\/fixtures"/);
  });

  test("docs:realsite runs the live capture with the shipping build, outside every gate", () => {
    expect(scripts["docs:realsite"]).toBe("vite build && playwright test --config playwright.realsite.config.ts");
    const source = read("scripts/real-site.pw.ts");
    expect(source).not.toMatch(/host-resolver-rules|fixture\(|FIXTURE_PORT/);
    expect(read("playwright.realsite.config.ts")).not.toMatch(/webServer/);
    // in no gate: not the Docker image, not the e2e or screenshot runs
    expect(read("Dockerfile")).not.toMatch(/realsite|real-site/);
    for (const name of ["test", "test:e2e", "screenshots", "docker:test", "test:visual"]) expect(scripts[name]).not.toMatch(/realsite/);
    expect(read("playwright.config.ts")).not.toMatch(/real-site/);
  });
});
