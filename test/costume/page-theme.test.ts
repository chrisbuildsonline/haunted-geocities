import { expect, test } from "bun:test";
import { contrastRatio, ensureContrast, isDarkPage, pageBackground, relativeLuminance, restyleCss, themeFor, WEB_SAFE } from "../../src/content/costume/page-theme";
import { PAGE } from "../../src/content/costume/tokens";
import { setup } from "./helpers";

const grey = (v: number) => "#" + v.toString(16).padStart(2, "0").repeat(3);
/** The grey level whose luminance is closest to `l`. */
const greyAt = (l: number) => grey([...Array(256).keys()].reduce((best, v) => (Math.abs(relativeLuminance(grey(v)) - l) < Math.abs(relativeLuminance(grey(best)) - l) ? v : best), 0));

test("luminance 0.39 is dark and 0.41 is light", () => {
  const dark = greyAt(0.39);
  const light = greyAt(0.41);
  expect(relativeLuminance(dark)).toBeLessThan(0.4);
  expect(relativeLuminance(light)).toBeGreaterThan(0.4);
  expect(themeFor(dark).dark).toBe(true);
  expect(themeFor(light).dark).toBe(false);
  expect(relativeLuminance("#ffffff")).toBe(1);
  expect(relativeLuminance("#000000")).toBe(0);
});

test("transparent body falls back to html then white", () => {
  const { doc } = setup({ html: `<html style="background:#000033"><body style="background:transparent"><p>x</p></body></html>` });
  expect(pageBackground(doc)).toBe("#000033");
  expect(isDarkPage(doc)).toBe(true);
  const plain = setup({ html: `<html><body><p>x</p></body></html>` }).doc;
  expect(pageBackground(plain)).toBe("#ffffff");
  expect(isDarkPage(plain)).toBe(false);
  const own = setup({ html: `<html style="background:#000000"><body style="background-color:rgb(255, 255, 204)"><p>x</p></body></html>` }).doc;
  expect(pageBackground(own)).toBe("#ffffcc");
});

test("#ff0000 on #ffffff is 4.0:1 and resolves to #cc0000", () => {
  expect(contrastRatio("#ff0000", "#ffffff")).toBeCloseTo(4.0, 1);
  expect(contrastRatio("#ff0000", "#ffffcc")).toBeCloseTo(3.9, 1);
  expect(contrastRatio("#cc0000", "#ffffcc")).toBeGreaterThanOrEqual(5.7);
  expect(ensureContrast("#ff0000", "#ffffff")).toBe(PAGE.hoverFallback);
  expect(ensureContrast("#0000ff", "#ffffcc")).toBe("#0000ff");
  const white = themeFor("#ffffff");
  expect(white).toMatchObject({ dark: false, tint: true, background: "#ffffcc", link: PAGE.link, visited: PAGE.visited, hover: PAGE.hoverFallback });
});

test("every restyled colour is at least 4.5:1 for a sweep of grey backgrounds, light and dark", () => {
  expect(WEB_SAFE).toHaveLength(216);
  let dark = 0;
  for (let v = 0; v <= 255; v++) {
    const t = themeFor(grey(v));
    if (t.dark) dark++;
    for (const c of [t.link, t.visited, t.hover]) {
      expect(WEB_SAFE).toContain(c);
      expect({ [`${c} on ${t.background}`]: contrastRatio(c, t.background) >= 4.5 }).toEqual({ [`${c} on ${t.background}`]: true });
    }
  }
  expect(dark).toBeGreaterThan(100);
  expect(dark).toBeLessThan(200);
  const night = themeFor("#000000");
  expect(night).toMatchObject({ dark: true, tint: false, background: "#000000", link: PAGE.darkLink, visited: PAGE.darkVisited, hover: PAGE.hover });
});

test("restyle css has Times New Roman body, Comic Sans MS h1-h3, link colours", () => {
  const light = restyleCss(themeFor("#ffffff"));
  expect(light).toMatch(/:where\(body,[^{]*\{\s*font-family:\s*"Times New Roman"[^}]*!important/);
  expect(light).toMatch(/:where\(h1, h2, h3,[^{]*\{\s*font-family:\s*"Comic Sans MS"[^}]*!important/);
  expect(light).toMatch(/a:link[^{]*\{[^}]*color:\s*#0000ff !important/);
  expect(light).toMatch(/a:visited[^{]*\{[^}]*color:\s*#990099 !important/);
  expect(light).toMatch(/:hover[^{]*\{[^}]*color:\s*#cc0000 !important/);
  expect(light).toMatch(/a\[href\][^{]*\{[^}]*text-decoration:\s*underline !important/);
  // form controls, code and icon fonts keep their own fonts
  for (const kept of ["input", "textarea", "select", "button", "pre", "code", "kbd", "samp", "svg", '[class*="icon"]', '[aria-hidden="true"]']) {
    expect(light).toContain(kept);
  }
  // a hover colour change never transitions under reduced motion
  expect(light).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none !important/);
  const dark = restyleCss(themeFor("#000000"));
  expect(dark).toContain("color: #66ccff !important");
  expect(dark).toContain("color: #cc99ff !important");
  expect(dark).toContain("color: #ff0000 !important");
});
