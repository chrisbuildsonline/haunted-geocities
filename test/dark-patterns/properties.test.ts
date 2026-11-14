// Property tests with a seeded PRNG (no dependency): a few hundred random cases per property.
// A failure message carries the seed and the case number; rerun with the same SEED to reproduce.
import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { detectDarkPatterns } from "../../src/content/dark-patterns";

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

const win = new Window({ url: "https://shop.test/" });
afterAll(() => win.happyDOM.close());
const docOf = (body: string) => {
  win.document.body.innerHTML = body;
  return win.document as unknown as Document;
};
const detect = (body: string) => detectDarkPatterns(docOf(body), "hg-crypt");

// ---- phrases -------------------------------------------------------------------------------

type Kind = "scarcity" | "countdown";
interface Phrase {
  kind: Kind;
  words: string[];
  /** Cutting after at most this many words leaves a left part that is no pattern on its own. */
  maxCut: number;
}

const LEADS = ["Only", "just", "ONLY", "Just"];
const NOUNS = ["items", "units", "rooms", "seats", "tickets", "pieces", "spots", "copies", "pairs"];
const ENDINGS = [["left"], ["remaining"], ["available"], ["in", "stock"]];
// Each of these is matched in full by one countdown pattern.
const COUNTDOWNS = [["Limited", "time", "offer"], ["2", "hours", "left"], ["Ends", "in", "15", "min"], ["Offer", "ends", "in"]];
// The same phrases with one required piece swapped.
const COUNTDOWN_LOOKALIKES: Record<string, string[]> = {
  "Limited time offer": ["Limited", "times", "offer"],
  "2 hours left": ["2", "hours", "lift"],
  "Ends in 15 min": ["Ends", "in", "15", "mind"],
  "Offer ends in": ["Offer", "ends", "it"],
};

function phrase(r: Rand, kind: Kind): Phrase {
  if (kind === "countdown") {
    const words = [...pick(r, COUNTDOWNS)];
    return { kind, words, maxCut: words.length - 1 };
  }
  const head = [pick(r, LEADS), String(int(r, 1, 99)), ...(r() < 0.5 ? [pick(r, NOUNS)] : [])];
  return { kind, words: [...head, ...pick(r, ENDINGS)], maxCut: head.length };
}

/** A look-alike: the phrase with one required piece swapped, so no pattern matches it. */
function lookalike(r: Rand, p: Phrase): string[] {
  if (p.kind === "countdown") return COUNTDOWN_LOOKALIKES[p.words.join(" ")]!;
  const w = [...p.words];
  const endAt = w.length - (w[w.length - 1] === "stock" ? 2 : 1);
  switch (int(r, 0, 2)) {
    case 0:
      w.splice(1, 1); // no number
      return w;
    case 1:
      return [...w.slice(0, endAt), "lift"]; // no stock word
    default:
      return ["the", ...w.slice(1)]; // no only/just
  }
}

const WS = [" ", " ", " ", "  ", "\n", "\t ", " \n "];
const ws = (r: Rand) => pick(r, WS);
const recase = (r: Rand, w: string) => pick(r, [w, w.toLowerCase(), w.toUpperCase()]);

/** Cut a word list into 1 to `max` contiguous pieces; the space after a cut stays on the earlier piece. */
function cut(r: Rand, words: string[], max: number): string[] {
  const k = Math.min(int(r, 1, max), words.length);
  const at = new Set<number>();
  while (at.size < k - 1) at.add(int(r, 1, words.length - 1));
  const bounds = [0, ...[...at].sort((a, b) => a - b), words.length];
  const pieces: string[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const own = words.slice(bounds[i]!, bounds[i + 1]!);
    pieces.push(own.map((w, j) => recase(r, w) + (j < own.length - 1 ? ws(r) : "")).join("") + (i + 2 < bounds.length ? ws(r) : ""));
  }
  return pieces;
}

// ---- markup --------------------------------------------------------------------------------

const INLINE = ["b", "i", "em", "strong", "span", "u"];
const PREFIXES = ["", "", "Welcome back. ", "Hurry! ", "Note: "];
const SUFFIXES = ["", "", " Thanks for visiting.", " Ships free.", "!"];

interface Wrapper {
  id: string;
  tag: string;
}

/** The <p> markup for the pieces, and the id of the smallest element the model says holds them all. */
function markup(r: Rand, pieces: string[], ids: { n: number }): { html: string; expected: string } {
  const chains: Wrapper[][] = pieces.map(() => Array.from({ length: int(r, 0, 3) }, () => ({ id: `e${ids.n++}`, tag: pick(r, INLINE) })));
  if (pieces.length >= 2 && r() < 0.4) {
    const i = int(r, 0, pieces.length - 1);
    const j = int(r, i, pieces.length - 1);
    const group = { id: `e${ids.n++}`, tag: pick(r, INLINE) };
    for (let k = i; k <= j; k++) chains[k]!.unshift(group);
  }
  let html = "";
  let open: Wrapper[] = [];
  pieces.forEach((text, k) => {
    const chain = chains[k]!;
    let common = 0;
    while (common < open.length && common < chain.length && open[common] === chain[common]) common++;
    for (let c = open.length; c > common; c--) html += `</${open[c - 1]!.tag}>`;
    for (const w of chain.slice(common)) html += `<${w.tag} id="${w.id}">`;
    html += text;
    open = chain;
  });
  for (let c = open.length; c > 0; c--) html += `</${open[c - 1]!.tag}>`;
  const first = chains[0]!;
  const last = chains[chains.length - 1]!;
  let shared = 0;
  while (shared < first.length && shared < last.length && first[shared] === last[shared]) shared++;
  return { html, expected: shared > 0 ? first[shared - 1]!.id : "root" };
}

/** One random case: the <p> for a split phrase, its expected element id and its words. */
function splitCase(r: Rand, kind: Kind) {
  const p = phrase(r, kind);
  const { html, expected } = markup(r, cut(r, p.words, 5), { n: 0 });
  const body = `<p id="root">${pick(r, PREFIXES)}${html}${pick(r, SUFFIXES)}</p>`;
  return { p, body, expected };
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// ---- properties ----------------------------------------------------------------------------

describe("generator", () => {
  test("generator output is deterministic for a seed", () => {
    const make = (seed: number) => {
      const r = prng(seed);
      return [splitCase(r, "scarcity").body, splitCase(r, "countdown").body].join("\n");
    };
    expect(make(SEED)).toBe(make(SEED));
    expect(new Set(Array.from({ length: 20 }, (_, i) => make(SEED + i))).size).toBeGreaterThan(10);
  });
});

describe("split phrases", () => {
  for (const kind of ["scarcity", "countdown"] as const) {
    forAll(`a split ${kind} phrase is found once on the smallest element`, (r) => {
      const { body, expected } = splitCase(r, kind);
      const found = detect(body);
      expect(found).toHaveLength(1);
      expect(found[0]!.kind).toBe(kind);
      expect(found[0]!.element.id).toBe(expected);
    });
  }

  forAll("snippets are at most 60 characters", (r) => {
    const { p, body } = splitCase(r, pick(r, ["scarcity", "countdown"] as const));
    const [found] = detect(body);
    expect(found!.snippet.length).toBeLessThanOrEqual(60);
    // the model: the element's collapsed text, cut at 60 from the match
    const text = collapse(found!.element.textContent ?? "");
    const from = text.toLowerCase().indexOf(p.words.join(" ").toLowerCase());
    expect(from).toBeGreaterThanOrEqual(0);
    const rest = text.slice(from);
    expect(found!.snippet).toBe(text.length <= 60 ? text : rest.length <= 60 ? rest : rest.slice(0, 59) + "…");
  });

  forAll("detection leaves the tree unchanged", (r) => {
    const { body } = splitCase(r, pick(r, ["scarcity", "countdown"] as const));
    const doc = docOf(body);
    const before = doc.documentElement.outerHTML;
    detectDarkPatterns(doc, "hg-crypt");
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("negatives", () => {
  forAll("a phrase split across blocks is never found", (r) => {
    const p = phrase(r, pick(r, ["scarcity", "countdown"] as const));
    const at = int(r, 1, p.maxCut);
    const ids = { n: 0 };
    const left = markup(r, cut(r, p.words.slice(0, at), 3), ids).html;
    const right = markup(r, cut(r, p.words.slice(at), 3), ids).html;
    expect(detect(`<div><p>${left}</p><p>${right}</p></div>`)).toEqual([]);
  });

  forAll("look-alike text split at random is never found", (r) => {
    const p = phrase(r, pick(r, ["scarcity", "countdown"] as const));
    const { html } = markup(r, cut(r, lookalike(r, p), 5), { n: 0 });
    expect(detect(`<p id="root">${pick(r, PREFIXES)}${html}${pick(r, SUFFIXES)}</p>`)).toEqual([]);
  });

  forAll("two kinds in one block give one pattern, the higher precedence", (r) => {
    const a = cut(r, phrase(r, "scarcity").words, 1)[0]!;
    const b = cut(r, phrase(r, "countdown").words, 1)[0]!;
    const found = detect(`<p id="root">${r() < 0.5 ? `${a} ${b}` : `${b} ${a}`}</p>`);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("scarcity");
  });
});
