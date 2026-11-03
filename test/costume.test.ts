import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { HOST_TAG } from "../src/content/overlay";
import * as T from "../src/content/costume/tokens";
import { computeContentColumn, gutterWidths, STAR_TILE } from "../src/content/costume/starfield";
import { MARQUEE_LINES, marqueeSeconds, neighborhoodFor, topOffset } from "../src/content/costume/bands";
import { sampleBottomLift, setCounts, setOdometer } from "../src/content/costume/hud";
import { costumeCss } from "../src/content/costume/styles";
import { leaveCostume, renderCostume } from "../src/content/costume/render";

// ---------- helpers ----------

const designTokens = () => {
  const md = readFileSync(join(import.meta.dir, "..", "design", "DESIGN.md"), "utf8");
  const tokens = md.split(/^## /m).find((p) => p.startsWith("Tokens"))!;
  return JSON.parse(tokens.match(/```json\s*\n([\s\S]*?)```/)![1]!);
};

const luminance = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** Every #rgb / #rrggbb (and its url-encoded %23 form) in a string, lower-cased and expanded. */
const hexes = (s: string) =>
  [...s.matchAll(/(?:#|%23)([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi)].map((m) => {
    const h = m[1]!.toLowerCase();
    return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h);
  });

const PAGE = `<!doctype html><html lang="en"><head><title>t</title><style>body{padding:5px 0 7px}</style></head>
<body><header><h1>Hello</h1></header><main><p>Text <a href="/x">link</a></p>
<form action="/x"><input name="q"><button>Go</button></form></main><script>var x=1</script></body></html>`;

type Rec = { el: Element; keyframes: Keyframe[]; opts: KeyframeAnimationOptions };
type Mq = { matches: boolean; listeners: ((e: { matches: boolean }) => void)[] };

/** A happy-dom page with Element.animate recorded and prefers-reduced-motion under test control. */
function setup(opts: { reduced?: boolean } = {}) {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  win.document.write(PAGE);
  const recs: Rec[] = [];
  (win.Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    keyframes: Keyframe[],
    o: KeyframeAnimationOptions,
  ) {
    recs.push({ el: this, keyframes, opts: o });
    return { finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {}, currentTime: 0 };
  };
  const mq: Mq = { matches: !!opts.reduced, listeners: [] };
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q,
    get matches() {
      return q.includes("prefers-reduced-motion") ? mq.matches : false;
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => mq.listeners.push(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      mq.listeners = mq.listeners.filter((l) => l !== fn);
    },
  });
  const doc = win.document as unknown as Document;
  const setReduced = (v: boolean) => {
    mq.matches = v;
    for (const l of mq.listeners) l({ matches: v });
  };
  return { win, doc, recs, mq, setReduced };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const byId = (root: ShadowRoot, id: string) => root.getElementById(id) as HTMLElement | null;
const animsOn = (recs: Rec[], el: Element | null) => recs.filter((r) => r.el === el);
const props = (r: Rec) => r.keyframes.flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite"].includes(k));

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

// ---------- tokens ----------

describe("costume tokens", () => {
  test("the tokens module matches the ## Tokens JSON in design/DESIGN.md", () => {
    const t = designTokens();
    expect(T.PALETTE).toEqual(t.costume.palette);
    expect([...T.HEM_TINTS]).toEqual(t.costume.hemTints);
    expect([...T.FONTS]).toEqual(t.costume.fonts);
    expect(T.PIXEL).toEqual(t.costume.pixel);
    expect(T.SPRITES).toEqual(t.costume.sprites);
    expect(T.LAYOUT).toEqual(t.costume.layout);
    expect(T.HARD_SHADOW).toBe(t.costume.hardShadow);
    expect(T.FOCUS_RING).toBe(t.costume.focusRing);
    expect(T.MOTION).toEqual(t.motion);
  });

  test("the costume CSS uses no hex colour outside the costume palette", () => {
    // #ff9999: the vampire glow's inner highlight, named in DESIGN.md "Vampires" (not a palette token).
    const allowed = new Set<string>([...Object.values(T.PALETTE), ...T.HEM_TINTS, "#ff9999"]);
    const found = hexes(costumeCss({ stars: "data:x", twinkle: "data:y" }));
    expect(found.length).toBeGreaterThan(10);
    expect(found.filter((h) => !allowed.has(h))).toEqual([]);
  });

  test("the rendered shadow markup (pixel art, inline styles) uses no hex colour outside the palette", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const allowed = new Set<string>([...Object.values(T.PALETTE), ...T.HEM_TINTS]);
    const found = hexes(root.innerHTML);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((h) => !allowed.has(h))).toEqual([]);
  });

  test("costume text pairs meet 4.5:1", () => {
    const P = T.PALETTE;
    for (const [fg, bg] of [
      [P.bone, P.crypt], [P.ectoplasm, P.crypt], [P.ectoplasm, P.ink], [P.ink, P.stone], [P.bone, P.cryptViolet],
    ]) {
      expect({ [`${fg}/${bg}`]: contrast(fg!, bg!) >= 4.5 }).toEqual({ [`${fg}/${bg}`]: true });
    }
  });
});

// ---------- starfield ----------

describe("starfield", () => {
  test("the 64×64 tile: #000033 ground, 6 white pixels, 2 yellow 2×2 stars, one 5×5 #ffffcc 4-point twinkle", () => {
    expect(STAR_TILE.size).toBe(64);
    expect(STAR_TILE.ground).toBe(T.PALETTE.crypt);
    const singles = STAR_TILE.pixels.filter((p) => p.color === T.PALETTE.ghostWhite && p.w === 1 && p.h === 1);
    const blocks = STAR_TILE.pixels.filter((p) => p.color === T.PALETTE.star && p.w === 2 && p.h === 2);
    expect(singles).toHaveLength(6);
    expect(blocks).toHaveLength(2);
    expect(STAR_TILE.pixels).toHaveLength(8);
    const tw = STAR_TILE.twinkle;
    expect(tw.every((p) => p.color === T.PALETTE.bone)).toBe(true);
    const xs = tw.flatMap((p) => [p.x, p.x + p.w]);
    const ys = tw.flatMap((p) => [p.y, p.y + p.h]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(5);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(5);
    for (const p of [...STAR_TILE.pixels, ...tw]) {
      expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= 64 && p.y + p.h <= 64).toBe(true);
    }
  });

  const rect = (left: number, right: number, top = 0, bottom = 20) =>
    ({ left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top }) as DOMRect;

  test("the content column starts from main and widens to cover every text rect", () => {
    const { win, doc } = setup();
    windows.push(win);
    const main = doc.querySelector("main")!;
    const h1Text = doc.querySelector("h1")!.firstChild!;
    const col = computeContentColumn(doc, {
      box: (el) => (el === main ? rect(400, 880) : rect(0, 0)),
      textRects: (node) => (node === h1Text ? [rect(360, 700)] : [rect(420, 860)]),
      viewportWidth: 1280,
    });
    expect(col).toEqual({ left: 360, right: 880 });
  });

  test("with no main/article the column starts from the widest block holding over half the text", () => {
    const win = new Window({ url: "https://haunt.example/" });
    windows.push(win);
    win.document.write(
      `<body><div id="nav">Home</div><div id="wrap"><section id="body"><p>${"words ".repeat(40)}</p></section></div></body>`,
    );
    const doc = win.document as unknown as Document;
    const boxes: Record<string, DOMRect> = { nav: rect(0, 1280), wrap: rect(300, 980), body: rect(320, 960) };
    const col = computeContentColumn(doc, {
      box: (el) => boxes[el.id] ?? rect(0, 0),
      textRects: (node) => (node.parentElement?.id === "nav" ? [] : [rect(330, 950)]),
      viewportWidth: 1280,
    });
    expect(col).toEqual({ left: 300, right: 980 });
  });

  test("gutters exist only when one of them is at least 64px", () => {
    expect(gutterWidths({ left: 300, right: 980 }, 1280)).toEqual({ left: 300, right: 300 });
    expect(gutterWidths({ left: 70, right: 1270 }, 1280)).toEqual({ left: 70, right: 10 });
    expect(gutterWidths({ left: 40, right: 1240 }, 1280)).toBeNull();
    expect(gutterWidths({ left: 0, right: 375 }, 375)).toBeNull();
  });

  test("the gutter CSS: tile at .92 opacity, a 16px checker-dithered edge, no gradients", () => {
    const css = costumeCss({ stars: "data:stars", twinkle: "data:twinkle" });
    expect(css).toMatch(/\.gutter\s*\{[^}]*opacity:\s*0?\.92/);
    expect(css).toContain('url("data:stars")');
    expect(css).toMatch(/\.edge\s*\{[^}]*width:\s*16px/);
    expect(css).toMatch(/\.edge\s*\{[^}]*mask-image:\s*url\(/);
    expect(css).not.toMatch(/linear-gradient|conic-gradient/);
  });
});

// ---------- bands ----------

describe("top bands", () => {
  test("neighborhoodFor is a stable Area/Vault/NNNN placeholder per host", () => {
    const a = neighborhoodFor("example.org");
    expect(a).toBe(neighborhoodFor("example.org"));
    expect(a).toMatch(/^(Area51|Heartland|SiliconValley|SunsetStrip|Tokyo|Vienna)\/Vault\/\d{4}$/);
    const many = new Set(["a.com", "b.com", "c.org", "d.net", "e.io", "f.dev"].map(neighborhoodFor));
    expect(many.size).toBeGreaterThan(1);
  });

  test("the bar says 'You are in:' with the host's neighborhood and carries a 48×24 sign", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const bar = byId(root, "neighborhood")!;
    expect(bar.textContent).toContain(`You are in: ${neighborhoodFor("haunt.example")}`);
    const sign = bar.querySelector(".sign") as HTMLElement;
    expect(sign).not.toBeNull();
    expect(sign.getAttribute("role")).toBe("img");
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/\.sign\s*\{[^}]*width:\s*48px;[^}]*height:\s*24px/);
    expect(css).toMatch(/#neighborhood\s*\{[^}]*height:\s*24px[^}]*background:\s*#330066[^}]*color:\s*#ffffcc[^}]*font:\s*13px\s+"Times New Roman"/);
  });

  test("the marquee is a CSS translateX keyframe at 60px/s, never <marquee>", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    expect(root.querySelector("marquee")).toBeNull();
    expect(MARQUEE_LINES.length).toBeGreaterThanOrEqual(2);
    expect(byId(root, "marquee")!.textContent).toContain(MARQUEE_LINES[0]!);
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/@keyframes hg-marquee\s*\{[^}]*translateX/);
    expect(css).toMatch(/#marquee\s*\{[^}]*height:\s*24px[^}]*background-color:\s*#000033[^}]*color:\s*#66ff99[^}]*font:\s*14px\s+"Comic Sans MS"/);
    expect(marqueeSeconds(600)).toBe(10);
    expect(marqueeSeconds(1500)).toBe(25);
  });

  test("the marquee pauses while the tab is hidden", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const croot = byId(root, "crypt-root")!;
    Object.defineProperty(doc, "hidden", { configurable: true, get: () => true });
    doc.dispatchEvent(new win.Event("visibilitychange") as unknown as Event);
    expect(croot.classList.contains("tab-hidden")).toBe(true);
    Object.defineProperty(doc, "hidden", { configurable: true, get: () => false });
    doc.dispatchEvent(new win.Event("visibilitychange") as unknown as Event);
    expect(croot.classList.contains("tab-hidden")).toBe(false);
    expect(costumeCss({ stars: "a", twinkle: "b" })).toMatch(/\.tab-hidden[^{]*\{[^}]*animation-play-state:\s*paused/);
  });

  test("topOffset is 0 with nothing pinned at y=0, else the bottom of the pinned page UI", () => {
    const { win, doc } = setup();
    windows.push(win);
    (doc as unknown as { elementsFromPoint: unknown }).elementsFromPoint = () => [doc.body, doc.documentElement];
    expect(topOffset(doc)).toBe(0);
    const header = doc.querySelector("header")!;
    header.setAttribute("style", "position: fixed; top: 0");
    header.getBoundingClientRect = () => ({ top: 0, bottom: 56, left: 0, right: 1280, width: 1280, height: 56 }) as DOMRect;
    (doc as unknown as { elementsFromPoint: unknown }).elementsFromPoint = () => [doc.querySelector("h1"), header, doc.body];
    expect(topOffset(doc)).toBe(56);
  });
});

// ---------- HUD ----------

describe("HUD", () => {
  test("controls in DOM order: Hide, counts (empty state for now), Souls counted odometer, web ring", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const hud = byId(root, "hud")!;
    const kids = [...hud.children].map((c) => c.className.split(" ")[0]);
    expect(kids.filter((k) => k !== "hud-break")).toEqual(["hide", "counts", "empty", "hits", "ring"]);
    const hide = hud.querySelector("button.hide")!;
    expect(hide.textContent).toBe("Hide");
    expect(hud.querySelector(".counts")!.hasAttribute("hidden")).toBe(true);
    expect(hud.querySelectorAll(".counts .count")).toHaveLength(4);
    const empty = hud.querySelector(".empty") as HTMLElement;
    expect(empty.hasAttribute("hidden")).toBe(false);
    expect(empty.textContent).toBe("No ghosts here. Suspiciously clean.");
    expect(hud.querySelector(".hits")!.textContent).toContain("Souls counted:");
    expect(hud.querySelectorAll(".hits .cell")).toHaveLength(6);
    expect(hud.querySelector(".ring")!.textContent!.replace(/\s+/g, " ").trim()).toBe("« prev | Haunted WebRing | next »");
    const ringButtons = [...hud.querySelectorAll(".ring button")].map((b) => b.textContent);
    expect(ringButtons).toEqual(["« prev", "next »"]);
  });

  test("setCounts swaps the empty state for the counts once anything is found", () => {
    const { win, doc } = setup();
    windows.push(win);
    const hud = byId(renderCostume(doc), "hud")!;
    setCounts(hud, { ghosts: 7, vampires: 1, tombstones: 3, curses: 2 });
    expect(hud.querySelector(".counts")!.hasAttribute("hidden")).toBe(false);
    expect(hud.querySelector(".empty")!.hasAttribute("hidden")).toBe(true);
    expect([...hud.querySelectorAll(".count .n")].map((n) => n.textContent)).toEqual(["7", "1", "3", "2"]);
    setCounts(hud, { ghosts: 0, vampires: 0, tombstones: 0, curses: 0 });
    expect(hud.querySelector(".empty")!.hasAttribute("hidden")).toBe(false);
  });

  test("the odometer shows 000000 and positions each digit strip in 16px steps", () => {
    const { win, doc } = setup();
    windows.push(win);
    const hud = byId(renderCostume(doc), "hud")!;
    const strips = () => [...hud.querySelectorAll(".cell .strip")].map((s) => (s as HTMLElement).style.transform);
    expect(strips()).toEqual(Array(6).fill("translateY(0px)"));
    expect(hud.querySelector(".hits")!.getAttribute("aria-label")).toBe("Souls counted: 000000");
    setOdometer(hud, 1234);
    expect(strips()).toEqual(["translateY(0px)", "translateY(0px)", "translateY(-16px)", "translateY(-32px)", "translateY(-48px)", "translateY(-64px)"]);
    expect(hud.querySelector(".hits")!.getAttribute("aria-label")).toBe("Souls counted: 001234");
  });

  test("HUD CSS: fixed bottom with lift, 8px insets, max 720, min 40, bevel, hard shadow, 2-row wrap at ≤400px", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const hud = css.match(/#hud\s*\{([^}]*)\}/)![1]!;
    for (const d of [
      "position: fixed", "bottom: calc(8px + var(--hg-lift, 0px))", "left: 8px", "right: 8px", "max-width: 720px",
      "margin: 0 auto", "min-height: 40px", "z-index: 5", "background-color: #000033", "border: 1px solid #000000",
    ]) {
      expect({ d, ok: hud.includes(d) }).toEqual({ d, ok: true });
    }
    expect(hud).toMatch(/box-shadow:[^;]*inset 2px 2px 0 #9999cc[^;]*inset -2px -2px 0 #333366[^;]*4px 4px 0 #000000/);
    expect(css).toMatch(/#hud::before\s*\{[^}]*opacity:\s*0?\.3/);
    const narrow = css.slice(css.indexOf("@media (max-width: 400px)"));
    expect(narrow).toMatch(/#hud\s*\{[^}]*left:\s*4px[^}]*right:\s*4px[^}]*flex-wrap:\s*wrap[^}]*row-gap:\s*4px/);
    expect(css).toMatch(/\.win95\s*\{[^}]*height:\s*24px[^}]*padding:\s*0 8px[^}]*background:\s*#cccccc[^}]*color:\s*#000000[^}]*border-color:\s*#ffffff #666666 #666666 #ffffff/);
  });

  test("sampleBottomLift is the height of page UI fixed to the bottom, ignoring the overlay and full-screen layers", () => {
    const { win, doc } = setup();
    windows.push(win);
    (doc as unknown as { elementsFromPoint: unknown }).elementsFromPoint = () => [doc.body];
    expect(sampleBottomLift(doc)).toBe(0);
    const host = doc.createElement(HOST_TAG);
    const bar = doc.createElement("div");
    bar.setAttribute("style", "position: fixed; bottom: 0");
    bar.getBoundingClientRect = () => ({ top: 744, bottom: 800, left: 0, right: 1280, width: 1280, height: 56 }) as DOMRect;
    const veil = doc.createElement("div");
    veil.setAttribute("style", "position: fixed; inset: 0");
    veil.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 1280, width: 1280, height: 800 }) as DOMRect;
    doc.body.append(bar, veil);
    (doc as unknown as { elementsFromPoint: unknown }).elementsFromPoint = () => [host, bar, veil, doc.body];
    expect(sampleBottomLift(doc)).toBe(56);
  });
});

// ---------- render, body padding, non-destructive ----------

describe("renderCostume", () => {
  test("builds the seven layers in z order inside the closed shadow root", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    expect(root.mode).toBe("closed");
    const ids = [...byId(root, "crypt-root")!.children].map((c) => c.id);
    expect(ids.slice(0, 6)).toEqual(["starfield", "lanes", "markers", "top-bands", "hud", "cards"]);
    expect(ids).toContain("show-tab");
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const z = (id: string) => Number(css.match(new RegExp(`#${id}\\s*\\{[^}]*z-index:\\s*(\\d+)`))![1]);
    expect(["starfield", "lanes", "markers", "top-bands", "hud", "cards", "fx"].map(z)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(root.adoptedStyleSheets).toHaveLength(2);
  });

  test("only the HUD, the Show tab, ghost sprites, tombstone markers and cards take pointer events", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const autos = [...css.matchAll(/([^{}]+)\{[^}]*pointer-events:\s*auto/g)].map((m) => m[1]!.trim());
    expect(autos.sort()).toEqual(["#hud", "#show-tab", ".card", ".ghost, .vampire", ".tomb-marker"]);
    expect(css).toMatch(/#crypt-root\s*\{[^}]*pointer-events:\s*none/);
  });

  test("is idempotent: one host, one document sheet", () => {
    const { win, doc } = setup();
    windows.push(win);
    const a = renderCostume(doc);
    const b = renderCostume(doc);
    expect(a).toBe(b);
    expect(doc.documentElement.querySelectorAll(HOST_TAG)).toHaveLength(1);
    expect(doc.adoptedStyleSheets).toHaveLength(1);
    expect(a.querySelectorAll("#crypt-root")).toHaveLength(1);
  });

  test("the one document-level change is a sheet with the lift variable and the body padding", () => {
    const { win, doc } = setup();
    windows.push(win);
    const head = doc.head.outerHTML;
    const body = doc.body.outerHTML;
    renderCostume(doc);
    expect(doc.head.outerHTML).toBe(head);
    expect(doc.body.outerHTML).toBe(body);
    expect(doc.adoptedStyleSheets).toHaveLength(1);
    const css = [...doc.adoptedStyleSheets[0]!.cssRules].map((r) => r.cssText).join("\n");
    expect(css).toMatch(/--hg-lift:\s*0px/);
    expect(css).toMatch(/padding-top:\s*calc\(5px \+ 48px\)\s*!important/);
    expect(css).toMatch(/padding-bottom:\s*calc\(7px \+ \d+px \+ 16px \+ var\(--hg-lift\)\)\s*!important/);
  });

  test("leaveCostume removes host and sheet together; documentElement.outerHTML is byte-identical", async () => {
    const { win, doc } = setup();
    windows.push(win);
    const before = doc.documentElement.outerHTML;
    renderCostume(doc);
    await flush();
    await leaveCostume(doc);
    expect(doc.documentElement.querySelectorAll(HOST_TAG)).toHaveLength(0);
    expect(doc.adoptedStyleSheets).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  test("Hide fades the costume and leaves a 40×40 Show tab; Show brings it back; haunt state is kept", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const croot = byId(root, "crypt-root")!;
    const tab = byId(root, "show-tab")!;
    expect(tab.hasAttribute("hidden")).toBe(true);
    (byId(root, "hud")!.querySelector("button.hide") as HTMLElement).click();
    expect(croot.classList.contains("costume-hidden")).toBe(true);
    expect(tab.hasAttribute("hidden")).toBe(false);
    expect(tab.localName).toBe("button");
    expect(tab.getAttribute("aria-label")).toBe("Show the haunted costume");
    expect(root.activeElement).toBe(tab);
    expect(doc.documentElement.querySelectorAll(HOST_TAG)).toHaveLength(1);
    expect(doc.adoptedStyleSheets).toHaveLength(1);
    tab.click();
    expect(croot.classList.contains("costume-hidden")).toBe(false);
    expect(tab.hasAttribute("hidden")).toBe(true);
    expect(root.activeElement).toBe(byId(root, "hud")!.querySelector("button.hide"));
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/\.costume-hidden > :not\(#show-tab\)\s*\{[^}]*opacity:\s*0/);
    expect(css).toMatch(/#crypt-root > \*\s*\{[^}]*transition:\s*opacity 200ms/);
    expect(css).toMatch(/#show-tab\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/);
  });

  test("focus ring: 2px dotted #ffff66, 2px offset, 5px black halo; Win95 buttons add a dotted inner rectangle", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px dotted #ffff66[^}]*outline-offset:\s*2px[^}]*box-shadow:\s*0 0 0 5px #000000/);
    expect(css).toMatch(/\.win95:focus-visible::after\s*\{[^}]*border:\s*1px dotted #000000/);
  });
});

// ---------- haunt moment ----------

describe("haunt moment", () => {
  test("FX layer: vignette, a 96×96 Webmaster's Ghost and a 32px ectoplasm dither strip", () => {
    const { win, doc } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const fx = byId(root, "fx")!;
    expect(fx.querySelector(".vignette")).not.toBeNull();
    const ghost = fx.querySelector(".webmaster") as HTMLElement;
    expect(ghost).not.toBeNull();
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/\.webmaster\s*\{[^}]*width:\s*96px[^}]*height:\s*96px/);
    expect(css).toMatch(/\.ectoplasm\s*\{[^}]*width:\s*32px/);
    expect(css).toMatch(/\.vignette\s*\{[^}]*radial-gradient\([^)]*transparent[^)]*#000033/);
  });

  test("timeline: vignette, ghost + reveal on one timing, HUD rise, odometer roll right-first, markers; FX removed at the end", async () => {
    const { win, doc, recs } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    const fx = byId(root, "fx")!;
    const E = { out: T.MOTION.easeOut, inOut: T.MOTION.easeInOut };

    const vignette = animsOn(recs, fx.querySelector(".vignette"));
    expect(vignette.map((r) => [r.keyframes.map((k) => k.opacity), r.opts.delay ?? 0, r.opts.duration, r.opts.easing])).toEqual([
      [[0, 0.4], 0, 200, E.out],
      [[0.4, 0], 1100, 300, E.out],
    ]);

    const [sweep] = animsOn(recs, fx.querySelector(".sweep"));
    expect(sweep!.keyframes.map((k) => k.transform)).toEqual(["translateX(-96px)", "translateX(100vw)"]);
    expect([sweep!.opts.delay, sweep!.opts.duration, sweep!.opts.easing]).toEqual([200, 900, E.inOut]);
    const [bob] = animsOn(recs, fx.querySelector(".webmaster"));
    expect([bob!.opts.delay, bob!.opts.duration]).toEqual([200, 900]);
    expect(bob!.keyframes.map((k) => k.transform)).toContain("translateY(-6px)");
    expect(bob!.keyframes.map((k) => k.transform)).toContain("translateY(6px)");

    for (const id of ["starfield", "top-bands"]) {
      const [clip] = animsOn(recs, byId(root, id));
      expect(props(clip!)).toEqual(["clipPath", "clipPath"]);
      expect(clip!.keyframes[1]!.clipPath).toMatch(/^inset\(0 calc\(100% - 100vw/);
      expect([clip!.opts.delay, clip!.opts.duration, clip!.opts.easing]).toEqual([200, 900, E.inOut]);
    }

    const [hud] = animsOn(recs, byId(root, "hud"));
    expect(hud!.keyframes[0]!.transform).toMatch(/^translateY\(\d+px\)$/);
    expect([hud!.opts.delay, hud!.opts.duration, hud!.opts.easing]).toEqual([1400, 300, E.out]);

    const strips = [...byId(root, "hud")!.querySelectorAll(".strip")];
    const rolls = strips.map((s) => animsOn(recs, s)[0]!);
    expect(rolls.every((r) => r && props(r).every((p) => p === "transform"))).toBe(true);
    const delays = rolls.map((r) => r.opts.delay!);
    expect(delays[5]).toBe(1700);
    for (let i = 0; i < 5; i++) expect(delays[i]!).toBeGreaterThan(delays[i + 1]!); // right digit first
    for (const r of rolls) expect(r.opts.delay! + (r.opts.duration as number)).toBe(2300);

    const [markers] = animsOn(recs, byId(root, "markers"));
    expect([markers!.opts.delay, markers!.opts.duration, markers!.opts.easing]).toEqual([2300, 200, "linear"]);

    const end = Math.max(...recs.map((r) => (r.opts.delay ?? 0) + (r.opts.duration as number)));
    expect(end).toBe(T.MOTION.haunt);
    for (const r of recs) expect(props(r).every((p) => ["transform", "opacity", "clipPath"].includes(p))).toBe(true);

    await flush();
    await flush();
    expect(byId(root, "fx")).toBeNull();
  });

  test("un-haunt reverse: markers out, sprites sink, HUD down, ghost right→left; 1100ms, then removal", async () => {
    const { win, doc, recs } = setup();
    windows.push(win);
    const root = renderCostume(doc);
    await flush();
    await flush();
    recs.length = 0;
    const done = leaveCostume(doc);
    const fx = byId(root, "fx")!;
    expect(fx).not.toBeNull();
    const [markers] = animsOn(recs, byId(root, "markers"));
    expect([markers!.opts.delay ?? 0, markers!.opts.duration]).toEqual([0, 200]);
    const [lanes] = animsOn(recs, byId(root, "lanes"));
    expect(lanes!.keyframes.at(-1)).toMatchObject({ transform: "translateY(16px)", opacity: 0 });
    expect([lanes!.opts.delay, lanes!.opts.duration]).toEqual([200, 300]);
    const [hud] = animsOn(recs, byId(root, "hud"));
    expect([hud!.opts.delay, hud!.opts.duration]).toEqual([300, 300]);
    const [sweep] = animsOn(recs, fx.querySelector(".sweep"));
    expect(sweep!.keyframes.map((k) => k.transform)).toEqual(["translateX(100vw)", "translateX(-96px)"]);
    expect([sweep!.opts.delay, sweep!.opts.duration]).toEqual([500, 600]);
    const end = Math.max(...recs.map((r) => (r.opts.delay ?? 0) + (r.opts.duration as number)));
    expect(end).toBe(T.MOTION.unhaunt);
    await done;
    expect(doc.documentElement.querySelectorAll(HOST_TAG)).toHaveLength(0);
  });
});

// ---------- reduced motion ----------

describe("prefers-reduced-motion", () => {
  test("haunt is a 300ms linear cross-fade of the overlay root: no ghost, no wipe, no roll", () => {
    const { win, doc, recs } = setup({ reduced: true });
    windows.push(win);
    const root = renderCostume(doc);
    const croot = byId(root, "crypt-root")!;
    expect(croot.classList.contains("reduced-motion")).toBe(true);
    expect(root.querySelector(".webmaster")).toBeNull();
    expect(recs.map((r) => [r.el, r.keyframes.map((k) => k.opacity), r.opts.duration, r.opts.easing])).toEqual([
      [croot, [0, 1], 300, "linear"],
    ]);
  });

  test("un-haunt is a 200ms fade, then removal", async () => {
    const { win, doc, recs } = setup({ reduced: true });
    windows.push(win);
    const croot = byId(renderCostume(doc), "crypt-root") as Element;
    recs.length = 0;
    await leaveCostume(doc);
    expect(recs.map((r) => [r.el, r.keyframes.map((k) => k.opacity), r.opts.duration])).toEqual([[croot, [1, 0], 200]]);
    expect(doc.documentElement.querySelectorAll(HOST_TAG)).toHaveLength(0);
  });

  test("is read live: a matchMedia change toggles the class; CSS stops animations, marquee static with ellipsis, sign on frame 1", () => {
    const { win, doc, setReduced } = setup();
    windows.push(win);
    const croot = byId(renderCostume(doc), "crypt-root")!;
    expect(croot.classList.contains("reduced-motion")).toBe(false);
    setReduced(true);
    expect(croot.classList.contains("reduced-motion")).toBe(true);
    setReduced(false);
    expect(croot.classList.contains("reduced-motion")).toBe(false);
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const rm = [...css.matchAll(/\.reduced-motion([^{]*)\{([^}]*)\}/g)];
    expect(rm.some((m) => /\*/.test(m[1]!) && /animation:\s*none/.test(m[2]!))).toBe(true);
    expect(rm.some((m) => /marquee-track/.test(m[1]!) && /text-overflow:\s*ellipsis/.test(m[2]!))).toBe(true);
    expect(rm.some((m) => /transition:\s*opacity 200ms/.test(m[2]!))).toBe(true);
  });

  test("lines advance only on Hide/Show under reduced motion", () => {
    const { win, doc } = setup({ reduced: true });
    windows.push(win);
    const root = renderCostume(doc);
    const track = () => byId(root, "marquee")!.textContent;
    expect(track()).toContain(MARQUEE_LINES[0]!);
    (byId(root, "hud")!.querySelector("button.hide") as HTMLElement).click();
    byId(root, "show-tab")!.click();
    expect(track()).toContain(MARQUEE_LINES[1]!);
  });
});
