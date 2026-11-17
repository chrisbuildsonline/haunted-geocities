import { expect, test } from "bun:test";
import { columnLayersCss } from "../../src/content/costume/column-layers";
import { renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { flush, pageCss, setup, stubMain, withTrackers } from "./helpers";

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

/** A Resource Timing observer the test can feed after the haunt has settled. */
function lateEntries(win: object) {
  let feed: (names: string[]) => void = () => {};
  Object.defineProperty(win, "PerformanceObserver", {
    configurable: true,
    value: class {
      constructor(cb: (list: { getEntries(): { name: string; startTime: number }[] }) => void) {
        feed = (names) => cb({ getEntries: () => names.map((name, i) => ({ name, startTime: 1000 + i })) });
      }
      observe() {}
      disconnect() {}
    },
  });
  return (names: string[]) => feed(names);
}

test("graveyard sprites have animation none under reduced motion", () => {
  const css = costumeCss({ stars: "a", twinkle: "b" });
  // the lane float (bob, sway, drift) is reused on docked sprites, and the reduced-motion rule stops all of it
  expect(css).toMatch(/\.reduced-motion \*, \.reduced-motion \*::before, \.reduced-motion \*::after\s*\{\s*animation: none !important/);
  expect(css).toMatch(/#graveyard \.stones\s*\{[^}]*scroll-behavior: auto/);
  const { win, doc, setReduced } = setup({ width: 375, reduced: true });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  const croot = root.getElementById("crypt-root")!;
  expect(croot.contains(root.getElementById("graveyard"))).toBe(true);
  expect(croot.classList.contains("reduced-motion")).toBe(true);
  setReduced(false);
  expect(croot.classList.contains("reduced-motion")).toBe(false);
  setReduced(true);
  expect(croot.classList.contains("reduced-motion")).toBe(true);
});

test("no rise for docked sprites under reduced motion", async () => {
  for (const reduced of [true, false]) {
    const { win, doc, recs } = setup({ width: 375, reduced });
    stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
    withTrackers(win);
    const late = lateEntries(win);
    const root = renderCostume(doc);
    await flush(); // the haunt moment (or its reduced fade) settles
    recs.length = 0;
    late(["https://adnxs.com/x.js"]);
    const arrived = root.querySelector('#graveyard .stones > [data-company="Microsoft"]')!;
    expect(arrived).not.toBeNull();
    expect({ reduced, rose: recs.some((r) => r.el === arrived) }).toEqual({ reduced, rose: !reduced });
  }
});
