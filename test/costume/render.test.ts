import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { byId, pageCss, setup, stubMain } from "./helpers";

const rule = (css: string, sel: string) => css.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("column is recomputed after restyle", () => {
  const { win, doc } = setup();
  // Times New Roman sets the column wider than the page's own font did.
  stubMain(win, () => (pageCss(doc).includes("Times New Roman") ? { left: 300, right: 980, top: 60, bottom: 700 } : { left: 500, right: 780, top: 60, bottom: 400 }));
  renderCostume(doc);
  const css = pageCss(doc);
  expect(rule(css, "html::before")).toContain("left: 296px");
  expect(rule(css, "html::before")).toContain("width: 688px");
  expect(rule(css, "html::after")).toContain("left: 290px");
});

test("375px page: edge frame shown, guestbook frame hidden, tint and restyle applied", () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  expect(byId(root, "edge-frame")!.hidden).toBe(false);
  expect([...root.querySelectorAll<HTMLElement>(".gutter")].every((g) => g.hidden)).toBe(true);
  const css = pageCss(doc);
  expect(css).not.toContain("html::after");
  expect(rule(css, "html::before")).toContain("mix-blend-mode: multiply");
  expect(css).toContain('font-family: "Times New Roman"');
  expect(css).toContain("padding-left: calc(0px + 12px) !important");
});

test("1280px page: guestbook frame drawn, edge frame hidden", () => {
  const { win, doc } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  expect(byId(root, "edge-frame")!.hidden).toBe(true);
  const css = pageCss(doc);
  expect(css).toContain("html::after");
  expect(css).not.toContain("padding-left");
  // the gutters stop short of the frame's outer line, so the frame is never under the starfield
  const left = root.querySelector<HTMLElement>(".gutter.left")!;
  expect(parseFloat(left.style.width)).toBe(300 - 11);
});

test("costume host never intercepts pointer hits", () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  // The new layers are decorative: aria-hidden, no focusable parts, no pointer events of their own.
  const edge = byId(root, "edge-frame")!;
  expect(edge.closest("[aria-hidden=true]")).not.toBeNull();
  expect(edge.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  for (const sel of ["html::before"]) expect(rule(pageCss(doc), sel)).toContain("pointer-events: none !important");
  // Every page link, button and form control is still what a hit at its position finds.
  for (const el of doc.querySelectorAll("a, button, input")) {
    const r = el.getBoundingClientRect();
    const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    expect(hit?.localName).not.toBe("hg-crypt");
  }
});
