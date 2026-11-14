// Property tests with a seeded PRNG (no dependency): a few hundred random cases per property.
// A failure message carries the seed and the case number; rerun with the same SEED to reproduce.
import { describe, expect, test } from "bun:test";
import data from "../../src/data/neighborhoods.json";
import { normaliseHost, resolveNeighborhood } from "../../src/data/neighborhood";
import { assignTints, hemTint } from "../../src/content/costume/ghosts";
import { HEM_TINTS } from "../../src/content/costume/tokens";

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

const NAMES = data.neighborhoods.map((n) => n.name);
const KEYWORDS = data.rules.filter((r) => r.kind === "word").flatMap((r) => r.match);
const TLDS = ["com", "org", "net", "io", "uk", "de", "co", "shop", "gov", "edu", "ac", "jp", "fr", "dev", "localhost"];
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";

/** One label: letters (either case), digits and inner hyphens; sometimes a rule keyword, alone or glued. */
function label(r: Rand): string {
  if (r() < 0.2) {
    const word = pick(r, KEYWORDS);
    return pick(r, [word, `${word}s`, `my-${word}`, `${word}hub`, `the${word}`]);
  }
  const s = Array.from({ length: int(r, 1, 10) }, () => CHARS[int(r, 0, CHARS.length - 1)]).join("").replace(/^-+|-+$/g, "");
  // "www" as a first label would make "www." strip twice; the resolver strips one, by spec.
  return !s || s.toLowerCase() === "www" ? "x" : s;
}

/** A host as a browser might hand it over: no www., no trailing dot, in mixed case. */
const bareHost = (r: Rand) => [...Array.from({ length: int(r, 1, 3) }, () => label(r)), pick(r, TLDS)].join(".");

/** The bare host with the noise normalisation must remove: optional www., optional trailing dot, random case. */
const noisy = (r: Rand, bare: string) => {
  const cased = [...bare].map((c) => (r() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join("");
  return `${r() < 0.5 ? pick(r, ["www.", "WWW.", "Www."]) : ""}${cased}${r() < 0.5 ? "." : ""}`;
};
const host = (r: Rand) => noisy(r, bareHost(r));

/** Any string at all: ASCII, control characters, surrogates, spaces, slashes; sometimes very long. */
const anyString = (r: Rand) =>
  Array.from({ length: r() < 0.05 ? int(r, 1000, 6000) : int(r, 0, 60) }, () => String.fromCharCode(int(r, 0, r() < 0.3 ? 0xffff : 127))).join("");

const FIXED = new Set(["Heartland/Homestead/1998", "Area51/Hangar/1998"]);

describe("the host generator", () => {
  test("the generator is deterministic for a seed", () => {
    const run = (seed: number) => {
      const r = prng(seed);
      return Array.from({ length: 50 }, () => host(r));
    };
    expect(run(SEED)).toEqual(run(SEED));
    expect(run(SEED)).not.toEqual(run(SEED + 1));
    // It does make the noise it claims to: www., trailing dots, upper case, keywords.
    const sample = run(SEED).join(" ");
    expect(sample).toMatch(/\bwww\./i);
    expect(sample).toMatch(/\.( |$)/);
    expect(sample).toMatch(/[A-Z]/);
  });
});

describe("resolver properties", () => {
  forAll("resolveNeighborhood is total for random strings", (r) => {
    const s = r() < 0.5 ? anyString(r) : host(r);
    expect(() => resolveNeighborhood(s)).not.toThrow();
  });

  forAll("it is deterministic", (r) => {
    const s = r() < 0.5 ? anyString(r) : host(r);
    expect(resolveNeighborhood(s)).toEqual(resolveNeighborhood(s));
  });

  forAll("the number is an integer from 1000 to 9999 unless the address is fixed", (r) => {
    const n = resolveNeighborhood(r() < 0.5 ? anyString(r) : host(r));
    if (FIXED.has(n.address)) expect(n.number).toBe(1998);
    expect(Number.isInteger(n.number)).toBe(true);
    expect(n.number).toBeGreaterThanOrEqual(1000);
    expect(n.number).toBeLessThanOrEqual(9999);
  });

  forAll("the suburb is in the neighborhood's list", (r) => {
    const n = resolveNeighborhood(r() < 0.5 ? anyString(r) : host(r));
    expect(data.neighborhoods.find((e) => e.name === n.name)!.suburbs).toContain(n.suburb);
  });

  forAll("address equals name/suburb/number", (r) => {
    const n = resolveNeighborhood(r() < 0.5 ? anyString(r) : host(r));
    expect(n.address).toBe(`${n.name}/${n.suburb}/${n.number}`);
    expect(n.tagline).toBe(data.neighborhoods.find((e) => e.name === n.name)!.tagline);
  });

  forAll("case, www. and a trailing dot do not change the result", (r) => {
    const bare = bareHost(r).toLowerCase();
    const plain = resolveNeighborhood(bare);
    const variant = noisy(r, bare);
    expect({ variant, n: resolveNeighborhood(variant) }).toEqual({ variant, n: plain });
    expect(normaliseHost(variant)).toBe(bare);
  });

  forAll("the name is one of the 16", (r) => {
    expect(NAMES).toContain(resolveNeighborhood(r() < 0.5 ? anyString(r) : host(r)).name);
  });
});

describe("tint properties", () => {
  /** Company names in ghost order: random names, with repeats of a base tint made likely by reuse. */
  const companies = (r: Rand) => {
    const pool = Array.from({ length: int(r, 1, 8) }, () => Array.from({ length: int(r, 1, 12) }, () => CHARS[int(r, 0, 61)]).join(""));
    return Array.from({ length: int(r, 0, 30) }, (_, i) => (r() < 0.5 ? pick(r, pool) : `${pick(r, pool)}${i}`));
  };

  forAll("assignTints never repeats a tint within three consecutive companies", (r) => {
    const tints = assignTints(companies(r));
    for (let i = 1; i < tints.length; i++) {
      expect(tints[i]).not.toBe(tints[i - 1]!);
      if (i > 1) expect(tints[i]).not.toBe(tints[i - 2]!);
    }
  });

  forAll("assignTints gives each company a tint from HEM_TINTS", (r) => {
    const list = companies(r);
    const tints = assignTints(list);
    expect(tints).toHaveLength(list.length);
    for (const t of tints) expect(HEM_TINTS as readonly string[]).toContain(t);
  });

  forAll("assignTints equals hemTint for a company whose base tint is free", (r) => {
    const list = companies(r);
    const tints = assignTints(list);
    list.forEach((c, i) => {
      if (!tints.slice(Math.max(0, i - 2), i).includes(hemTint(c))) expect(tints[i]).toBe(hemTint(c));
    });
    if (list.length) expect(tints[0]).toBe(hemTint(list[0]!));
  });

  forAll("assignTints is deterministic", (r) => {
    const list = companies(r);
    expect(assignTints(list)).toEqual(assignTints([...list]));
  });
});
