// The overlay: one <hg-crypt> host appended to <html>, with a closed shadow root that the
// costume (R4) renders into. Nothing else in the page is touched; unhaunt() removes the host,
// which also drops the sheet adopted inside its shadow root.

export const HOST_TAG = "hg-crypt";

// !important because page rules aimed at the host element (e.g. `* { position: relative }`)
// would otherwise beat :host rules.
const HOST_CSS = `:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
}`;

type Overlay = { host: Element; root: ShadowRoot; cleanups: (() => void)[] };

// Kept on the isolated world's global so re-injecting content.js (a fresh bundle run each
// time) still finds the overlay it made before. The page's own scripts cannot see it.
const KEY = "__hauntedGeoCitiesOverlays";
const overlays = ((globalThis as Record<string, unknown>)[KEY] ??= new WeakMap<Document, Overlay>()) as WeakMap<
  Document,
  Overlay
>;

/** Show the overlay (idempotent) and return its closed shadow root. */
export function haunt(doc: Document = document): ShadowRoot {
  const existing = overlays.get(doc);
  if (existing?.host.isConnected) return existing.root;
  const host = doc.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: "closed" });
  const sheet = new (doc.defaultView ?? window).CSSStyleSheet();
  sheet.replaceSync(HOST_CSS);
  root.adoptedStyleSheets = [sheet];
  doc.documentElement.appendChild(host);
  overlays.set(doc, { host, root, cleanups: [] });
  return root;
}

/** Run `fn` when the current overlay is removed (in the same task as the host removal). */
export function onUnhaunt(doc: Document, fn: () => void): void {
  overlays.get(doc)?.cleanups.push(fn);
}

/** Remove the overlay and everything it added. A no-op when not haunted. */
export function unhaunt(doc: Document = document): void {
  const o = overlays.get(doc);
  overlays.delete(doc);
  if (!o) return;
  o.host.remove();
  for (const fn of o.cleanups) fn();
}
