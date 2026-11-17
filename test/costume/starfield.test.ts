import { expect, test } from "bun:test";
import { buildEdgeFrame, computeContentColumn } from "../../src/content/costume/starfield";
import { costumeCss } from "../../src/content/costume/styles";
import { LAYOUT } from "../../src/content/costume/tokens";
import { domRect, setup } from "./helpers";

test("text wider than the article (a site header) still clears the frame by 16px", () => {
  // article.html at 1280: the article's box is 280-1000 with its text at 300-980, but the 760px
  // header above it puts "The Keeper's Log" at 280 and "Archive" ending at 1000.
  const { doc } = setup({
    html: `<body><header><b>The Keeper's Log</b><nav><a href="/">Home</a><a href="/a">Archive</a></nav></header><article><p>Body</p></article></body>`,
  });
  const at: Record<string, [number, number]> = { "The Keeper's Log": [280, 420], Home: [880, 925], Archive: [941, 1000], Body: [300, 980] };
  const col = computeContentColumn(doc, {
    box: (el) => domRect(el.localName === "article" ? { left: 280, right: 1000, top: 0, bottom: 900 } : { left: 0, right: 0, top: 0, bottom: 0 }),
    textRects: (n) => [domRect({ left: at[n.nodeValue!]![0], right: at[n.nodeValue!]![1], top: 0, bottom: 20 })],
    viewportWidth: 1280,
  });
  // The frame's inner edge is frameGap outside the column.
  const [inLeft, inRight] = [col.left - LAYOUT.frameGap, col.right + LAYOUT.frameGap];
  for (const [l, r] of Object.values(at)) {
    expect(l - inLeft).toBeGreaterThanOrEqual(16);
    expect(inRight - r).toBeGreaterThanOrEqual(16);
  }
  // Text the box already pads by 16px or more widens nothing.
  expect(computeContentColumn(doc, {
    box: (el) => domRect(el.localName === "article" ? { left: 280, right: 1000, top: 0, bottom: 900 } : { left: 0, right: 0, top: 0, bottom: 0 }),
    textRects: () => [domRect({ left: 300, right: 980, top: 0, bottom: 20 })],
    viewportWidth: 1280,
  })).toEqual({ left: 280, right: 1000 });
});

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
