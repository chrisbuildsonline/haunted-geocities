import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { curseSpot, firstLine, lastLine, lineRects, mountCurses } from "../../src/content/costume/curses";
import type { Rect, Slot } from "../../src/content/costume/ghosts";
import { detectDarkPatterns, type DarkPattern } from "../../src/content/dark-patterns";
import { BADGE_SKULL, BADGE_SKULL_LEGEND, curseBadgeSvg } from "../../src/content/costume/art";
import { costumeCss } from "../../src/content/costume/styles";
import { PALETTE as P } from "../../src/content/costume/tokens";

const css = costumeCss({ stars: "", twinkle: "" });
const WEB_SAFE = /^#([03369cf]{2}){3}$/i;
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("badge art and CSS (req 40, 45, 59)", () => {
  test("BADGE_SKULL is 6x6 with web-safe colours", () => {
    expect(BADGE_SKULL).toHaveLength(6);
    for (const row of BADGE_SKULL) expect(row).toHaveLength(6);
    for (const c of Object.values(BADGE_SKULL_LEGEND)) expect(c).toMatch(WEB_SAFE);
    expect(BADGE_SKULL_LEGEND).toEqual({ W: P.ghostWhite, k: P.ink });
  });
  test("curseBadgeSvg is 12x12 with pixelated crisp edges", () => {
    const svg = curseBadgeSvg();
    expect(svg).toContain('width="12" height="12" viewBox="0 0 12 12"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });
  test("CSS: 18px badge, #ff9900 ground, black 1px border, 2px hard shadow, bold 11px Comic Sans", () => {
    expect(css).toMatch(/\.curse-badge \{[^}]*position: absolute;[^}]*height: 18px;[^}]*background: #ff9900;[^}]*color: #000000;[^}]*border: 1px solid #000000;[^}]*box-shadow: 2px 2px 0 #000000;[^}]*font: bold 11px\/16px "Comic Sans MS"/);
    expect(css).toMatch(/\.curse-badge \{[^}]*pointer-events: auto;/);
    expect(css).toMatch(/\.curse-badge svg \{[^}]*image-rendering: pixelated;/);
    expect(css).toMatch(/\.curse-card \.quote \{[^}]*overflow-wrap: anywhere;/);
  });
  test("CSS: focus ring is the costume ring", () => {
    expect(css).toMatch(/\.curse-badge:focus-visible \{ outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 2px 2px 0 #000000, 0 0 0 5px #000000;/);
  });
  test("badge text contrast is at least 4.5:1", () => {
    expect(contrast(P.ink, P.curse)).toBeGreaterThanOrEqual(4.5);
  });
  test("badge text meets 4.5:1 against its ground", () => {
    expect(contrast("#000000", "#ff9900")).toBeGreaterThanOrEqual(4.5);
  });
});

// ---- placement and mounting (req 41-47) ----
const R = (left: number, top: number, w: number, h: number): Rect & { width: number; height: number } => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });

describe("curseSpot (req 41, 42)", () => {
  const last = R(100, 200, 300, 20);
  test("spot a: 4px right of the last line box, centred", () => {
    expect(curseSpot(last, last, 80, 1280, [last], [])).toEqual({ x: 404, y: 201 });
  });
  test("spot b when a would leave the viewport", () => {
    expect(curseSpot(last, last, 80, 450, [last], [])).toEqual({ x: 100, y: 178 });
  });
  test("spot b when a would cross text", () => {
    const text = [last, R(410, 195, 100, 30)];
    expect(curseSpot(last, last, 80, 1280, text, [])).toEqual({ x: 100, y: 178 });
  });
  test("spot c: the lane slot at the same y, nearest edge", () => {
    const text = [last, R(410, 195, 100, 30), R(90, 170, 200, 30)];
    const slots: Slot[] = [
      { side: "left", x: 0, y: 160, w: 100 },
      { side: "right", x: 1180, y: 160, w: 100 },
    ];
    expect(curseSpot(last, last, 80, 1280, text, slots)).toEqual({ x: 20, y: 201 });
  });
  test("null when no spot fits", () => {
    const text = [last, R(410, 195, 100, 30), R(90, 170, 200, 30)];
    expect(curseSpot(last, last, 80, 1280, text, [])).toBeNull();
    expect(curseSpot(last, last, 80, 1280, text, [{ side: "left", x: 0, y: 0, w: 100 }])).toBeNull();
  });
  test("a spot never intersects a text rect", () => {
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    for (let i = 0; i < 300; i++) {
      const text = Array.from({ length: 4 }, () => R(rnd(600), rnd(300), 20 + rnd(300), 10 + rnd(30)));
      const l = text[0]!;
      const w = 60 + rnd(40);
      const spot = curseSpot(l, l, w, 700, text.slice(1), []);
      if (!spot) continue;
      expect(text.slice(1).some((r) => r.left < spot.x + w && r.right > spot.x && r.top < spot.y + 18 && r.bottom > spot.y)).toBe(false);
      expect(spot.x + w).toBeLessThanOrEqual(700);
    }
  });
  test("spots are whole pixels", () => {
    const l = R(100.4, 200.3, 300.2, 19.5);
    const spot = curseSpot(l, l, 80, 1280, [], [])!;
    expect(Number.isInteger(spot.x) && Number.isInteger(spot.y)).toBe(true);
  });
  test("first and last line pick by top/left and bottom/right", () => {
    const rs = [R(50, 40, 10, 10), R(10, 20, 10, 10), R(10, 40, 90, 10)];
    expect(firstLine(rs)).toBe(rs[1]!);
    expect(lastLine(rs)).toBe(rs[0]!.right > rs[2]!.right ? rs[0]! : rs[2]!);
  });
});

const windows: Window[] = [];
// happy-dom's classes are shared between windows: put back what a test replaces.
const base = new Window() as any;
const originals = {
  rects: base.Range.prototype.getClientRects,
  animate: base.Element.prototype.animate,
  offsetWidth: Object.getOwnPropertyDescriptor(base.HTMLElement.prototype, "offsetWidth"),
};
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
  base.Range.prototype.getClientRects = originals.rects;
  base.Element.prototype.animate = originals.animate;
  if (originals.offsetWidth) Object.defineProperty(base.HTMLElement.prototype, "offsetWidth", originals.offsetWidth);
  else delete base.HTMLElement.prototype.offsetWidth;
});

/** A happy-dom page; `rects` answers Range rects per selected node (the element's contents). */
function setup(html: string, opts: { io?: boolean } = {}) {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  win.document.write(`<!doctype html><html><body>${html}<div id="markers"></div></body></html>`);
  const doc = win.document as unknown as Document;
  const rects = new Map<Node, Rect[]>();
  (win as any).Range.prototype.getClientRects = function (this: Range) {
    return rects.get(this.commonAncestorContainer) ?? [];
  };
  const animations: { el: HTMLElement; kf: unknown; o: any }[] = [];
  (win.Element.prototype as any).animate = function (this: HTMLElement, kf: unknown, o: unknown) {
    animations.push({ el: this, kf, o });
    return { finished: Promise.resolve(), cancel() {}, finish() {} };
  };
  Object.defineProperty(win.HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 80 });
  const observers: { cb: (e: any[]) => void; observed: Element[]; disconnected: boolean }[] = [];
  if (opts.io) {
    (win as any).IntersectionObserver = class {
      rec = { cb: (_: any[]) => {}, observed: [] as Element[], disconnected: false };
      constructor(cb: (e: any[]) => void) {
        this.rec.cb = cb;
        observers.push(this.rec);
      }
      observe(el: Element) {
        this.rec.observed.push(el);
      }
      unobserve(el: Element) {
        this.rec.observed = this.rec.observed.filter((e) => e !== el);
      }
      disconnect() {
        this.rec.disconnected = true;
      }
    };
  }
  const raf: (() => void)[] = [];
  (win as any).requestAnimationFrame = (cb: () => void) => raf.push(cb);
  (win as any).cancelAnimationFrame = () => void (raf.length = 0);
  return { win, doc, rects, animations, observers, raf, markers: doc.getElementById("markers")! };
}
const pat = (kind: DarkPattern["kind"], element: Element, snippet = "Only 2 left"): DarkPattern => ({ kind, element, snippet });
const noSlots = () => [] as Slot[];
const opts = { slots: noSlots, fade: () => false, onOpen() {} };
const strip = (html: string) => html.replace(/<div id="markers">.*<\/div>/s, "");

describe("lineRects (req 42)", () => {
  test("lineRects uses range rects, not the block box", () => {
    const { doc, rects } = setup(`<p id="p">Only 2 left</p>`);
    const p = doc.getElementById("p")!;
    p.getClientRects = () => [R(0, 0, 1000, 60)] as any;
    rects.set(p, [R(10, 10, 80, 20), R(10, 30, 0, 20), R(10, 50, 5, 0)]);
    expect(lineRects(p)).toHaveLength(1);
    expect(lineRects(p)[0]!.right - lineRects(p)[0]!.left).toBe(80);
  });
  test("empty list when the element is not rendered", () => {
    const { doc } = setup(`<p id="p">Only 2 left</p>`);
    expect(lineRects(doc.getElementById("p")!)).toEqual([]);
  });
});

describe("mountCurses (req 40, 43-47)", () => {
  const two = (s: ReturnType<typeof setup>) => {
    const [a, b] = ["a", "b"].map((id) => s.doc.getElementById(id)!);
    s.rects.set(a!, [R(100, 100, 200, 20)]);
    s.rects.set(b!, [R(100, 300, 200, 20)]);
    return [a!, b!] as const;
  };
  const HTML = `<p id="a">Only 2 left</p><p id="b">Offer ends in 3 hours</p>`;

  test("one button per pattern in #markers with CURSED! and an aria-label", () => {
    const s = setup(HTML);
    const [a, b] = two(s);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a), pat("countdown", b, "Offer ends in 3 hours")]);
    const btns = [...s.markers.querySelectorAll("button.curse-badge")] as HTMLButtonElement[];
    expect(btns.map((x) => x.dataset.kind)).toEqual(["scarcity", "countdown"]);
    expect(btns[0]!.textContent).toBe("CURSED!");
    expect(btns[0]!.type).toBe("button");
    expect(btns[0]!.getAttribute("aria-label")).toBe("Cursed: Fake scarcity: Only 2 left");
    expect(btns[0]!.style.left).toBe("304px");
    badges.stop();
  });
  test("a badge that arrives late is placed in page order", () => {
    const s = setup(HTML);
    const [a, b] = two(s);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("countdown", b)]);
    badges.update([pat("scarcity", a), pat("countdown", b)]);
    expect([...s.markers.querySelectorAll<HTMLElement>("button")].map((x) => x.dataset.kind)).toEqual(["scarcity", "countdown"]);
    badges.stop();
  });
  test("badge is a focusable button that calls onOpen on click", () => {
    const s = setup(HTML);
    const [a] = two(s);
    const opened: unknown[] = [];
    const badges = mountCurses(s.markers, { ...opts, onOpen: (c, el) => opened.push([c, el.className]) });
    badges.update([pat("scarcity", a)]);
    const btn = s.markers.querySelector("button")!;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.tabIndex).toBe(0);
    btn.click();
    expect(opened).toEqual([[{ kind: "scarcity", snippet: "Only 2 left" }, "curse-badge"]]);
  });
  test("update removes badges whose pattern left the list and keeps the others", () => {
    const s = setup(HTML);
    const [a, b] = two(s);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a), pat("countdown", b)]);
    const first = s.markers.querySelector("button")!;
    badges.update([pat("scarcity", a)]);
    expect(s.markers.querySelectorAll("button")).toHaveLength(1);
    expect(s.markers.querySelector("button")).toBe(first);
  });
  test("a badge for an element that is off screen is display:none", () => {
    const s = setup(HTML, { io: true });
    const [a, b] = two(s);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a), pat("countdown", b)]);
    s.observers[0]!.cb([{ target: a, isIntersecting: false }]);
    const [x, y] = [...s.markers.querySelectorAll<HTMLElement>("button")];
    expect(x!.style.display).toBe("none");
    expect(y!.style.display).toBe("");
  });
  test("the observer only changes the badge, never the page element", () => {
    const s = setup(HTML, { io: true });
    const [a, b] = two(s);
    const before = strip(s.doc.body.innerHTML);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a), pat("countdown", b)]);
    s.observers[0]!.cb([{ target: a, isIntersecting: false }]);
    badges.stop();
    expect(strip(s.doc.body.innerHTML)).toBe(before);
  });
  test("scroll and resize cause one rAF pass", () => {
    const s = setup(HTML);
    const [a] = two(s);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a)]);
    s.win.dispatchEvent(new s.win.Event("scroll"));
    s.win.dispatchEvent(new s.win.Event("resize"));
    s.win.dispatchEvent(new s.win.Event("scroll"));
    expect(s.raf).toHaveLength(1);
    s.rects.set(a, [R(100, 150, 200, 20)]);
    s.raf[0]!();
    expect(s.markers.querySelector<HTMLElement>("button")!.style.top).toBe("151px");
  });
  test("a badge with no spot is display:none", () => {
    const s = setup(HTML);
    const [a] = two(s);
    s.rects.set(a, []); // not rendered
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a)]);
    expect(s.markers.querySelector<HTMLElement>("button")!.style.display).toBe("none");
  });
  test("a late badge fades in 200ms linear", () => {
    const s = setup(HTML);
    const [a] = two(s);
    mountCurses(s.markers, { ...opts, fade: () => true }).update([pat("scarcity", a)]);
    expect(s.animations).toHaveLength(1);
    expect(s.animations[0]!.kf).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(s.animations[0]!.o).toEqual({ duration: 200, easing: "linear" });
  });
  test("no animation when fade() is false", () => {
    const s = setup(HTML);
    const [a] = two(s);
    mountCurses(s.markers, opts).update([pat("scarcity", a)]);
    expect(s.animations).toHaveLength(0);
  });
  test("reduced motion: late badges appear with no animation", () => {
    // render.ts passes fade: () => settled && !motion.matches, so reduced motion is fade() === false
    const s = setup(HTML);
    const [a, b] = two(s);
    const reduced = true;
    const badges = mountCurses(s.markers, { ...opts, fade: () => !reduced });
    badges.update([pat("scarcity", a)]);
    badges.update([pat("scarcity", a), pat("countdown", b)]);
    expect(s.animations).toHaveLength(0);
    expect(s.markers.querySelectorAll("button")).toHaveLength(2);
  });
  test("stop removes badges, disconnects the observer, cancels the frame and removes both listeners", () => {
    const s = setup(HTML, { io: true });
    const [a] = two(s);
    const badges = mountCurses(s.markers, opts);
    badges.update([pat("scarcity", a)]);
    s.win.dispatchEvent(new s.win.Event("scroll"));
    expect(s.raf).toHaveLength(1);
    badges.stop();
    expect(s.raf).toHaveLength(0);
    expect(s.observers[0]!.disconnected).toBe(true);
    expect(s.markers.children).toHaveLength(0);
    s.win.dispatchEvent(new s.win.Event("scroll"));
    s.win.dispatchEvent(new s.win.Event("resize"));
    expect(s.raf).toHaveLength(0);
  });
  test("badge shows the dotted #ffff66 focus ring with the black halo", () => {
    expect(css).toContain(".curse-badge:focus-visible { outline: 2px dotted #ffff66; outline-offset: 2px;");
    expect(css).toContain("0 0 0 5px #000000; }");
  });
});

describe("badges never touch the page (req 27, 29)", () => {
  const FORM = `<p id="a">Only 2 left</p><label id="l"><input type="checkbox" name="news" checked> Send me the newsletter</label>`;
  test("outerHTML is unchanged after mount, place and stop", () => {
    const s = setup(FORM);
    const before = strip(s.doc.body.innerHTML);
    const found = detectDarkPatterns(s.doc, "hg-crypt");
    s.rects.set(s.doc.getElementById("a")!, [R(10, 10, 80, 20)]);
    const badges = mountCurses(s.markers, opts);
    badges.update(found);
    badges.place();
    badges.stop();
    expect(strip(s.doc.body.innerHTML)).toBe(before);
  });
  test("clicking a badge dispatches no event on the page element, and a checked box stays checked", () => {
    const s = setup(FORM);
    const found = detectDarkPatterns(s.doc, "hg-crypt");
    expect(found.length).toBeGreaterThan(1);
    const events: string[] = [];
    for (const p of found) for (const t of ["click", "change", "input", "focus"]) p.element.addEventListener(t, () => events.push(t));
    const badges = mountCurses(s.markers, opts);
    badges.update(found);
    for (const b of s.markers.querySelectorAll("button")) (b as HTMLElement).click();
    expect(events).toEqual([]);
    const box = s.doc.querySelector<HTMLInputElement>("input[name=news]")!;
    expect(box.checked).toBe(true);
    expect(box.hasAttribute("checked")).toBe(true);
  });
});
