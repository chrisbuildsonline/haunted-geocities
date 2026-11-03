import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "../../scripts/ingest-trackers";
import type { TrackerData } from "../../src/data/types";

const tracker = (domain: string, name: string, displayName: string, prevalence: number, fingerprinting: number, categories: string[]) => ({
  domain,
  owner: { name, displayName },
  prevalence,
  fingerprinting,
  categories,
});

const TDS = {
  trackers: {
    "zeta-ads.net": tracker("zeta-ads.net", "Zeta Inc", "Zeta", 0.01, 1, ["Advertising"]),
    "alpha-pixel.com": tracker("alpha-pixel.com", "Alpha Inc", "Alpha", 0.5, 3, ["Analytics", "Advertising"]),
    "alpha-cdn.com": (({ categories: _, ...t }) => t)(tracker("alpha-cdn.com", "Alpha Inc", "Alpha", 0.2, 0, [])), // categories missing
    "rare-tracker.com": tracker("rare-tracker.com", "Rare Ltd", "Rare", 0.00001, 1, ["Advertising"]),
  },
  entities: {
    "Alpha Inc": { displayName: "Alpha", domains: ["alpha-pixel.com", "alpha-cdn.com", "alpha-news.com"], prevalence: 0.5 },
    "Zeta Inc": { displayName: "Zeta", domains: ["zeta-ads.net"], prevalence: 0.01 },
    "Rare Ltd": { displayName: "Rare", domains: ["rare-tracker.com", "rare-shop.com"], prevalence: 0.00001 },
    "Idle Corp": { displayName: "Idle", domains: ["idle.com"], prevalence: 0.5 },
  },
  domains: {},
};

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "hg-ingest-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const setup = (licence = true) => {
  const raw = temp();
  const out = temp();
  writeFileSync(join(raw, "extension-tds.json"), JSON.stringify(TDS));
  if (licence) writeFileSync(join(raw, "tracker-radar-LICENSE.txt"), "Licensed under the CC BY-NC-SA 4.0 license");
  return { raw, out };
};
const read = (out: string) => JSON.parse(readFileSync(join(out, "trackers.json"), "utf8")) as TrackerData;

describe("ingest", () => {
  test("keys each tracker domain to company, prevalence, categories and fingerprinting; drops low prevalence", () => {
    const { raw, out } = setup();
    ingest(raw, out, "2026-11-03");
    expect(read(out).domains).toEqual({
      "alpha-cdn.com": { company: "Alpha", prevalence: 0.2, categories: [], fingerprinting: 0 }, // empty categories kept
      "alpha-pixel.com": { company: "Alpha", prevalence: 0.5, categories: ["Analytics", "Advertising"], fingerprinting: 3 },
      "zeta-ads.net": { company: "Zeta", prevalence: 0.01, categories: ["Advertising"], fingerprinting: 1 },
    });
  });

  test("entity domains are kept only for companies that are kept", () => {
    const { raw, out } = setup();
    ingest(raw, out, "2026-11-03");
    expect(read(out).entities).toEqual({
      Alpha: ["alpha-cdn.com", "alpha-news.com", "alpha-pixel.com"],
      Zeta: ["zeta-ads.net"],
    });
  });

  test("carries source URL, licence name and fetched date", () => {
    const { raw, out } = setup();
    ingest(raw, out, "2026-11-03");
    const data = read(out);
    expect(data.source).toBe("https://staticcdn.duckduckgo.com/trackerblocking/v6/current/extension-tds.json");
    expect(data.licence).toBe("CC BY-NC-SA 4.0");
    expect(data.fetched).toBe("2026-11-03");
  });

  test("fetched date defaults to the Fetched: line of sources.md", () => {
    const { raw, out } = setup();
    writeFileSync(join(raw, "sources.md"), "# Sources\n\nFetched: 2026-10-01\n");
    ingest(raw, out);
    expect(read(out).fetched).toBe("2026-10-01");
  });

  test("two runs are byte-identical and keys are sorted", () => {
    const a = setup();
    const b = setup();
    ingest(a.raw, a.out, "2026-11-03");
    ingest(b.raw, b.out, "2026-11-03");
    const text = readFileSync(join(a.out, "trackers.json"), "utf8");
    expect(text).toBe(readFileSync(join(b.out, "trackers.json"), "utf8"));
    expect(text).not.toContain("\n  ");
    expect(Object.keys(JSON.parse(text).domains)).toEqual(["alpha-cdn.com", "alpha-pixel.com", "zeta-ads.net"]);
  });

  test("copies the licence and writes ATTRIBUTION.md", () => {
    const { raw, out } = setup();
    ingest(raw, out, "2026-11-03");
    expect(readFileSync(join(out, "LICENSE-tracker-radar.txt"), "utf8")).toContain("CC BY-NC-SA 4.0");
    const attribution = readFileSync(join(out, "ATTRIBUTION.md"), "utf8");
    expect(attribution).toContain("DuckDuckGo");
    expect(attribution).toContain("CC BY-NC-SA 4.0");
  });

  test("throws when the licence is missing and writes nothing", () => {
    const { raw, out } = setup(false);
    expect(() => ingest(raw, out, "2026-11-03")).toThrow(/licen[cs]e/i);
    expect(existsSync(join(out, "trackers.json"))).toBe(false);
  });
});

describe("committed src/data/trackers.json", () => {
  const data = JSON.parse(readFileSync(join(import.meta.dir, "../../src/data/trackers.json"), "utf8")) as TrackerData;

  test("has the expected shape", () => {
    expect(data.licence).toBe("CC BY-NC-SA 4.0");
    expect(data.source).toStartWith("https://");
    expect(data.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const rec of Object.values(data.domains)) {
      expect(typeof rec.company).toBe("string");
      expect(rec.prevalence).toBeGreaterThanOrEqual(0.0001);
      expect(Array.isArray(rec.categories)).toBe(true);
      expect(rec.fingerprinting).toBeGreaterThanOrEqual(0);
      expect(rec.fingerprinting).toBeLessThanOrEqual(3);
    }
    expect(Object.values(data.domains).some((r) => r.categories.length === 0)).toBe(true);
    const companies = new Set(Object.values(data.domains).map((r) => r.company));
    expect(Object.keys(data.entities).every((n) => companies.has(n))).toBe(true);
  });

  test("is within size bounds", () => {
    const n = Object.keys(data.domains).length;
    expect(n).toBeGreaterThan(800);
    expect(n).toBeLessThan(1000);
    expect(statSizeKb()).toBeLessThan(300);
  });

  test("ATTRIBUTION.md names the real source, Tracker Radar, the licence and the changes", () => {
    const a = readFileSync(join(import.meta.dir, "../../src/data/ATTRIBUTION.md"), "utf8");
    expect(a).toContain("tracker-blocklists");
    expect(a).toContain("Tracker Radar");
    expect(a).toContain("CC BY-NC-SA 4.0");
    expect(a).toContain("Changes");
  });

  test("licence and attribution files are committed next to it", () => {
    expect(existsSync(join(import.meta.dir, "../../src/data/LICENSE-tracker-radar.txt"))).toBe(true);
    expect(readFileSync(join(import.meta.dir, "../../src/data/ATTRIBUTION.md"), "utf8")).toContain("DuckDuckGo");
  });
});

function statSizeKb() {
  return readFileSync(join(import.meta.dir, "../../src/data/trackers.json")).length / 1024;
}
