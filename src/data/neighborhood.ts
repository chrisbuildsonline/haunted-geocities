// The GeoCities neighborhood of a host: pure, so the costume, the popup and the tests share it.
import data from "./neighborhoods.json";

export interface Neighborhood {
  name: string;
  tagline: string;
  suburb: string;
  number: number;
  /** `Neighborhood/Suburb/NNNN` */
  address: string;
}

interface Rule {
  kind: "tld" | "word";
  match: string[];
  to: string;
}
interface Entry {
  name: string;
  tagline: string;
  suburbs: string[];
}

const ENTRIES = data.neighborhoods as Entry[];
const RULES = data.rules as Rule[];
const BY_NAME = new Map(ENTRIES.map((e) => [e.name, e]));
const entryNamed = (name: string) => BY_NAME.get(name)!;

const LOCALHOST = { name: "Heartland", suburb: "Homestead", number: 1998 };
const IP_LITERAL = { name: "Area51", suburb: "Hangar", number: 1998 };

/** 32-bit FNV-1a. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** Lowercase, one trailing dot and one leading `www.` removed. */
export const normaliseHost = (host: string) => host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[") || h.includes(":");

/** Whole token, or its plural; keywords of 4+ letters also match as a prefix or suffix. */
function tokenMatches(token: string, word: string): boolean {
  if (token === word || token === `${word}s`) return true;
  return word.length >= 4 && (token.startsWith(word) || token.endsWith(word));
}

function ruleMatches(rule: Rule, labels: string[]): boolean {
  if (rule.kind === "tld") return labels.slice(-2).some((l) => rule.match.includes(l));
  const tokens = labels.slice(0, -1).flatMap((l) => l.split("-")).filter(Boolean);
  return tokens.some((t) => rule.match.some((w) => tokenMatches(t, w)));
}

/** The neighborhood and address of `host`. Deterministic, and total over any string. */
export function resolveNeighborhood(host: string): Neighborhood {
  const h = normaliseHost(host);
  const fixed = isIp(h) ? IP_LITERAL : h === "localhost" || h.endsWith(".localhost") ? LOCALHOST : null;
  const hash = fnv1a(h);
  const labels = h.split(".");
  const rule = fixed ? undefined : RULES.find((r) => ruleMatches(r, labels));
  const entry = fixed ? entryNamed(fixed.name) : rule ? entryNamed(rule.to) : ENTRIES[hash % ENTRIES.length]!;
  const suburb = fixed ? fixed.suburb : entry.suburbs[fnv1a(`suburb:${h}`) % entry.suburbs.length]!;
  const number = fixed ? fixed.number : 1000 + ((hash >>> 8) % 9000);
  return { name: entry.name, tagline: entry.tagline, suburb, number, address: `${entry.name}/${suburb}/${number}` };
}
