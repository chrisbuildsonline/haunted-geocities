import { describe, expect, test } from "bun:test";
import { startScanner, type ScanResult } from "../../src/content/scanner";
import type { TrackerData } from "../../src/data/types";

const data: TrackerData = {
  source: "x",
  licence: "x",
  fetched: "2026-11-03",
  domains: {
    "pixel.example": { company: "Pixco", prevalence: 0.1, categories: ["Analytics", "Advertising"], fingerprinting: 1 },
    "cdn.pixco-media.net": { company: "Pixco", prevalence: 0.1, categories: ["Advertising"], fingerprinting: 2 },
    "unseen.pixco.example": { company: "Pixco", prevalence: 0.1, categories: ["Session Replay"], fingerprinting: 3 },
    "ads.other": { company: "Other", prevalence: 0.1, categories: [], fingerprinting: 0 },
  },
  entities: { Pixco: ["cdn.pixco-media.net", "pixel.example"], Other: ["ads.other"] },
};

const entry = (url: string, startTime = 1) => ({ name: url, startTime, entryType: "resource" });

/** Fake performance + PerformanceObserver, the way Chrome behaves with buffered: true. */
function fakes(initial: ReturnType<typeof entry>[]) {
  const all = [...initial];
  const observers: FakeObserver[] = [];
  class FakeObserver {
    disconnected = false;
    options: unknown;
    constructor(private cb: (list: { getEntries(): unknown[] }) => void) {
      observers.push(this);
    }
    observe(options: { type: string; buffered?: boolean }) {
      this.options = options;
      if (options.buffered && all.length) this.cb({ getEntries: () => [...all] });
    }
    disconnect() {
      this.disconnected = true;
    }
    emit(entries: ReturnType<typeof entry>[]) {
      all.push(...entries);
      this.cb({ getEntries: () => entries });
    }
  }
  const performance = { getEntriesByType: (t: string) => (t === "resource" ? [...all] : []) } as unknown as Pick<Performance, "getEntriesByType">;
  return { performance, PerformanceObserver: FakeObserver as unknown as typeof PerformanceObserver, observers, all };
}

const run = (initial: ReturnType<typeof entry>[], siteHost = "news.test") => {
  const f = fakes(initial);
  const updates: ScanResult[] = [];
  const scanner = startScanner({ data, siteHost, onUpdate: (r) => updates.push(r), ...f });
  return { f, updates, scanner };
};

describe("startScanner", () => {
  test("reads existing entries and observes future ones", () => {
    const { f, updates } = run([entry("https://pixel.example/p.gif", 1)]);
    expect(f.observers.length).toBe(1);
    expect(f.observers[0]!.options).toEqual({ type: "resource", buffered: true });
    expect(updates.at(-1)?.total).toBe(1);
    f.observers[0]!.emit([entry("https://ads.other/a.js", 2)]);
    expect(updates.at(-1)?.total).toBe(2);
    expect(updates.at(-1)?.companies.map((c) => c.company).sort()).toEqual(["Other", "Pixco"]);
  });

  test("buffered observer entries are not counted twice", () => {
    const { updates } = run([entry("https://pixel.example/p.gif", 1), entry("https://pixel.example/q.gif", 2)]);
    expect(updates.at(-1)?.total).toBe(2);
    expect(updates.at(-1)?.companies[0]?.count).toBe(2);
  });

  test("re-delivered entries are ignored", () => {
    const { f, updates } = run([entry("https://pixel.example/p.gif", 1)]);
    const n = updates.length;
    f.observers[0]!.emit([entry("https://pixel.example/p.gif", 1)]);
    expect(updates.length).toBe(n);
    expect(updates.at(-1)?.total).toBe(1);
  });

  test("groups per company: deduped domains, request count, sorted categories and max fingerprinting of the matched domains", () => {
    const { updates } = run([
      entry("https://pixel.example/a.gif", 1),
      entry("https://pixel.example/b.gif", 2),
      entry("https://x.cdn.pixco-media.net/c.js", 3),
      entry("https://ads.other/d.js", 4),
    ]);
    const result = updates.at(-1)!;
    expect(result.total).toBe(4);
    const pixco = result.companies.find((c) => c.company === "Pixco")!;
    expect(pixco).toEqual({
      company: "Pixco",
      domains: ["pixel.example", "x.cdn.pixco-media.net"],
      count: 3,
      categories: ["Advertising", "Analytics"],
      fingerprinting: 2,
    });
  });

  test("first-party, non-tracker and non-http entries are skipped", () => {
    const { updates } = run([
      entry("https://news.test/app.js"),
      entry("https://cdn.news.test/app.js"),
      entry("https://example.org/x.png"),
      entry("data:image/gif;base64,R0lGOD"),
      entry("blob:https://news.test/1234"),
      entry("not a url"),
    ]);
    expect(updates).toEqual([]);
  });

  test("stop disconnects the observer and ignores later entries", () => {
    const { f, updates, scanner } = run([]);
    scanner.stop();
    expect(f.observers[0]!.disconnected).toBe(true);
    f.observers[0]!.emit([entry("https://pixel.example/p.gif")]);
    expect(updates).toEqual([]);
  });

  test("snapshot returns the current result", () => {
    const { scanner } = run([entry("https://ads.other/a.js")]);
    expect(scanner.snapshot()).toEqual({
      companies: [{ company: "Other", domains: ["ads.other"], count: 1, categories: [], fingerprinting: 0 }],
      total: 1,
    });
  });

  test("is read-only: entries are not modified", () => {
    const e = entry("https://pixel.example/p.gif");
    const copy = structuredClone(e);
    run([e]);
    expect(e).toEqual(copy);
    expect(Object.isFrozen(e)).toBe(false);
  });

  test("works without PerformanceObserver (reads existing entries only)", () => {
    const f = fakes([entry("https://pixel.example/p.gif")]);
    const updates: ScanResult[] = [];
    startScanner({ data, siteHost: "news.test", onUpdate: (r) => updates.push(r), performance: f.performance });
    expect(updates.at(-1)?.total).toBe(1);
  });
});
