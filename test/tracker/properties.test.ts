// Property tests with a seeded PRNG (no dependency): a few hundred random cases per property.
// A failure message carries the seed and the case number; rerun with the same SEED to reproduce.
import { describe, expect, test } from "bun:test";
import { lookup, matchTracker } from "../../src/content/matcher";
import { planSlots, type Rect } from "../../src/content/costume/ghosts";
import type { Column } from "../../src/content/costume/starfield";
import { LAYOUT } from "../../src/content/costume/tokens";
import type { TrackerData } from "../../src/data/types";

const SEED = 0x5eed1998;
const CASES = 300;

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = ReturnType<typeof prng>;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]) => xs[int(r, 0, xs.length - 1)]!;
const label = (r: Rand) => Array.from({ length: int(r, 1, 8) }, () => "abcdefghijklmnopqrstuvwxyz0123456789-"[int(r, 0, 36)]).join("").replace(/^-+|-+$/g, "") || "x";

/** Run `body` for each case with its own PRNG; the failure names the seed and the case. */
function forAll(name: string, body: (r: Rand) => void) {
  test(name, () => {
    for (let i = 0; i < CASES; i++) {
      const caseSeed = SEED + i;
      try {
        body(prng(caseSeed));
      } catch (e) {
        throw new Error(`property "${name}" failed: seed=${SEED} case=${i} (case seed ${caseSeed}): ${(e as Error).message}`);
      }
    }
  });
}

// Fixed owners: tracker domains with names the random labels cannot produce (they contain "_").
const data: TrackerData = {
  source: "x",
  licence: "x",
  fetched: "2026-11-03",
  domains: {
    "pixel_a.example": { company: "Pixco", prevalence: 0.1, categories: [], fingerprinting: 1 },
    "cdn.pixco_media.net": { company: "Pixco", prevalence: 0.1, categories: [], fingerprinting: 0 },
    "ads_b.org": { company: "Other", prevalence: 0.1, categories: [], fingerprinting: 0 },
  },
  entities: { Pixco: ["cdn.pixco_media.net", "pixco_news.com", "pixel_a.example"], Other: ["ads_b.org"] },
};
const KNOWN = Object.keys(data.domains);
const subdomain = (r: Rand, host: string) => Array.from({ length: int(r, 0, 4) }, () => label(r)).concat(host).join(".");

describe("lookup properties", () => {
  forAll("any subdomain of a known host resolves to that host, in any letter case", (r) => {
    const known = pick(r, KNOWN);
    const host = subdomain(r, known);
    const noisy = [...host].map((c) => (r() < 0.5 ? c.toUpperCase() : c)).join("") + (r() < 0.5 ? "." : "");
    expect(lookup(noisy, data)).toBe(known);
  });

  forAll("an unrelated host gives null", (r) => {
    const host = [...Array.from({ length: int(r, 1, 4) }, () => label(r)), pick(r, ["test", "example", "org", "com"])].join(".");
    expect(lookup(host, data)).toBeNull();
  });

  forAll("a mere string suffix of a known host is not a match", (r) => {
    expect(lookup(label(r) + pick(r, KNOWN), data)).toBeNull();
  });

  forAll("arbitrary strings never throw and give null or a known domain", (r) => {
    const s = Array.from({ length: int(r, 0, 40) }, () => String.fromCharCode(int(r, 0, r() < 0.2 ? 0xffff : 127))).join("");
    const out = lookup(s, data);
    expect(out === null || KNOWN.includes(out)).toBe(true);
  });
});

describe("matchTracker properties", () => {
  forAll("any subdomain of a known host seen from an unrelated site has the same owner as the known host", (r) => {
    const known = pick(r, KNOWN);
    const site = `${label(r)}.test`;
    const owner = data.domains[known]!.company;
    expect(matchTracker(known, data, site)).toBe(owner);
    expect(matchTracker(subdomain(r, known), data, site)).toBe(owner);
  });

  forAll("an unrelated request host gives null whatever the site", (r) => {
    expect(matchTracker(`${label(r)}.${label(r)}.test`, data, `${label(r)}.test`)).toBeNull();
  });

  forAll("first party is never flagged: the site's own host and its subdomains, or a site under the tracker domain", (r) => {
    const known = pick(r, KNOWN);
    expect(matchTracker(known, data, known)).toBeNull();
    expect(matchTracker(subdomain(r, known), data, known)).toBeNull();
    expect(matchTracker(known, data, subdomain(r, known))).toBeNull();
    // A site that is a parent of the tracker's own host (down to two labels) is the same party too.
    const labels = known.split(".");
    const parent = labels.slice(int(r, 0, Math.max(0, labels.length - 2))).join(".");
    expect(matchTracker(subdomain(r, known), data, parent)).toBeNull();
  });

  forAll("a site owned by the same company never sees that company's trackers", (r) => {
    const ownedSites = ["cdn.pixco_media.net", "pixco_news.com", "pixel_a.example"];
    const site = subdomain(r, pick(r, ownedSites));
    expect(matchTracker(pick(r, ["pixel_a.example", "cdn.pixco_media.net"]), data, site)).toBeNull();
  });

  forAll("arbitrary strings for either host never throw", (r) => {
    const s = () => Array.from({ length: int(r, 0, 30) }, () => String.fromCharCode(int(r, 0, r() < 0.2 ? 0xffff : 127))).join("");
    const out = matchTracker(s(), data, s());
    expect(out === null || out === "Pixco" || out === "Other").toBe(true);
  });
});

describe("planSlots properties", () => {
  const scenario = (r: Rand) => {
    const vw = int(r, 320, 2200);
    // Gutters are what is left either side of the content column (gutterWidths), so they never sum past the viewport.
    const left = int(r, 0, Math.min(400, vw));
    const gutters: Column | null = r() < 0.1 ? null : { left, right: int(r, 0, Math.min(400, vw - left)) };
    const top = int(r, 0, 120);
    const bottom = top + int(r, 0, 1400);
    const text: Rect[] = Array.from({ length: int(r, 0, 12) }, () => {
      const left = int(r, 0, vw);
      const t = int(r, 0, bottom + 100);
      return { left, right: left + int(r, 1, 700), top: t, bottom: t + int(r, 1, 300) };
    });
    return { gutters, vw, top, bottom, text };
  };

  forAll("slots stay inside their gutter, the viewport, and the band between top and bottom", (r) => {
    const s = scenario(r);
    for (const slot of planSlots(s.gutters, s.vw, s.top, s.bottom, s.text)) {
      const g = s.gutters![slot.side];
      const start = slot.side === "left" ? 0 : s.vw - g;
      expect(g).toBeGreaterThanOrEqual(LAYOUT.laneWidth);
      expect(slot.x).toBeGreaterThanOrEqual(start);
      expect(slot.x + slot.w).toBeLessThanOrEqual(start + g);
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x + slot.w).toBeLessThanOrEqual(s.vw);
      expect(slot.y).toBeGreaterThanOrEqual(s.top);
      expect(slot.y + LAYOUT.slotPitch).toBeLessThanOrEqual(s.bottom);
    }
  });

  forAll("no two slots overlap", (r) => {
    const s = scenario(r);
    const slots = planSlots(s.gutters, s.vw, s.top, s.bottom, s.text);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const [a, b] = [slots[i]!, slots[j]!];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + LAYOUT.slotPitch && b.y < a.y + LAYOUT.slotPitch;
        expect({ a, b, overlap }).toEqual({ a, b, overlap: false });
      }
    }
  });

  forAll("no slot intersects a text rect", (r) => {
    const s = scenario(r);
    for (const slot of planSlots(s.gutters, s.vw, s.top, s.bottom, s.text)) {
      for (const t of s.text) {
        const hits = t.left < slot.x + slot.w && t.right > slot.x && t.top < slot.y + LAYOUT.slotPitch && t.bottom > slot.y;
        expect({ slot, t, hits }).toEqual({ slot, t, hits: false });
      }
    }
  });

  forAll("the same input gives the same output", (r) => {
    const s = scenario(r);
    const again = () => planSlots(s.gutters, s.vw, s.top, s.bottom, s.text);
    expect(again()).toEqual(again());
  });

  forAll("no gutters, or gutters under 64px, give no slots", (r) => {
    const s = scenario(r);
    expect(planSlots(null, s.vw, s.top, s.bottom, s.text)).toEqual([]);
    expect(planSlots({ left: int(r, 0, 63), right: int(r, 0, 63) }, s.vw, s.top, s.bottom, s.text)).toEqual([]);
  });
});
