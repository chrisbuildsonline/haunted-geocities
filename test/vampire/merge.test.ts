import { describe, expect, test } from "bun:test";
import { markKnownVampires, mergeVampire } from "../../src/content/vampire";
import type { CompanyHit, VampireInfo } from "../../src/data/types";

const hit = (company: string, over: Partial<CompanyHit> = {}): CompanyHit => ({
  company,
  domains: [`${company.toLowerCase()}.com`],
  count: 2,
  categories: ["Analytics"],
  fingerprinting: 0,
  ...over,
});

describe("types", () => {
  test("VampireInfo is importable and CompanyHit.vampire is optional", () => {
    const v: VampireInfo = { caught: ["canvas"], knownOnly: false };
    const withIt: CompanyHit = hit("A", { vampire: v });
    expect(withIt.vampire).toEqual(v);
    expect(hit("A").vampire).toBeUndefined();
  });
});

describe("mergeVampire", () => {
  test("extends an existing company, deduplicated, without mutating the input", () => {
    const input = [hit("Criteo")];
    const a = mergeVampire(input, "Criteo", "canvas");
    const b = mergeVampire(mergeVampire(a, "Criteo", "canvas"), "Criteo", "audio");
    expect(b[0]!.vampire).toEqual({ caught: ["canvas", "audio"], knownOnly: false });
    expect(b[0]!.count).toBe(2);
    expect(input[0]!.vampire).toBeUndefined();
  });
  test("an unlisted host becomes a new CompanyHit named by the host, count 0", () => {
    const out = mergeVampire([hit("Criteo")], "sneaky.example", "fonts");
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      company: "sneaky.example",
      domains: ["sneaky.example"],
      count: 0,
      categories: [],
      fingerprinting: 0,
      vampire: { caught: ["fonts"], knownOnly: false },
    });
  });
});

describe("markKnownVampires", () => {
  test("fingerprinting >= 2 and not caught is a known vampire", () => {
    const out = markKnownVampires([hit("A", { fingerprinting: 2 }), hit("B", { fingerprinting: 1 }), hit("C", { fingerprinting: 3 })]);
    expect(out[0]!.vampire).toEqual({ caught: [], knownOnly: true });
    expect(out[1]!.vampire).toBeUndefined();
    expect(out[2]!.vampire).toEqual({ caught: [], knownOnly: true });
  });
  test("a caught vampire keeps knownOnly false", () => {
    const caught = hit("A", { fingerprinting: 3, vampire: { caught: ["audio"], knownOnly: false } });
    expect(markKnownVampires([caught])[0]!.vampire).toEqual({ caught: ["audio"], knownOnly: false });
  });
});
