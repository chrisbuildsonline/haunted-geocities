import { expect, test } from "bun:test";
import { leaveCostume, renderCostume } from "../../src/content/costume/render";
import { pageCss, setup, stubMain } from "./helpers";

test("restyle gone and adoptedStyleSheets equal pre-haunt after unhaunt", async () => {
  const { win, doc, recs } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  const a = new win.CSSStyleSheet() as unknown as CSSStyleSheet;
  const b = new win.CSSStyleSheet() as unknown as CSSStyleSheet;
  doc.adoptedStyleSheets = [a, b];
  const html = doc.documentElement.outerHTML;
  renderCostume(doc);
  expect(doc.adoptedStyleSheets).toHaveLength(3);
  expect(pageCss(doc)).toContain("Times New Roman");
  recs.length = 0;
  await leaveCostume(doc);
  // the tint and frame wipe away behind the ghost before the sheet goes
  expect(recs.some((r) => r.el === doc.documentElement && r.opts.pseudoElement === "::before")).toBe(true);
  expect(doc.querySelector("hg-crypt")).toBeNull();
  expect(doc.adoptedStyleSheets).toEqual([a, b]);
  expect(pageCss(doc)).not.toContain("Times New Roman");
  expect(doc.documentElement.outerHTML).toBe(html);
});
