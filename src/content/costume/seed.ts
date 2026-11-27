// The site seed: one number per site, so every page and reload of a site wears the same look.

/** The site a hostname belongs to for the seed: lower-cased, one leading "www." dropped. */
export const seedKey = (hostname: string) => hostname.toLowerCase().replace(/^www\./, "");

/** FNV-1a, 32 bit. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** mulberry32: a tiny seeded PRNG, each call a float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random pick from `list` with `rnd`. */
export const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
