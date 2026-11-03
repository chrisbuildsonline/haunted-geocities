import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { TOMB, TOMB_LEGEND } from "../../src/content/costume/art";
import type { Slot } from "../../src/content/costume/ghosts";
import { costumeCss } from "../../src/content/costume/styles";
import { appendPath, markerLabel, markerSpot, mountTombstones, pathSegments, statusText, tombMarkerSvg } from "../../src/content/costume/tombstones";
import { PALETTE as P } from "../../src/content/costume/tokens";
import type { DeadLink } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});
const page = (html = "") => {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  win.document.write(`<!doctype html><html><body>${html}</body></html>`);
  return { win, doc: win.document as unknown as Document };
};

const BLOG = "/blog/2019/the-very-long-haunted-filename-that-must-not-break.html";
const dead = (path: string, status: 404 | 410 = 404): DeadLink =>({ url: `https://haunt.example${path}`, path, status });

describe("TOMB sprite (req 28)", () => {
  test("8×10 art from the stone, shadow, moss and crypt-outline tokens, drawn 16×20 at 2px", () => {
    expect(TOMB).toHaveLength(10);
    for (const row of TOMB) expect(row).toHaveLength(8);
    expect(TOMB_LEGEND).toEqual({ o: P.crypt, G: P.stone, D: P.stoneShadow, M: P.moss });
    expect([...new Set(TOMB.join("").replaceAll(".", ""))].sort()).toEqual(["D", "G", "M", "o"]);
    const svg = tombMarkerSvg();
    expect(svg).toContain('width="16" height="20" viewBox="0 0 16 20"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    for (const c of [P.stone, P.stoneShadow, P.moss]) expect(svg).toContain(`fill="${c}"`);
  });

  test("CSS: 16×20 focusable marker with the costume ring and pixelated art", () => {
    const css = costumeCss({ stars: "", twinkle: "" });
    expect(css).toMatch(/\.tomb-marker \{[^}]*position: absolute;[^}]*width: 16px;[^}]*height: 20px;[^}]*pointer-events: auto;/);
    expect(css).toMatch(/\.tomb-marker svg \{[^}]*image-rendering: pixelated;/);
    expect(css).toMatch(/\.tomb-marker:focus-visible \{ outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000;/);
  });
});

describe("labels and path text (req 34, 37-40)", () => {
  test("aria-label is 'Dead link: <path>, <status>'", () => {
    expect(markerLabel(dead("/missing.html"))).toBe("Dead link: /missing.html, 404");
    expect(markerLabel(dead("/gone/", 410))).toBe("Dead link: /gone/, 410");
  });

  test("status lines", () => {
    expect(statusText(404)).toBe("404 · Not Found");
    expect(statusText(410)).toBe("410 · Gone");
  });

  test("segments keep their '/' and split after every one", () => {
    expect(pathSegments(BLOG)).toEqual(["/", "blog/", "2019/", "the-very-long-haunted-filename-that-must-not-break.html"]);
    expect(pathSegments("/gone/")).toEqual(["/", "gone/"]);
    expect(pathSegments("/")).toEqual(["/"]);
  });

  test("appendPath: one text node per segment, a <wbr> after every '/', never parsed as HTML", () => {
    const { doc } = page();
    const p = doc.createElement("p");
    appendPath(p, BLOG);
    expect(p.textContent).toBe(BLOG);
    expect(p.querySelectorAll("wbr")).toHaveLength(3);
    const segs = [...p.querySelectorAll(".seg")];
    expect(segs.map((s) => s.textContent)).toEqual(pathSegments(BLOG));
    for (const s of segs) {
      expect(s.querySelectorAll("*")).toHaveLength(1); // the <bdi> holding one text node
      expect(s.firstElementChild!.childNodes).toHaveLength(1);
      expect(s.firstElementChild!.firstChild!.nodeType).toBe(3);
      const next = s.nextSibling as Element | null;
      if (s.textContent!.endsWith("/")) expect(next?.localName).toBe("wbr");
      else expect(next).toBeNull();
    }
    const evil = doc.createElement("p");
    appendPath(evil, "/<img src=x onerror=alert(1)>/a.html");
    expect(evil.querySelector("img")).toBeNull();
    expect(evil.textContent).toBe("/<img src=x onerror=alert(1)>/a.html");
  });

  test("CSS: path clamps at 3 lines and breaks only at '/'; a segment never breaks and ellipsises at its start", () => {
    const css = costumeCss({ stars: "", twinkle: "" });
    const path = css.match(/\.tombstone-card \.path \{[^}]*\}/)![0];
    for (const d of ["-webkit-line-clamp: 3", "overflow-wrap: normal", "word-break: keep-all", "font-size: 13px"]) expect(path).toContain(d);
    const seg = css.match(/\.tombstone-card \.seg \{[^}]*\}/)![0];
    for (const d of ["display: inline-block", "max-width: 100%", "direction: rtl", "text-overflow: ellipsis", "white-space: nowrap", "overflow: hidden"]) expect(seg).toContain(d);
  });
});

describe("marker placement maths (req 29-31)", () => {
  const lane = (side: "left" | "right", y: number): Slot => ({ side, x: side === "left" ? 140 : 1044, y, w: 96 });
  const link = { left: 400, right: 480, top: 100, bottom: 118 };

  test("4px after the last rect, vertically centred, on whole pixels", () => {
    expect(markerSpot(link, 1280, [], [])).toEqual({ x: 484, y: 99 });
    expect(markerSpot({ left: 10, right: 20.6, top: 50.2, bottom: 69 }, 1280, [], [])).toEqual({ x: 25, y: 50 });
  });

  test("the link's own text before it does not count, page text where it would sit does", () => {
    expect(markerSpot(link, 1280, [link], [])).toEqual({ x: 484, y: 99 });
    const after = { left: 482, right: 600, top: 100, bottom: 118 };
    expect(markerSpot(link, 1280, [link, after], [])).toBeNull();
    const lineBelow = { left: 300, right: 700, top: 126, bottom: 144 };
    expect(markerSpot(link, 1280, [lineBelow], [])).toEqual({ x: 484, y: 99 });
  });

  test("off the viewport or over text: the nearest gutter lane at the same y, at its inner edge", () => {
    const edge = { left: 1200, right: 1270, top: 300, bottom: 318 };
    expect(markerSpot(edge, 1280, [], [lane("left", 260), lane("right", 260)])).toEqual({ x: 1044, y: 299 });
    const after = { left: 482, right: 600, top: 100, bottom: 118 };
    expect(markerSpot(link, 1280, [after], [lane("left", 80), lane("right", 80)])).toEqual({ x: 140 + 96 - 16, y: 99 });
  });

  test("no lane covering that y: no marker", () => {
    const edge = { left: 1200, right: 1270, top: 300, bottom: 318 };
    expect(markerSpot(edge, 1280, [], [])).toBeNull();
    expect(markerSpot(edge, 1280, [], [lane("right", 80), lane("right", 400)])).toBeNull();
    expect(markerSpot(edge, 1280, [], [lane("right", 300)])).toBeNull(); // the stone's top (299) would stick out above the slot
    expect(markerSpot(edge, 1280, [], [lane("right", 246)])).toBeNull(); // its bottom (319) would stick out below the slot (246 + 72)
  });
});

describe("the costume wires them (req 11.3, 51, 55)", () => {
  test("dead links get markers in #markers; Un-haunt removes them and leaves the page as it was", async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { chrome: g.chrome, fetch: g.fetch };
    const { win, doc } = page(`<main><p><a href="/missing.html">stall list</a> <a href="/ok">ok</a></p></main>`);
    (win.Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {} });
    (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
    g.chrome = { runtime: { id: "x", sendMessage: async () => undefined } };
    g.fetch = async (url: string) => ({ status: url.endsWith("/missing.html") ? 404 : 200, type: "basic" });
    try {
      const { leaveCostume, renderCostume } = await import("../../src/content/costume/render");
      const before = doc.documentElement.outerHTML;
      const root = renderCostume(doc);
      await new Promise((r) => setTimeout(r, 20));
      expect([...root.querySelectorAll("#markers .tomb-marker")].map((m) => m.getAttribute("aria-label"))).toEqual(["Dead link: /missing.html, 404"]);
      const markers = root.querySelector("#markers")!;
      await leaveCostume(doc);
      expect(markers.children).toHaveLength(0);
      expect(doc.documentElement.outerHTML).toBe(before);
    } finally {
      g.chrome = saved.chrome;
      g.fetch = saved.fetch;
    }
  });
});

describe("markers in #markers (req 28, 32-34, 51)", () => {
  const html = `<main><p><a href="/missing.html">stall list</a></p><p><a href="/gone/#x">old rules</a></p><p><a href="/ok">ok</a></p></main>`;

  test("one focusable button per dead link, labelled, opening its card; cleanup removes everything", () => {
    const { win, doc } = page(html);
    const before = doc.documentElement.outerHTML;
    const markers = doc.createElement("div");
    const opened: [string, HTMLElement][] = [];
    const listeners: string[] = [];
    const add = win.addEventListener.bind(win);
    const remove = win.removeEventListener.bind(win);
    (win as unknown as { addEventListener: unknown }).addEventListener = (t: string, ...rest: unknown[]) => (listeners.push(`+${t}`), (add as any)(t, ...rest));
    (win as unknown as { removeEventListener: unknown }).removeEventListener = (t: string, ...rest: unknown[]) => (listeners.push(`-${t}`), (remove as any)(t, ...rest));
    const tombs = mountTombstones(markers, { slots: () => [], fade: () => false, onOpen: (d, el) => opened.push([d.path, el]) });
    tombs.update([dead("/missing.html"), dead("/gone/", 410)]);
    tombs.update([dead("/missing.html"), dead("/gone/", 410)]); // idempotent
    const buttons = [...markers.querySelectorAll<HTMLButtonElement>("button.tomb-marker")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Dead link: /missing.html, 404", "Dead link: /gone/, 410"]);
    expect(buttons.every((b) => b.type === "button" && b.querySelector("svg"))).toBe(true);
    buttons[1]!.click();
    expect(opened).toEqual([["/gone/", buttons[1]!]]);
    expect(listeners.filter((l) => l.startsWith("+"))).toEqual(expect.arrayContaining(["+scroll", "+resize"]));

    tombs.stop();
    expect(markers.children).toHaveLength(0);
    expect(listeners.filter((l) => l.startsWith("-")).sort()).toEqual(listeners.filter((l) => l.startsWith("+")).map((l) => `-${l.slice(1)}`).sort());
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  test("a dead URL with no link on the page gets no marker", () => {
    const { doc } = page(html);
    const markers = doc.createElement("div");
    const tombs = mountTombstones(markers, { slots: () => [], fade: () => false, onOpen: () => undefined });
    tombs.update([dead("/not-on-this-page.html")]);
    expect(markers.children).toHaveLength(0);
    tombs.stop();
  });

  test("markers fade in only when asked (after the haunt moment, motion allowed)", () => {
    const { win, doc } = page(html);
    const animated: unknown[] = [];
    (win.Element.prototype as unknown as { animate: unknown }).animate = function (kf: unknown, o: unknown) {
      animated.push([kf, o]);
      return { finished: Promise.resolve(), cancel() {}, finish() {} };
    };
    const markers = doc.createElement("div");
    let fade = false;
    const tombs = mountTombstones(markers, { slots: () => [], fade: () => fade, onOpen: () => undefined });
    tombs.update([dead("/missing.html")]);
    expect(animated).toEqual([]);
    fade = true;
    tombs.update([dead("/missing.html"), dead("/gone/", 410)]);
    expect(animated).toEqual([[[{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" }]]);
    tombs.stop();
  });
});
