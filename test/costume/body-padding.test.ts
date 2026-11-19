import { expect, test } from "bun:test";
import { addPageSheet } from "../../src/content/costume/body-padding";
import { themeFor } from "../../src/content/costume/page-theme";
import { pageCss, setup } from "./helpers";

test("page sheet carries restyle rules and is the only sheet added", () => {
  const { win, doc } = setup();
  const own = new win.CSSStyleSheet() as unknown as CSSStyleSheet;
  doc.adoptedStyleSheets = [own];
  const page = addPageSheet(doc);
  page.update(40, 0);
  page.set({ theme: themeFor("#ffffff"), tint: { left: 100, top: 50, width: 500, height: 900 }, frame: { left: 94, top: 44, width: 512, height: 912 } });
  expect(doc.adoptedStyleSheets).toHaveLength(2);
  expect(doc.adoptedStyleSheets[0]).toBe(own);
  const css = pageCss(doc);
  expect(css).toContain("--hg-lift: 0px");
  expect(css).toContain("padding-top: calc(5px + 48px) !important");
  expect(css).toContain('font-family: "Times New Roman"');
  expect(css).toContain("color: #0000ff !important");
  expect(css).toMatch(/html::before\s*\{[^}]*mix-blend-mode: multiply/);
  expect(css).toMatch(/html::after\s*\{[^}]*border-color: #9999cc #333366 #333366 #9999cc/);
});

test("theme change rebuilds the sheet", () => {
  const { doc } = setup();
  const page = addPageSheet(doc);
  page.set({ theme: themeFor("#ffffff"), tint: { left: 0, top: 0, width: 10, height: 10 } });
  const sheet = doc.adoptedStyleSheets.at(-1);
  expect(pageCss(doc)).toContain("#0000ff");
  page.set({ theme: themeFor("#000000"), tint: null });
  expect(doc.adoptedStyleSheets.at(-1)).toBe(sheet!);
  const css = pageCss(doc);
  expect(css).toContain("#66ccff");
  expect(css).not.toContain("#0000ff");
  expect(css).not.toContain("html::before");
});

test("scroll padding keeps focused and anchored content clear of the bands and the bottom overlay", () => {
  const { doc } = setup({ html: `<html><head><style>html{scroll-padding-top:10px}body{padding:0}</style></head><body><p>x</p></body></html>` });
  const page = addPageSheet(doc);
  page.update(170, 30); // the HUD plus the docked graveyard strip, and a 30px cookie bar
  const css = pageCss(doc);
  expect(css).toMatch(/:root \{[^}]*scroll-padding-top: calc\(10px \+ 48px\) !important/);
  expect(css).toMatch(/:root \{[^}]*scroll-padding-bottom: calc\(0px \+ 170px \+ 16px \+ var\(--hg-lift\)\) !important/);
  expect(css).toContain("--hg-lift: 30px");
  expect(css).toContain("padding-bottom: calc(0px + 170px + 16px + var(--hg-lift)) !important");
});

test("full-overlay adds 12px inline padding", () => {
  const { doc } = setup({ html: `<html><head><style>body{padding:0 3px}</style></head><body><p>x</p></body></html>` });
  const page = addPageSheet(doc);
  expect(pageCss(doc)).not.toContain("padding-left");
  page.set({ overlay: true });
  const css = pageCss(doc);
  expect(css).toContain("padding-left: calc(3px + 12px) !important");
  expect(css).toContain("padding-right: calc(3px + 12px) !important");
  page.set({ overlay: false });
  expect(pageCss(doc)).not.toContain("padding-left");
});

test("remove restores adoptedStyleSheets in order", () => {
  const { win, doc } = setup();
  const a = new win.CSSStyleSheet() as unknown as CSSStyleSheet;
  const b = new win.CSSStyleSheet() as unknown as CSSStyleSheet;
  doc.adoptedStyleSheets = [a, b];
  const page = addPageSheet(doc);
  page.set({ theme: themeFor("#ffffff") });
  expect(doc.adoptedStyleSheets).toHaveLength(3);
  page.remove();
  expect(doc.adoptedStyleSheets).toEqual([a, b]);
});
