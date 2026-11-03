// Pure merge of runtime catches into the scanner's company list.
import type { CompanyHit } from "../data/types";
import type { Api } from "./hooks-bridge";

/** `companies` plus the catch: extends the named company, or adds an unlisted host as a new one. */
export function mergeVampire(companies: CompanyHit[], company: string, api: Api): CompanyHit[] {
  const found = companies.some((c) => c.company === company);
  const extend = (c: CompanyHit): CompanyHit => ({
    ...c,
    vampire: { caught: [...new Set([...(c.vampire?.caught ?? []), api])], knownOnly: false },
  });
  if (found) return companies.map((c) => (c.company === company ? extend(c) : c));
  return [...companies, extend({ company, domains: [company], count: 0, categories: [], fingerprinting: 0 })];
}

const API_NAMES: Record<Api, string> = { canvas: "canvas readback", audio: "AudioContext", fonts: "font probing" };

/** What a vampire was caught doing, in a fixed order: "canvas readback · AudioContext · font probing". */
export const caughtLine = (caught: readonly Api[]) => (["canvas", "audio", "fonts"] as const).filter((a) => caught.includes(a)).map((a) => API_NAMES[a]).join(" · ");

/** Companies the Tracker Radar scores 2 or more for fingerprinting, and nothing was caught, are known vampires. */
export function markKnownVampires(companies: CompanyHit[]): CompanyHit[] {
  return companies.map((c) =>
    c.fingerprinting >= 2 && !c.vampire?.caught.length ? { ...c, vampire: { caught: [], knownOnly: true } } : c,
  );
}
