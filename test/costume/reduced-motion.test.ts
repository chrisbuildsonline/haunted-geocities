import { expect, test } from "bun:test";
import { columnLayersCss } from "../../src/content/costume/column-layers";
import { renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { pageCss, setup, stubMain } from "./helpers";

test("column layers never animate or transition", () => {
  // The edge frame opts out of every animation and transition, reduced motion or not.
  const css = costumeCss({ stars: "data:stars", twinkle: "data:twinkle" });
  expect(css).toMatch(/#edge-frame, #edge-frame \*\s*\{\s*animation: none !important; transition: none !important;\s*\}/);
  expect(css.indexOf("#edge-frame, #edge-frame *")).toBeGreaterThan(css.indexOf(".reduced-motion *"));
  // Tint and frame: no animation, and their only transition (the Hide fade) is off under reduced motion.
  const layers = columnLayersCss({ tint: { left: 0, top: 0, width: 9, height: 9 }, frame: { left: 0, top: 0, width: 9, height: 9 }, hidden: false });
  expect(layers).not.toContain("animation");
  expect(layers.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^{}]*\{[^}]*\}\s*\}/, "")).not.toContain("transition");

  // Under reduced motion the haunt touches only the overlay root, never the page's pseudo layers,
  // and a live toggle leaves the page sheet as it is.
  const { win, doc, recs, setReduced } = setup({ reduced: true });
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  renderCostume(doc);
  expect(recs.filter((r) => r.el === doc.documentElement)).toHaveLength(0);
  const before = pageCss(doc);
  setReduced(false);
  setReduced(true);
  expect(pageCss(doc)).toBe(before);
});
