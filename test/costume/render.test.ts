import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { byId, domRect, fakeLayout, flush, LANE_ORDER, pageCss, setup, stubMain, withTrackers, type Rect } from "./helpers";

const docked = (root: ShadowRoot) => [...root.querySelectorAll<HTMLElement>("#graveyard .stones > button")].map((b) => b.dataset.company);
const laned = (root: ShadowRoot) => [...root.querySelectorAll<HTMLElement>("#lanes .ghost, #lanes .vampire")].map((b) => b.dataset.company);
const paddingBottom = (doc: Document) => pageCss(doc).match(/padding-bottom:\s*calc\((.*?)\)\s*!important/)?.[1] ?? "";
const NARROW: Rect = { left: 0, right: 375, top: 60, bottom: 700 };
const WIDE: Rect = { left: 300, right: 980, top: 60, bottom: 700 };

/** A haunted page with trackers whose `main` box can be moved, and a resize that waits for the relayout. */
function haunted(width: number, main: Rect, sizes = { hud: 40, graveyard: 80 }) {
  const s = setup({ width });
  let box = main;
  stubMain(s.win, () => box);
  withTrackers(s.win);
  const layout = fakeLayout(s.win as never, sizes);
  // happy-dom never runs animation frames on a document.write() page: the relayout waits a task instead
  (s.win as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
  const root = renderCostume(s.doc);
  const resize = async (w: number, next: Rect) => {
    box = next;
    s.win.happyDOM.setViewport({ width: w, height: 800 });
    s.win.dispatchEvent(new s.win.Event("resize"));
    await flush();
    await new Promise((r) => setTimeout(r, 20));
  };
  return { ...s, root, layout, resize, sizes };
}

test("375px page: the footer graveyard lists every company, the lanes are empty", () => {
  const { root } = haunted(375, NARROW);
  const footer = byId(root, "crypt-footer")!;
  const strip = byId(root, "graveyard")!;
  // in the footer, before the HUD, beside (not inside) the fixed #crypt-root
  expect(strip.parentElement === footer).toBe(true);
  expect(strip.nextElementSibling === byId(root, "hud")).toBe(true);
  expect(byId(root, "crypt-root")!.contains(strip)).toBe(false);
  expect(strip.hidden).toBe(false);
  expect(docked(root)).toEqual(LANE_ORDER);
  expect(laned(root)).toEqual([]);
  const graveyardRule = costumeCss({ stars: "a", twinkle: "b" }).match(/#graveyard\s*\{([^}]*)\}/)![1]!;
  expect(graveyardRule).not.toMatch(/bottom:|position: fixed/);
});

test("lane page: the lanes fill and the footer graveyard still lists them all", () => {
  const { root } = haunted(1280, WIDE);
  expect(byId(root, "graveyard")!.hidden).toBe(false);
  expect(docked(root)).toEqual(LANE_ORDER);
  expect(laned(root)).toEqual(LANE_ORDER);
});

test("resize across the 64px gutter boundary moves the lanes; the graveyard keeps the full roll", async () => {
  const { root, resize } = haunted(1280, WIDE);
  expect([laned(root), docked(root)]).toEqual([LANE_ORDER, LANE_ORDER]);
  await resize(375, NARROW);
  expect([laned(root), docked(root)]).toEqual([[], LANE_ORDER]);
  await resize(1280, WIDE);
  expect([laned(root), docked(root)]).toEqual([LANE_ORDER, LANE_ORDER]);
});

test("no bottom padding at any width: the footer is in flow after the page", async () => {
  const { doc, resize } = haunted(375, NARROW);
  expect(paddingBottom(doc)).toBe("");
  await resize(1280, WIDE);
  expect(paddingBottom(doc)).toBe("");
});

test("the ghost icon follows --hg-lift; the footer does not need to", () => {
  const css = costumeCss({ stars: "a", twinkle: "b" });
  expect(css).toMatch(/#show-tab \{[^}]*bottom: calc\(8px \+ var\(--hg-lift, 0px\)\)/);
  expect(css.slice(css.indexOf("@media (max-width: 400px)"))).toMatch(/#show-tab \{[^}]*bottom: calc\(4px \+ var\(--hg-lift, 0px\)\)/);
  expect(rule(css, "#crypt-footer")).not.toContain("--hg-lift");
});

test("card opened from a footer sprite stays 8px inside the viewport", () => {
  const { root } = haunted(375, NARROW);
  const sprites = [...root.querySelectorAll<HTMLElement>("#graveyard .stones > button")];
  const top = 800 - 80; // a sprite near the bottom of the viewport, the footer scrolled into view
  for (const [i, sprite] of [[0, sprites[0]!], [sprites.length - 1, sprites.at(-1)!]] as const) {
    const left = i === 0 ? 18 : 375 - 18 - 48;
    sprite.getBoundingClientRect = () => domRect({ left, right: left + 48, top, bottom: top + 54 });
    sprite.click();
    const card = root.querySelector<HTMLElement>("#cards .card")!;
    const x = parseFloat(card.style.left);
    const y = parseFloat(card.style.top);
    expect(y).toBeGreaterThanOrEqual(8);
    expect(y + 200).toBeLessThanOrEqual(800 - 8);
    expect(x).toBeGreaterThanOrEqual(8);
    expect(x + 248 + 4).toBeLessThanOrEqual(375 - 8);
    expect(card.querySelector("h2")!.textContent).toBe(i === 0 ? "Criteo" : "Vampire identified");
  }
});

const rule = (css: string, sel: string) => css.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("column is recomputed after restyle", () => {
  const { win, doc } = setup();
  // Times New Roman sets the column wider than the page's own font did.
  // (text wider than the look's 960px table, 160-1120 at 1280, pushes the column out past it on the left)
  stubMain(win, () => (pageCss(doc).includes("Times New Roman") ? { left: 150, right: 1100, top: 60, bottom: 700 } : { left: 500, right: 780, top: 60, bottom: 400 }));
  renderCostume(doc);
  const css = pageCss(doc);
  expect(rule(css, "html::after")).toContain("left: 140px");
  expect(rule(css, "html::after")).toContain("width: 990px");
});

test("375px page: full-overlay mode, guestbook frame hidden, tint (as the body's background) and restyle applied", () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  expect(byId(root, "edge-frame")!.hidden).toBe(false);
  expect([...root.querySelectorAll<HTMLElement>(".gutter")].every((g) => g.hidden)).toBe(true);
  const css = pageCss(doc);
  expect(css).not.toContain("html::after");
  expect(css).not.toContain("html::before");
  expect(css).toContain("body { background: #ffffcc !important; }");
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
  expect(css).not.toContain("calc(0px + 12px)");
  // the gutters (the look's 960px table at 160) stop short of the frame's outer line
  const left = root.querySelector<HTMLElement>(".gutter.left")!;
  expect(parseFloat(left.style.width)).toBe(160 - 11);
});

test("costume host never intercepts pointer hits", () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  // The new layers are decorative: aria-hidden, no focusable parts, no pointer events of their own.
  const edge = byId(root, "edge-frame")!;
  expect(edge.closest("[aria-hidden=true]")).not.toBeNull();
  expect(edge.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  expect(pageCss(doc)).not.toContain("html::before");
  // Every page link, button and form control is still what a hit at its position finds.
  for (const el of doc.querySelectorAll("a, button, input")) {
    const r = el.getBoundingClientRect();
    const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    expect(hit?.localName).not.toBe("hg-crypt");
  }
});
