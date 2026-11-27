import { expect, test } from "bun:test";
import { leaveCostume, renderCostume } from "../../src/content/costume/render";
import { pageCss, setup, stubMain, withTrackers } from "./helpers";

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
  // the frame wipes away behind the ghost before the sheet goes (the tint is the body's own background)
  expect(recs.some((r) => r.el === doc.documentElement && r.opts.pseudoElement === "::after")).toBe(true);
  expect(doc.querySelector("hg-crypt")).toBeNull();
  expect(doc.adoptedStyleSheets).toEqual([a, b]);
  expect(pageCss(doc)).not.toContain("Times New Roman");
  expect(doc.documentElement.outerHTML).toBe(html);
});

test("graveyard gone and adoptedStyleSheets equal pre-haunt after unhaunt", async () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  withTrackers(win);
  const a = new win.CSSStyleSheet() as unknown as CSSStyleSheet;
  doc.adoptedStyleSheets = [a];
  const html = doc.documentElement.outerHTML;
  const root = renderCostume(doc);
  const strip = root.getElementById("graveyard")!;
  expect(strip.hidden).toBe(false);
  expect(pageCss(doc)).toMatch(/padding-top/);
  await leaveCostume(doc);
  expect(strip.isConnected).toBe(false);
  expect(doc.querySelector("hg-crypt")).toBeNull();
  expect(doc.adoptedStyleSheets).toEqual([a]);
  expect(pageCss(doc)).not.toContain("padding-bottom");
  expect(doc.documentElement.outerHTML).toBe(html);
  // a resize after leaving touches nothing (the listeners went with the host)
  win.dispatchEvent(new win.Event("resize"));
  await new Promise((r) => setTimeout(r, 20));
  expect(doc.adoptedStyleSheets).toEqual([a]);
});
