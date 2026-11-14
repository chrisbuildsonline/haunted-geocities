import { describe, expect, test } from "bun:test";
import data from "../../src/data/neighborhoods.json";

type Rule = { kind: string; match: string[]; to: string };
const neighborhoods = data.neighborhoods as { name: string; tagline: string; suburbs: string[] }[];
const rules = data.rules as Rule[];
const names = neighborhoods.map((n) => n.name);

const NAMES = [
  "Area51", "SiliconValley", "Hollywood", "Athens", "CapitolHill", "WallStreet", "TimesSquare", "SunsetStrip",
  "Colosseum", "MotorCity", "Paris", "SoHo", "Heartland", "Petsburgh", "RainForest", "Tokyo",
];

describe("neighborhoods.json", () => {
  test("lists the 16 names in order", () => {
    expect(names).toEqual(NAMES);
    for (const n of neighborhoods) expect(Object.keys(n).sort()).toEqual(["name", "suburbs", "tagline"]);
  });

  test("every tagline is one printable-ASCII line of 48 characters or fewer", () => {
    for (const { tagline } of neighborhoods) {
      expect(tagline).toMatch(/^[\x20-\x7e]+$/);
      expect(tagline.length).toBeLessThanOrEqual(48);
      expect(tagline.trim()).toBe(tagline);
    }
  });

  test("every neighborhood has 4 distinct suburbs of 2 to 12 letters", () => {
    for (const { suburbs } of neighborhoods) {
      expect(suburbs).toHaveLength(4);
      expect(new Set(suburbs).size).toBe(4);
      for (const s of suburbs) expect(s).toMatch(/^[A-Za-z]{2,12}$/);
    }
  });

  test("SiliconValley has Heights, Area51 has Hangar, Heartland has Homestead", () => {
    const suburbs = (name: string) => neighborhoods.find((n) => n.name === name)!.suburbs;
    expect(suburbs("SiliconValley")).toContain("Heights");
    expect(suburbs("Area51")).toContain("Hangar");
    expect(suburbs("Heartland")).toContain("Homestead");
  });

  test("every rule has kind tld or word, a non-empty lowercase match and a known target", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(["tld", "word"]).toContain(r.kind);
      expect(r.match.length).toBeGreaterThan(0);
      for (const m of r.match) expect(m).toMatch(/^[a-z0-9]+$/);
      expect(names).toContain(r.to);
    }
  });

  test("tld rules come before word rules", () => {
    const kinds = rules.map((r) => r.kind);
    const lastTld = kinds.lastIndexOf("tld");
    const firstWord = kinds.indexOf("word");
    expect(lastTld).toBeGreaterThanOrEqual(0);
    expect(firstWord).toBeGreaterThan(lastTld);
  });

  test("the required tld rules and word keywords are present", () => {
    const target = (kind: string, word: string) => rules.find((r) => r.kind === kind && r.match.includes(word))?.to;
    const tld: Record<string, string> = {
      gov: "CapitolHill", mil: "CapitolHill", edu: "Athens", ac: "Athens", jp: "Tokyo", fr: "Paris", dev: "SiliconValley",
    };
    for (const [w, to] of Object.entries(tld)) expect([w, target("tld", w)]).toEqual([w, to]);
    const words: Record<string, string[]> = {
      WallStreet: ["shop", "store", "bank", "pay", "trade"],
      TimesSquare: ["game", "play", "arcade"],
      SoHo: ["news", "blog", "write", "art"],
      SunsetStrip: ["music", "band", "radio"],
      SiliconValley: ["code", "dev", "github", "gitlab", "git", "software", "tech"],
      Petsburgh: ["pet", "dog", "cat", "puppy", "kitten"],
    };
    for (const [to, ws] of Object.entries(words)) for (const w of ws) expect([w, target("word", w)]).toEqual([w, to]);
  });

  test("taglines name no third-party trademark", () => {
    const marks = /google|facebook|yahoo|microsoft|apple|amazon|netscape|geocities|nintendo|sega|sony|disney/i;
    for (const { tagline } of neighborhoods) expect(tagline).not.toMatch(marks);
  });
});
