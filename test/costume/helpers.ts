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

export function setup(opts: { reduced?: boolean; html?: string; width?: number } = {}) {
  const win = new Window({ url: "https://haunt.example/", width: opts.width ?? 1280, height: 800 });
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

export const flush =() => new Promise((r) => setTimeout(r, 0));
/** The text of every sheet the page adopted, joined. */
export const pageCss = (doc: Document) => doc.adoptedStyleSheets.map((s) => sheetText.get(s) ?? "").join("\n");
const sheetText = new WeakMap<object, string>();
export const byId = (root: ShadowRoot, id: string) => root.getElementById(id) as HTMLElement | null;
