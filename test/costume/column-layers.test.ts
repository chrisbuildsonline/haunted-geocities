import { expect, test } from "bun:test";
import { columnLayersCss, frameBox, tintBox } from "../../src/content/costume/column-layers";
import { renderCostume } from "../../src/content/costume/render";
import { DARK, flush, pageCss, setup, stubMain } from "./helpers";

const rule = (css: string, sel: string) => css.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("frame has 6px ridge colours, 1px #000000 line and #6633cc glow", () => {
  const css = columnLayersCss({ tint: null, frame: { left: 90, top: 40, width: 520, height: 900 }, hidden: false });
  const frame = rule(css, "html::after");
  expect(frame).toContain("left: 90px");
  expect(frame).toContain("width: 520px");
  // outer 3px band light top-left / dark bottom-right, inner 3px band reversed: a 6px ridge
  expect(frame).toContain("border: 3px solid");
  expect(frame).toContain("border-color: #9999cc #333366 #333366 #9999cc");
  expect(frame).toContain("inset 3px 3px 0 #333366, inset -3px -3px 0 #9999cc");
  expect(frame).toContain("0 0 0 1px #000000");
  expect(frame).toContain("0 0 6px 1px #6633cc");
  expect(frame).toContain("background: none");
});

test("frame and tint follow scroll and resize", async () => {
  // Boxes are in document coordinates, top to bottom of the document, so scrolling never moves them on the page.
  const span = { left: 300, right: 980, height: 2400 };
  expect(tintBox(span, 1280)).toEqual({ left: 296, top: 0, width: 688, height: 2400 });
  expect(frameBox(span, 1280)).toEqual({ left: 290, top: 0, width: 700, height: 2400 });
  // They stay inside the page width.
  expect(tintBox({ left: 2, right: 798, height: 900 }, 800)).toEqual({ left: 0, top: 0, width: 800, height: 900 });
  expect(frameBox({ left: 2, right: 798, height: 900 }, 800)).toEqual({ left: 0, top: 0, width: 800, height: 900 });

  // A resize that moves the column moves the frame with it. The look's 960px table (160-1120 at 1280) is
  // part of the column, so the frame goes round the table and round any text wider than it.
  const { win, doc } = setup();
  let col = { left: 300, right: 980, top: 60, bottom: 700 };
  stubMain(win, () => col);
  renderCostume(doc);
  expect(rule(pageCss(doc), "html::after")).toContain("left: 150px");
  col = { left: 100, right: 700, top: 60, bottom: 700 };
  win.dispatchEvent(new win.Event("resize"));
  await new Promise((r) => win.requestAnimationFrame(r));
  await flush();
  expect(rule(pageCss(doc), "html::after")).toContain("left: 90px");
});

test("the tint is the light page's own background, behind its content; nothing is laid over the page", () => {
  const light = setup();
  stubMain(light.win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  renderCostume(light.doc);
  const css = pageCss(light.doc);
  expect(css).toContain("body { background: #ffffcc content-box !important; }");
  expect(css).toMatch(/html \{ background: #000033 url\("data:image\/svg\+xml,[^"]+"\) repeat fixed !important; \}/);
  expect(css).not.toContain("html::before");
  expect(css).not.toContain("mix-blend-mode: multiply");
  // the frame is under the page (z-index -1)
  expect(rule(css, "html::after")).toContain("z-index: -1 !important");
  const dark = setup({ html: DARK });
  stubMain(dark.win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  renderCostume(dark.doc);
  const dcss = pageCss(dark.doc);
  expect(dcss).not.toContain("body { background:");
  expect(dcss).not.toContain("html::before");
  expect(dcss).toContain("html::after"); // the frame is on dark pages too
});

test("both layers have pointer-events none", () => {
  const css = columnLayersCss({ tint: { left: 0, top: 0, width: 10, height: 10 }, frame: { left: 0, top: 0, width: 20, height: 20 }, hidden: false });
  for (const sel of ["html::before", "html::after"]) {
    expect(rule(css, sel)).toContain("pointer-events: none !important");
    expect(rule(css, sel)).toContain('content: "" !important');
  }
});
