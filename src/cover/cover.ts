// The page-change cover (design/DESIGN.md "Page-change cover"): a 1998 loading screen put up at
// document_start on the next page of a haunted site, so the original page never shows before the
// costume. Registered by the background for the haunted site only, and shown only in the tab that
// haunts it: the page's own sessionStorage marker answers at once (per tab, per origin), and the
// background's COVER_CHECK confirms or takes it down.
import { GHOST, ghostLegend, mapToPx, svgMarkup } from "../content/costume/art";
import { PALETTE as P, PIXEL } from "../content/costume/tokens";
import { COVER_DONE, COVER_MARKER } from "../data/types";

export const COVER_TAG = "hg-cover";
/** The longest a page stays covered, whatever happens to the re-haunt. */
export const COVER_MAX_MS = 3000;
export const COVER_FADE_MS = 200;

type Timers = { set(fn: () => void, ms: number): number; clear(id: number): void };
type Runtime = {
  sendMessage(msg: unknown): Promise<unknown>;
  onMessage: { addListener(l: (msg: unknown) => unknown): void };
};

export interface CoverDeps {
  doc: Document;
  /** The page's sessionStorage (shared with the isolated world). */
  storage?: Storage;
  runtime?: Runtime;
  /** The isolated world's global, shared with content.js. */
  global: Record<string, unknown>;
  timers?: Timers;
  reduced?: () => boolean;
}

const CSS = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: auto; display: block; }
.screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background-color: ${P.crypt}; background-image: radial-gradient(${P.star} 1px, transparent 1px); background-size: 48px 48px; }
.screen::before { content: ""; position: absolute; inset: 0; background: ${P.crypt}; opacity: 0.7; }
.screen > * { position: relative; }
.ghost { width: 48px; height: 48px; filter: drop-shadow(0 0 8px ${P.spectral}); animation: bob 1200ms ease-in-out infinite alternate; }
.label { margin: 0; font: 20px "Times New Roman", Times, serif; color: ${P.bone}; }
.bar { display: flex; gap: 2px; width: 200px; height: 16px; box-sizing: border-box; padding: 2px; background: #c0c0c0;
  box-shadow: inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #000000, inset -2px -2px 0 #dfdfdf; }
.block { flex: 1; height: 12px; background: transparent; }
.block.lit { background: #000080; }
.foot { margin: 0; font: 12px "Times New Roman", Times, serif; color: #ccccff; }
@keyframes bob { from { transform: translateY(0); } to { transform: translateY(-4px); } }
@media (prefers-reduced-motion: reduce) { .ghost { animation: none; } }
`;

/** Start the cover logic for one document. Returns a handle for tests. */
export function startCover({ doc, storage, runtime, global, timers, reduced }: CoverDeps) {
  const win = doc.defaultView!;
  const t: Timers = timers ?? { set: (fn, ms) => win.setTimeout(fn, ms), clear: (id) => win.clearTimeout(id) };
  const still = reduced ?? (() => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let cap = 0;
  let step = 0;
  let gone = false; // taken down for good: a late "yes" does not bring it back

  const marked = (() => {
    try {
      return storage?.getItem(COVER_MARKER) === "1";
    } catch {
      return false; // storage can throw (sandboxed or opaque pages)
    }
  })();

  function show() {
    if (host || gone) return;
    host = doc.createElement(COVER_TAG);
    root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    const screen = doc.createElement("div");
    screen.className = "screen";
    const ghost = doc.createElement("div");
    ghost.className = "ghost";
    ghost.innerHTML = svgMarkup(mapToPx(GHOST, ghostLegend(P.ghostShade), PIXEL.spriteScale), 48, 48);
    const label = Object.assign(doc.createElement("p"), { className: "label", textContent: "Loading crypt…" });
    label.setAttribute("role", "status");
    const bar = doc.createElement("div");
    bar.className = "bar";
    bar.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 10; i++) bar.append(Object.assign(doc.createElement("div"), { className: "block" }));
    const foot = Object.assign(doc.createElement("p"), { className: "foot", textContent: "Under construction since 1998" });
    screen.append(ghost, label, bar, foot);
    root.append(style, screen);
    const blocks = [...bar.children] as HTMLElement[];
    // Three lit blocks step right every 333ms (3 Hz cap); under reduced motion four stand still.
    const paint = () => blocks.forEach((b, i) => b.classList.toggle("lit", still() ? i < 4 : (i - step + 10) % 10 < 3));
    paint();
    const tick = () => {
      if (!host || still()) return;
      step = (step + 1) % 10;
      paint();
      t.set(tick, 333);
    };
    t.set(tick, 333);
    doc.documentElement.append(host);
    cap = t.set(() => hide(), COVER_MAX_MS);
  }

  function hide(now = false) {
    gone = true;
    t.clear(cap);
    const h = host;
    if (!h) return;
    host = null;
    if (now || still()) return h.remove();
    h.style.transition = `opacity ${COVER_FADE_MS}ms linear`;
    h.style.opacity = "0";
    t.set(() => h.remove(), COVER_FADE_MS);
  }

  if (marked) show();
  global[COVER_DONE] = (now?: boolean) => hide(now === true);
  runtime?.onMessage.addListener((msg) => {
    if ((msg as { type?: string } | null)?.type === "unhaunt") hide(true);
    return undefined; // never answers: content.js does
  });
  runtime
    ?.sendMessage({ type: "COVER_CHECK" })
    .then((yes) => yes === true, () => false)
    .then((yes) => {
      if (yes) return show();
      hide(true);
      try {
        if (marked) storage?.removeItem(COVER_MARKER);
      } catch {
        // nothing to clean
      }
    });

  return { root: () => root, shown: () => host !== null };
}
