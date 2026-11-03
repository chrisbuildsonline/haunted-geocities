import { describe, expect, test } from "bun:test";
import { lookup, matchTracker } from "../../src/content/matcher";
import type { TrackerData } from "../../src/data/types";

const data: TrackerData = {
  source: "x",
  licence: "x",
  fetched: "2026-11-03",
  domains: {
    "pixel.example": { company: "Pixco", prevalence: 0.1, categories: ["Analytics"], fingerprinting: 1 },
    "cdn.pixco-media.net": { company: "Pixco", prevalence: 0.1, categories: [], fingerprinting: 0 },
    "ads.other": { company: "Other", prevalence: 0.1, categories: [], fingerprinting: 0 },
  },
  entities: { Pixco: ["cdn.pixco-media.net", "pixco-news.com", "pixel.example"], Other: ["ads.other"] },
};

describe("lookup", () => {
  test("exact domain matches", () => expect(lookup("pixel.example", data)).toBe("pixel.example"));
  test("walks parent domains", () => expect(lookup("a.b.pixel.example", data)).toBe("pixel.example"));
  test("a tracker listed at a subdomain matches below it, not above it", () => {
    expect(lookup("x.cdn.pixco-media.net", data)).toBe("cdn.pixco-media.net");
    expect(lookup("pixco-media.net", data)).toBeNull();
  });
  test("unknown hosts and bare public suffixes return null", () => {
    expect(lookup("example.org", data)).toBeNull();
    expect(lookup("example", data)).toBeNull();
    expect(lookup("", data)).toBeNull();
  });
  test("is case-insensitive and ignores a trailing dot", () => expect(lookup("PIXEL.Example.", data)).toBe("pixel.example"));
  test("does not match on a mere string suffix", () => expect(lookup("notpixel.example", data)).toBeNull());
});

describe("matchTracker", () => {
  test("returns the company for a third-party tracker", () => {
    expect(matchTracker("sub.pixel.example", data, "news.test")).toBe("Pixco");
  });
  test("null for a host that is not a tracker", () => expect(matchTracker("cdn.news.test", data, "news.test")).toBeNull());
  test("null when the request is to the site's own host", () => {
    expect(matchTracker("pixel.example", data, "pixel.example")).toBeNull();
  });
  test("null when the request host is a subdomain of the site host", () => {
    expect(matchTracker("a.pixel.example", data, "pixel.example")).toBeNull();
  });
  test("null when the site host is a subdomain of the tracker domain", () => {
    expect(matchTracker("pixel.example", data, "www.pixel.example")).toBeNull();
  });
  test("null when the site belongs to the same company as the tracker", () => {
    expect(matchTracker("pixel.example", data, "pixco-news.com")).toBeNull();
    expect(matchTracker("cdn.pixco-media.net", data, "www.pixco-news.com")).toBeNull();
  });
  test("a different company's site still sees the tracker", () => {
    expect(matchTracker("pixel.example", data, "ads.other")).toBe("Pixco");
  });
});

test("matcher has no DOM or chrome dependency", async () => {
  const src = await Bun.file(new URL("../../src/content/matcher.ts", import.meta.url)).text();
  expect(src).not.toMatch(/\b(document|window|chrome|navigator)\b/);
  expect(src).not.toMatch(/^import .* from "(?!\.\.\/data\/types)/m);
});
