// A happy-dom page with Element.animate recorded and prefers-reduced-motion under test control,
// shared by the content column costume tests.
import { afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

export const designTokens = () => {
  const md = readFileSync(join(import.meta.dir, "..", "..", "design", "DESIGN.md"), "utf8");
  const tokens = md.split(/^## /m).find((p) => p.startsWith("Tokens"))!;
  return JSON.parse(tokens.match(/```json\s*\n([\s\S]*?)```/)![1]!);
};

export const LIGHT = `<!doctype html><html lang="en"><head><title>t</title><style>body{padding:5px 0 7px;background:#ffffff}</style></head>
<body><header><h1>Hello</h1><nav><a id="home" href="/">Home</a></nav></header><main><h2>Notes</h2><p>Text <a id="in" href="/x">link</a> and <code>x()</code></p>
<form action="/x"><input name="q"><button>Go</button></form></main><script>var x=1</script></body></html>`;

export const DARK = LIGHT.replace("background:#ffffff", "background:#111111;color:#eeeeee");

export type Rec = { el: Element; keyframes: Keyframe[]; opts: KeyframeAnimationOptions };

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

export function setup(opts: { reduced?: boolean; html?: string; width?: number; height?: number } = {}) {
  const win = new Window({ url: "https://haunt.example/", width: opts.width ?? 1280, height: opts.height ?? 800 });
  windows.push(win);
  win.document.write(opts.html ?? LIGHT);
  const recs: Rec[] = [];
  (win.Element.prototype as unknown as { animate: unknown }).animate = function (this: Element, keyframes: Keyframe[], o: KeyframeAnimationOptions) {
    recs.push({ el: this, keyframes, opts: o });
    return { finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {}, currentTime: 0 };
  };
  let reduced = !!opts.reduced;
  let listeners: ((e: { matches: boolean }) => void)[] = [];
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q,
    get matches() {
      return q.includes("prefers-reduced-motion") ? reduced : false;
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      listeners = listeners.filter((l) => l !== fn);
    },
  });
  // Keep the text each sheet was last given (happy-dom's CSS parser drops some modern selectors).
  const proto = win.CSSStyleSheet.prototype as unknown as { replaceSync(t: string): void };
  const replace = proto.replaceSync;
  proto.replaceSync = function (this: object, t: string) {
    sheetText.set(this, t);
    replace.call(this, t);
  };
  const doc = win.document as unknown as Document;
  const setReduced = (v: boolean) => {
    reduced = v;
    for (const l of listeners) l({ matches: v });
  };
  return { win, doc, recs, setReduced };
}

export type Rect = { left: number; right: number; top: number; bottom: number };
export const domRect = ({ left, right, top, bottom }: Rect) =>
  ({ left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} }) as DOMRect;

/** Lay out the page's `main` at `rect` (happy-dom has no layout: every other box stays empty). */
export function stubMain(win: { Element: { prototype: object } }, rect: () => Rect) {
  const proto = win.Element.prototype as { getBoundingClientRect(this: Element): DOMRect };
  const own = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function (this: Element) {
    return this.localName === "main" ? domRect(rect()) : own.call(this);
  };
}

/**
 * Requests to real tracker hosts (src/data/trackers.json) in Resource Timing: Criteo ×3 and comScore ×2
 * (ghosts), Hotjar ×2 and Taboola ×1 (fingerprinting score 2, so known vampires).
 */
export const TRACKER_ENTRIES = [
  ...["criteo.com/a", "criteo.com/b", "criteo.com/c", "scorecardresearch.com/a", "scorecardresearch.com/b", "hotjar.com/a", "hotjar.com/b", "taboola.com/a"].map(
    (p, i) => ({ name: `https://${p}.js`, startTime: i + 1 }),
  ),
];
export const LANE_ORDER = ["Criteo", "comScore", "Hotjar", "Taboola"];

export function withTrackers(win: object, entries: { name: string; startTime: number }[] = TRACKER_ENTRIES) {
  Object.defineProperty(win, "performance", { value: { getEntriesByType: () => entries }, configurable: true });
}

/**
 * A fake layout for the fixed costume boxes (happy-dom has none): `#hud` and `#graveyard` heights,
 * cards 200px tall, a hidden box 0. The HUD sits 8px above the viewport bottom (plus `--hg-lift`, 0
 * here) and the strip 4px above the HUD. Restored after the test.
 */
export function fakeLayout(win: { HTMLElement: { prototype: object }; innerHeight: number }, sizes: { hud: number; graveyard: number }) {
  const proto = win.HTMLElement.prototype;
  const own = ["offsetHeight", "offsetTop"].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const);
  restores.push(() => own.forEach(([k, d]) => (d ? Object.defineProperty(proto, k, d) : delete (proto as Record<string, unknown>)[k])));
  const height = (el: HTMLElement): number => (el.hidden ? 0 : el.classList.contains("card") ? 200 : ((sizes as Record<string, number>)[el.id] ?? 0));
  const hudTop = () => win.innerHeight - 8 - sizes.hud;
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get(this: HTMLElement) { return height(this); } });
  Object.defineProperty(proto, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.id === "hud") return hudTop();
      if (this.id === "graveyard") return this.hidden ? 0 : hudTop() - 4 - sizes.graveyard;
      return 0;
    },
  });
  return { hudTop, stripTop: () => hudTop() - 4 - sizes.graveyard };
}
const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) r();
});

export const flush =() => new Promise((r) => setTimeout(r, 0));
/** The text of every sheet the page adopted, joined. */
export const pageCss = (doc: Document) => doc.adoptedStyleSheets.map((s) => sheetText.get(s) ?? "").join("\n");
const sheetText = new WeakMap<object, string>();
export const byId = (root: ShadowRoot, id: string) => root.getElementById(id) as HTMLElement | null;
