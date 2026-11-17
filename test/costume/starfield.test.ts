import { expect, test } from "bun:test";
import { buildEdgeFrame } from "../../src/content/costume/starfield";
import { costumeCss } from "../../src/content/costume/styles";
import { setup } from "./helpers";

test("edge frame is 12px with 2×2 checker inner edge and pointer-events none", () => {
  const { doc } = setup({ width: 375 });
  const frame = buildEdgeFrame(doc);
  expect(frame.id).toBe("edge-frame");
  expect(frame.getAttribute("aria-hidden")).toBe("true");
  expect(frame.hidden).toBe(true);
  const strips = [...frame.querySelectorAll(".ef")].map((s) => s.className);
  expect(strips).toEqual(["ef top", "ef right", "ef bottom", "ef left"]);
  for (const s of frame.querySelectorAll(".ef")) expect(s.querySelector(".ef-dither")).not.toBeNull();
  const css = costumeCss({ stars: "data:stars", twinkle: "data:twinkle" });
  expect(css).toMatch(/#edge-frame\s*\{[^}]*pointer-events: none/);
  expect(css).toMatch(/\.ef\.top\s*\{[^}]*height: 12px/);
  expect(css).toMatch(/\.ef\.left\s*\{[^}]*width: 12px/);
  expect(css).toMatch(/\.ef\s*\{[^}]*background-image: url\("data:stars"\)/);
  // the inner 4px is a 2×2 checker (a 4px tile of 2px squares), never a gradient
  expect(css).toMatch(/\.ef-dither\s*\{[^}]*mask-image: url\([^}]*mask-size: 4px 4px/);
  expect(css).toMatch(/\.top \.ef-dither\s*\{[^}]*height: 4px/);
  const rules = css.split("\n").filter((l) => /#edge-frame|\.ef/.test(l));
  expect(rules.length).toBeGreaterThanOrEqual(10);
  expect(rules.join("\n")).not.toMatch(/gradient/);
});
