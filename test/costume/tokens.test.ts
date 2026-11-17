import { expect, test } from "bun:test";
import { LAYOUT, PAGE } from "../../src/content/costume/tokens";
import { designTokens } from "./helpers";

const webSafe = (h: string) => /^#(?:00|33|66|99|cc|ff){3}$/.test(h);

test("page tokens are web-safe", () => {
  const colours = Object.values(PAGE);
  expect(colours.length).toBe(11);
  expect(colours.filter((c) => !webSafe(c))).toEqual([]);
});

test("page tokens match DESIGN.md costume.page", () => {
  const t = designTokens();
  expect(PAGE).toEqual(t.costume.page);
  expect(LAYOUT).toEqual(t.costume.layout);
  expect(LAYOUT).toMatchObject({ frameBevel: 6, edgeFrame: 12, edgeDither: 4, darkLuminance: 0.4, minContrast: 4.5 });
});
