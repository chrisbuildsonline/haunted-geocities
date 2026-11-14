import { describe, expect, test } from "bun:test";
import { KIND_INFO } from "../../src/content/dark-patterns";
import { DARK_PATTERN_KINDS } from "../../src/data/types";

describe("KIND_INFO", () => {
  test("KIND_INFO titles match DESIGN.md plus Ticking timer", () => {
    expect(DARK_PATTERN_KINDS.map((k) => KIND_INFO[k].title)).toEqual([
      "Cursed: Fake scarcity",
      "Cursed: Countdown",
      "Cursed: Ticking timer",
      "Cursed: Confirmshaming",
      "Cursed: Pre-checked opt-in",
    ]);
    expect(DARK_PATTERN_KINDS.map((k) => KIND_INFO[k].name)).toEqual(["Fake scarcity", "Countdown", "Ticking timer", "Confirmshaming", "Pre-checked opt-in"]);
  });
  test("every trick is one sentence", () => {
    for (const k of DARK_PATTERN_KINDS) {
      const { trick } = KIND_INFO[k];
      expect(trick.trim()).toBe(trick);
      expect(trick.endsWith(".")).toBe(true);
      expect(trick).not.toMatch(/[\r\n]/);
    }
  });
});
