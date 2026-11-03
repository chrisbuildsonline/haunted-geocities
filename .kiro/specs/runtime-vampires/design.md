# Design: Runtime Vampires (R6)

## Context

This spec adds runtime fingerprinting detection to the costume. The tracker detector (R5) finds tracker companies from Resource Timing entries; this spec *catches* scripts actually calling fingerprinting APIs at runtime, by installing observe-only wrappers on five prototype methods in the page's MAIN world. A tracker company (or unlisted third-party host) becomes a vampire when one of its scripts is caught. The Tracker Radar fingerprinting score (≥ 2) is only the fallback, shown as "known", not "caught".

The wrappers live in the MAIN world because that is the same JavaScript context as the page's own scripts — the same `HTMLCanvasElement.prototype` the page calls. The content script's isolated world has its own copies of these prototypes, which the page's scripts never touch. The MAIN-world hooks report catches to the content script via a `CustomEvent` with a random nonce; the content script does the attribution and merge.

Steering references: `non-destructive-dom.md` (observe-only wrappers on `toDataURL`, `getImageData`, `startRendering`, font-probing `measureText`; each wrapper calls the original, returns unchanged, never throws, native-looking `toString`; un-haunt restores originals), `product.md` (vampire scripts, no new permissions), `tech.md` (Shadow DOM, adopted stylesheets, Web Audio API, activeTab), `accessibility-and-motion.md` (reduced motion, 3 Hz, keyboard, contrast), `era-accuracy.md` (`#ff0033` vampire glow, pixel art).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKGROUND SERVICE WORKER                                                    │
│                                                                               │
│    router.ts  haunt()                                                         │
│      ├── chrome.scripting.executeScript({ target, files: ["content.js"] })   │
│      ├── chrome.tabs.sendMessage(tabId, { type: "vampires", nonce })          │
│      └── chrome.scripting.executeScript({ target, world: "MAIN",              │
│             func: installHooks, args: [nonce] })                               │
│                                                                               │
│    nonce = crypto.randomUUID()  (stored in session nonce:<tabId>, reused)      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MAIN WORLD  (installHooks(nonce) — same JS context as the page's scripts)   │
│                                                                               │
│    installs wrappers on window's prototypes:                                  │
│      HTMLCanvasElement.prototype.toDataURL / toBlob                            │
│      CanvasRenderingContext2D.prototype.getImageData                          │
│      OfflineAudioContext.prototype.startRendering                             │
│      CanvasRenderingContext2D.prototype.measureText                            │
│                                                                               │
│    all state in a closure — nothing on window:                                │
│      • original descriptors, font/text tracking sets                           │
│      • <nonce>:ping listener (idempotency check)                              │
│      • <nonce>:restore listener (cleanup)                                    │
│                                                                               │
│    each wrapper:                                                              │
│      1. calls original with same this + args                                   │
│      2. on success: dispatches CustomEvent(nonce, { api, scriptUrl })         │
│      3. returns result / rethrows exception unchanged                         │
│      4. name, length, toString preserved                                      │
│                                                                               │
│    restores originals on <nonce>:restore event                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  ISOLATED WORLD  (content.js — content script)                                │
│                                                                               │
│    receives { type: "vampires", nonce } via chrome.tabs.sendMessage           │
│    window.addEventListener(nonce, handler)                                    │
│      validates { api, scriptUrl }                                             │
│      deduplicates (scriptUrl, api)                                            │
│      resolves company via matchTracker / lookup                               │
│      merges vampire info into CompanyHit[]                                    │
│      updates: vampire sprites, HUD count, popup list                          │
│                                                                               │
│    scanner.onUpdate → known vampires (fingerprinting ≥ 2, not caught)          │
│    vampire merge: caught + known → CompanyHit.vampire                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Module Layout

```
src/
  background/
    router.ts            # (modified) injects installHooks in MAIN world on HAUNT,
                         #   sends { type: "vampires", nonce } to tab, dispatches
                         #   <nonce>:restore on UNHAUNT
  content/
    hooks.ts             # NEW: exports installHooks(nonce) — self-contained MAIN-world
                         #   wrapper installer. Injected via func/args, not a bundle.
                         #   All state in a closure; nothing on window.
    hooks-bridge.ts      # NEW: isolated-world listener, attribution, merge
    costume/
      render.ts          # (modified) wires vampire bridge + sprites + HUD
      vampires.ts         # NEW: vampire sprites in #lanes, vampire card open
      card.ts            # (modified) openCard supports vampire variant
      ghosts.ts          # (modified) planSlots shared with vampires
      haunt-moment.ts    # (modified) vampire fade-in + glow swell at 1800ms
      styles.ts          # (modified) adds .vampire CSS
      tokens.ts          # (existing) vampireGlow, vampireLining already present
      art.ts             # (modified) adds VAMPIRE sprite (16×18) if not present
    scanner.ts           # (existing) unchanged
    matcher.ts           # (existing) unchanged
  data/
    types.ts             # (modified) adds VampireInfo to CompanyHit
  popup/
    screens.ts           # (modified) adds vampire rows with Caught/Known pills
    sprites.ts           # (existing) vampire sprite already present

test/
  vampire/
    hooks.test.ts        # wrapper identity, same results, restore, toString, nonce,
                         #   ping idempotency, restore event, no window pollution
    attribution.test.ts  # known tracker → company, unlisted → host, first-party → ignored
    merge.test.ts        # caught extends existing, unlisted creates new, dedup

fixtures/
  vampires.html          # NEW: sign-up form with fingerprinting scripts

e2e/
  vampires.spec.ts       # NEW: haunt, focus, caught vampires, toDataURL same, restored
```

## MAIN-World Hook Script (`src/content/hooks.ts`)

The hook is a self-contained function `installHooks(nonce: string)` exported from `src/content/hooks.ts`. The background injects it via `chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: installHooks, args: [nonce] })`. Because `executeScript` with `func` passes `args` as the function's parameters, the nonce arrives as the first argument. No separate `hooks.js` or `hooks-restore.js` bundle is built — `func` injection runs the function directly in the MAIN world.

All state — original descriptors, idempotency flag, font/text tracking sets, event listeners — lives in the closure created by `installHooks`. Nothing is set on `window` or any other global.

### Installation

```ts
// hooks.ts — exported function, injected via executeScript({ func, args })
export function installHooks(nonce: string): void {
  // ── Idempotency check: dispatch <nonce>:ping synchronously ──────────────
  // If an already-installed closure is listening, it sets detail.installed = true.
  const pingEvent = new CustomEvent(`${nonce}:ping`, {
    detail: { installed: false },
    cancelable: true,
  });
  window.dispatchEvent(pingEvent);
  if ((pingEvent.detail as { installed: boolean }).installed) return; // already installed

  // ── Save original descriptors ──────────────────────────────────────────
  const descriptors = {
    toDataURL: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toDataURL")!,
    toBlob: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob")!,
    getImageData: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "getImageData")!,
    startRendering: Object.getOwnPropertyDescriptor(OfflineAudioContext.prototype, "startRendering")!,
    measureText: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "measureText")!,
    fillText: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "fillText")!,
    strokeText: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "strokeText")!,
    font: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font")!,
  };
  const originals = {
    toDataURL: HTMLCanvasElement.prototype.toDataURL,
    toBlob: HTMLCanvasElement.prototype.toBlob,
    getImageData: CanvasRenderingContext2D.prototype.getImageData,
    startRendering: OfflineAudioContext.prototype.startRendering,
    measureText: CanvasRenderingContext2D.prototype.measureText,
    fillText: CanvasRenderingContext2D.prototype.fillText,
    strokeText: CanvasRenderingContext2D.prototype.strokeText,
  };

  // ── Tracking sets (closure state, not window) ───────────────────────────
  const textContexts = new WeakSet<CanvasRenderingContext2D>();
  const fontFamiliesByContext = new WeakMap<CanvasRenderingContext2D, Set<string>>();
  const allFontSets = new Set<string>(); // global dedup across contexts

  // ── dispatch, extractScriptUrl, makeWrapper, wrappers ───────────────────
  // (see below — all defined inside this closure, using `nonce` and the sets above)

  // ── Install <nonce>:ping listener for idempotency ───────────────────────
  // Future calls to installHooks with the same nonce will find this listener.
  const pingListener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { installed: boolean };
    if (detail) detail.installed = true;
  };
  window.addEventListener(`${nonce}:ping`, pingListener);

  // ── Install <nonce>:restore listener for cleanup ────────────────────────
  const restoreListener = () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", descriptors.toDataURL);
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", descriptors.toBlob);
    Object.defineProperty(CanvasRenderingContext2D.prototype, "getImageData", descriptors.getImageData);
    Object.defineProperty(CanvasRenderingContext2D.prototype, "measureText", descriptors.measureText);
    Object.defineProperty(CanvasRenderingContext2D.prototype, "fillText", descriptors.fillText);
    Object.defineProperty(CanvasRenderingContext2D.prototype, "strokeText", descriptors.strokeText);
    Object.defineProperty(CanvasRenderingContext2D.prototype, "font", descriptors.font);
    Object.defineProperty(OfflineAudioContext.prototype, "startRendering", descriptors.startRendering);
    window.removeEventListener(`${nonce}:ping`, pingListener);
    window.removeEventListener(`${nonce}:restore`, restoreListener);
    // Closure state (descriptors, sets, listeners) becomes unreachable after this.
  };
  window.addEventListener(`${nonce}:restore`, restoreListener);

  // ── Install wrappers ───────────────────────────────────────────────────
  // (toDataURL, toBlob, getImageData, startRendering, measureText,
  //  fillText, strokeText, font setter — see wrapper sections below)
}
```

The key differences from the old design:
- **No `window.__hgNonce`**: the nonce is a parameter of `installHooks`, captured in the closure.
- **No `window.__hgHooksInstalled`**: idempotency is via the `<nonce>:ping` CustomEvent. If the closure is already installed, its `pingListener` sets `detail.installed = true` on the synchronous ping event, and the new invocation returns.
- **No `window.__hgRestore`**: restore is via the `<nonce>:restore` CustomEvent, dispatched by the background. The closure's `restoreListener` does the cleanup.
- **All state in the closure**: `descriptors`, `originals`, `textContexts`, `fontFamiliesByContext`, `allFontSets`, `pingListener`, `restoreListener` are all local variables inside `installHooks`. After restore, the closure becomes unreachable.

### Wrapper pattern

Each wrapper follows the same shape. `toDataURL` and `toBlob` are the simplest — they always report `canvas`:

```ts
function makeWrapper(origFn: Function, api: "canvas" | "audio" | "fonts", report: () => boolean): Function {
  const wrapper = function (this: unknown, ...args: unknown[]) {
    let result: unknown;
    let threw = false;
    try {
      result = (origFn as Function).apply(this, args);
    } catch (e) {
      threw = true;
      // Report before rethrowing — the script URL is on the stack now.
      if (report()) dispatch(api);
      throw e;
    }
    if (report()) dispatch(api);
    return result;
  };
  // Preserve identity-critical properties.
  Object.defineProperty(wrapper, "name", { value: origFn.name, configurable: true });
  Object.defineProperty(wrapper, "length", { value: origFn.length, configurable: true });
  wrapper.toString = function () { return originals[origFn.name]?.toString?.() ?? origFn.toString(); };
  // Make toString itself look native.
  Object.defineProperty(wrapper.toString, "name", { value: "toString" });
  return wrapper;
}
```

The `dispatch` function extracts the calling script URL from `new Error().stack` and dispatches the CustomEvent. Because `installHooks` is injected via `func` (not a file), the hook's own stack frame does not contain a script URL — it appears as an anonymous function. `extractScriptUrl` skips frames that are not `http(s)` URLs:

```ts
function dispatch(api: "canvas" | "audio" | "fonts") {
  const stack = new Error().stack ?? "";
  const scriptUrl = extractScriptUrl(stack);
  if (!scriptUrl) return;
  window.dispatchEvent(new CustomEvent(nonce, { detail: { api, scriptUrl } }));
}

function extractScriptUrl(stack: string): string | null {
  const lines = stack.split("\n");
  for (const line of lines) {
    // The hook's own frame is an anonymous function injected via executeScript;
    // it has no http(s) URL, so it is naturally skipped by the URL match.
    const match = line.match(/https?:\/\/[^\s)]+/);
    if (match) return match[0];
  }
  return null;
}
```

### Canvas-text heuristic (getImageData)

`getImageData` only reports `canvas` when the same context has had `fillText` or `strokeText` called:

```ts
// WeakSet of contexts that have had text drawn on them.
const textContexts = new WeakSet<CanvasRenderingContext2D>();

// Wrap fillText and strokeText to mark contexts.
// (These wrappers do NOT report; they only track.)
for (const method of ["fillText", "strokeText"] as const) {
  const orig = CanvasRenderingContext2D.prototype[method];
  const wrapped = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    textContexts.add(this);
    return (orig as Function).apply(this, args);
  };
  // Preserve name/length/toString as above.
  Object.defineProperty(CanvasRenderingContext2D.prototype, method, { value: wrapped });
}

// getImageData wrapper: report only if the context has had text drawn.
const getImageDataWrapper = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
  const hadText = textContexts.has(this);
  let result: unknown;
  try {
    result = (originals.getImageData as Function).apply(this, args);
  } catch (e) {
    if (hadText) dispatch("canvas");
    throw e;
  }
  if (hadText) dispatch("canvas");
  return result;
};
```

Note: `fillText` and `strokeText` wrappers are installed alongside the five reporting wrappers, but they do not dispatch CustomEvents — they only mark the context in a `WeakSet`. They follow the same observe-only rules (call original, return unchanged, rethrow same, preserve name/length/toString, restore on un-haunt).

### Font-probing heuristic (measureText)

`measureText` reports `fonts` only when one script measures 20 or more distinct font-family strings:

```ts
// Per-context set of font-family strings seen via ctx.font.
const fontFamiliesByContext = new WeakMap<CanvasRenderingContext2D, Set<string>>();

// Wrap the `font` setter to track distinct font families.
const fontDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font")!;
const originalFontSet = fontDesc.set!;
const newFontSet = function (this: CanvasRenderingContext2D, value: string) {
  const families = parseFontFamilies(value);
  if (families.length) {
    let set = fontFamiliesByContext.get(this);
    if (!set) { set = new Set(); fontFamiliesByContext.set(this, set); }
    for (const f of families) set.add(f.toLowerCase());
  }
  return originalFontSet.call(this, value);
};
Object.defineProperty(CanvasRenderingContext2D.prototype, "font", { ...fontDesc, set: newFontSet });

// measureText wrapper: report only if 20+ distinct font families have been seen on this context.
// The count is global across all contexts (one script probing fonts usually uses one context).
let globalFontCount = 0;
const allFontSets = new Set<string>(); // global dedup across contexts

const measureTextWrapper = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
  let result: unknown;
  try {
    result = (originals.measureText as Function).apply(this, args);
  } catch (e) {
    if (allFontSets.size >= 20) dispatch("fonts");
    throw e;
  }
  if (allFontSets.size >= 20) dispatch("fonts");
  return result;
};
```

`parseFontFamilies` extracts the font-family list from a CSS font shorthand string (e.g. `"14px Arial, sans-serif"` → `["Arial", "sans-serif"]`).

### startRendering (audio)

Always reports `audio`:

```ts
const startRenderingWrapper = function (this: OfflineAudioContext, ...args: unknown[]) {
  let result: unknown;
  try {
    result = (originals.startRendering as Function).apply(this, args);
  } catch (e) {
    dispatch("audio");
    throw e;
  }
  dispatch("audio");
  return result;
};
```

### toBlob (async)

`toBlob` takes a callback. The wrapper reports on the call (not the callback), so it is synchronous like the others:

```ts
const toBlobWrapper = function (this: HTMLCanvasElement, ...args: unknown[]) {
  dispatch("canvas");
  return (originals.toBlob as Function).apply(this, args);
};
```

### Restore

The closure installs a `<nonce>:restore` event listener (shown in the Installation section above). When the background dispatches `<nonce>:restore` on the target tab's `window` (via `executeScript({ func, args })`), the `restoreListener` restores every original descriptor via `Object.defineProperty`, removes both the `<nonce>:ping` and `<nonce>:restore` listeners, and nulls its reference to the state. After restore, the closure is unreachable and all state is garbage-collected.

Because the hooks never set any property on `window`, there is nothing to `delete` — the only traces (the two event listeners) are removed by `removeEventListener` inside `restoreListener`.

## Background Integration (`src/background/router.ts`)

### HAUNT

The `haunt()` function is modified to inject the content script, send the nonce to the tab via `chrome.tabs.sendMessage`, and then inject the hook function in the MAIN world:

```ts
import { installHooks } from "../content/hooks";

async function haunt(tabId: number): Promise<TabState> {
  const state = await getState(tabId);
  if (state.restricted) return state;
  try {
    // 1. Content script (isolated world) — existing.
    await api.scripting.executeScript({ target: { tabId }, files: ["content.js"] });

    // 2. Generate or reuse nonce for this tab.
    const existing = await session.get(`nonce:${tabId}`);
    const nonce = existing ?? crypto.randomUUID();
    await session.set({ [`nonce:${tabId}`]: nonce });

    // 3. Send nonce to content script (it cannot read storage.session).
    await api.tabs.sendMessage(tabId, { type: "vampires", nonce } satisfies ContentMessage);

    // 4. Inject hooks in MAIN world via func + args.
    await api.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: installHooks,
      args: [nonce],
    });
  } catch (e) {
    return { ...state, error: message(e) };
  }
  await session.set({ [hauntKey(tabId)]: true });
  return { ...state, haunted: true };
}
```

### UNHAUNT

The `unhaunt()` function dispatches `<nonce>:restore` in the MAIN world before sending the `unhaunt` message to the content script. No separate restore bundle is needed — a small inline function is injected via `func`:

```ts
async function unhaunt(tabId: number): Promise<TabState> {
  // Restore MAIN-world prototypes.
  const existing = await session.get(`nonce:${tabId}`);
  if (existing) {
    const nonce = existing as string;
    try {
      await api.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (n: string) => window.dispatchEvent(new CustomEvent(`${n}:restore`)),
        args: [nonce],
      });
    } catch { /* page already gone */ }
  }
  // Existing: send unhaunt message to content script.
  try {
    await api.tabs.sendMessage(tabId, { type: "unhaunt" } satisfies ContentMessage);
  } catch { /* no receiving end */ }
  await session.remove(hauntKey(tabId));
  await session.remove(`nonce:${tabId}`);
  await clearTab(tabId);
  return getState(tabId);
}
```

### Nonce delivery

Content scripts run in an isolated world and cannot access `chrome.storage.session`. The background delivers the nonce to the content script via `chrome.tabs.sendMessage(tabId, { type: "vampires", nonce })`. This message is a new `ContentMessage` variant:

```ts
type ContentMessage =
  | { type: "haunt" }
  | { type: "unhaunt" }
  | { type: "vampires"; nonce: string }   // NEW
  | { type: "EXORCISE"; company: string; domains: string[] }
  | ...;
```

The content script listens for `{ type: "vampires", nonce }`, uses the nonce to start the vampire bridge (listening for CustomEvents with that nonce as the type), and then the background injects the hook.

### `executeScript` with `func` instead of `files`

`chrome.scripting.executeScript` passes `args` to the injected function's parameters only when using `func`, not `files`. With `files`, the script is loaded as a file and `args` are ignored. Therefore `installHooks` is injected via `func: installHooks, args: [nonce]`, and the restore dispatch uses `func: (n) => window.dispatchEvent(...), args: [nonce]`. No `hooks.js` or `hooks-restore.js` bundles are built.

## Isolated-World Bridge (`src/content/hooks-bridge.ts`)

The content script's isolated world listens for the CustomEvent, validates the payload, resolves the company, and merges vampire info.

```ts
import { lookup, matchTracker } from "./matcher";
import trackerJson from "../data/trackers.json";
import type { CompanyHit, TrackerData } from "../data/types";

const data = trackerJson as TrackerData;

export interface VampireReport {
  api: "canvas" | "audio" | "fonts";
  scriptUrl: string;
}

export interface VampireBridge {
  /** Start listening for reports with the given nonce. */
  start(nonce: string, siteHost: string, onVampire: (company: string, api: VampireReport["api"]) => void): void;
  /** Stop listening. */
  stop(): void;
}

export function createVampireBridge(): VampireBridge {
  let handler: ((e: Event) => void) | null = null;

  return {
    start(nonce, siteHost, onVampire) {
      const seen = new Set<string>(); // "scriptUrl|api" dedup
      handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || typeof detail !== "object") return;
        const { api, scriptUrl } = detail;
        if (api !== "canvas" && api !== "audio" && api !== "fonts") return;
        if (typeof scriptUrl !== "string") return;
        const key = `${scriptUrl}|${api}`;
        if (seen.has(key)) return;
        seen.add(key);
        // Attribution: resolve company via matcher.
        let host: string;
        try { host = new URL(scriptUrl).hostname; } catch { return; }
        // First-party check: page's own host or subdomain.
        if (isFirstParty(host, siteHost)) return;
        const company = matchTracker(host, data, siteHost);
        if (company) {
          onVampire(company, api);
        } else {
          // Unlisted third-party host: vampire named by host.
          onVampire(host, api);
        }
      };
      window.addEventListener(nonce, handler);
    },
    stop() {
      if (handler) window.removeEventListener(handler.type, handler);
      handler = null;
    },
  };
}

function isFirstParty(host: string, siteHost: string): boolean {
  const h = host.toLowerCase();
  const s = siteHost.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}
```

### First-party check

The bridge reuses `matchTracker` which already handles the first-party exclusion (page's own host, same-company). However, `matchTracker` returns `null` for both first-party and unknown. The bridge needs to distinguish:
- Known tracker → use the company name.
- Unknown third-party → use the host as the vampire name.
- First-party → ignore.

So the bridge does its own first-party check (`isFirstParty`) before calling `matchTracker`. If `matchTracker` returns null but the host is not first-party, it is an unlisted third-party → vampire named by host.

### Deduplication

The `seen` Set tracks `"scriptUrl|api"` pairs. At most one report per script+API is accepted. This prevents a script that calls `toDataURL` in a loop from flooding the bridge.

## CompanyHit Vampire Info (`src/data/types.ts`)

```ts
/** Vampire info attached to a CompanyHit. */
export interface VampireInfo {
  /** APIs caught at runtime, deduplicated. */
  caught: ("canvas" | "audio" | "fonts")[];
  /** True when identified by fingerprinting score ≥ 2 but never caught. */
  knownOnly: boolean;
}

export interface CompanyHit {
  company: string;
  domains: string[];
  count: number;
  categories: string[];
  fingerprinting: number;
  /** Present when the company is a vampire (caught or known). */
  vampire?: VampireInfo;
}
```

### Merge logic

The merge runs in the content script, in `render.ts`. When a caught report arrives:

```ts
function mergeVampire(companies: Map<string, CompanyHit>, company: string, api: VampireApi): CompanyHit[] {
  let hit = companies.get(company);
  if (!hit) {
    // New vampire from an unlisted host (or a tracker not yet in scanner results).
    hit = {
      company,
      domains: [company], // the host itself
      count: 0,
      categories: [],
      fingerprinting: 0,
      vampire: { caught: [api], knownOnly: false },
    };
    companies.set(company, hit);
  } else {
    if (!hit.vampire) hit.vampire = { caught: [], knownOnly: false };
    if (!hit.vampire.caught.includes(api)) hit.vampire.caught.push(api);
    hit.vampire.knownOnly = false; // caught takes priority
  }
  return [...companies.values()];
}
```

### Known vampires (fingerprinting score ≥ 2)

The scanner already populates `fingerprinting` from the tracker data. After each scanner update, the render function checks for companies with `fingerprinting >= 2` and no `vampire.caught`:

```ts
function markKnownVampires(companies: CompanyHit[]): CompanyHit[] {
  for (const c of companies) {
    if (c.fingerprinting >= 2 && (!c.vampire || c.vampire.caught.length === 0)) {
      if (!c.vampire) c.vampire = { caught: [], knownOnly: true };
      else c.vampire.knownOnly = true;
    }
  }
  return companies;
}
```

## Vampire Sprite (`src/content/costume/vampires.ts`)

### Art

The vampire sprite is 16×18 art pixels, rendered at 3× scale (48×54 CSS px). It has a cape with `#660000` lining and `#ff0033` eyes. The sprite is defined in `art.ts` as a character map, following the existing `GHOST` pattern:

```ts
export const VAMPIRE = [
  ".......oo.......",
  "......oWWo......",
  ".....oWWWWo.....",
  "....oWWRRWWo....",
  "....oWWRRWWo....",
  "....oWWWWWWo....",
  "...oWWWWWWWWo...",
  "...oWWWWWWWWo...",
  "..oWWWWWWWWWWo..",
  "..oWWWWWWWWWWo..",
  "..oWWWWWWWWWWo..",
  ".oWWWWWWWWWWWWo.",
  ".oWWWWWWWWWWWWo.",
  "oCCCCCCCCCCCCCCo",
  "oCCCCCCCCCCCCCCo",
  "oCCCCCCCCCCCCCCo",
  "oCoooooCCoooooCo",
  ".oo....oo....oo.",
];
export const vampireLegend: Legend = {
  o: P.crypt, W: P.ghostWhite, R: P.vampireGlow, C: P.vampireLining,
};
```

This follows the same pattern as the existing `GHOST` and `WEBMASTER` sprites in `art.ts`. The `mapToPx` and `svgMarkup` helpers turn it into an inline SVG.

### Glow

```css
.vampire .sprite {
  filter: drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999);
}
```

This is the hot backlight (ref 07 in DESIGN.md), distinct from the ghost's cool `#6633cc` glow.

### Label

Same style as the ghost label: Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis. Shows the company name (for a known tracker) or the host name (for an unlisted third-party).

### Known vs caught

A "known" vampire (never caught) renders at 60% opacity with no glow filter:

```css
.vampire.known .sprite { opacity: 0.6; filter: none; }
.vampire.known .tag { color: #9999cc; }
```

### Slot assignment

Vampires use the same `planSlots` function from `ghosts.ts`. Vampires are placed after ghosts in the sorted order. The `updateGhosts` function is extended to also place vampires:

```ts
// In render.ts, after scanner + vampire bridge updates:
const all = [...scan.companies].sort(byCountThenName);
const ghosts = all.filter(c => !c.vampire);
const vampires = all.filter(c => c.vampire);
const sorted = [...ghosts, ...vampires];
updateGhosts(lanes, sorted, slots, opts);
```

Vampire elements get `class="ghost vampire"` (or `class="ghost vampire known"`) so they reuse the slot-positioning logic but get the vampire sprite and glow.

### Drift

After the haunt moment, a caught vampire drifts with a bob of ±2px vertical over 3000ms (slower and smaller than the ghost's ±4px/4000ms). Known vampires do not drift.

```css
.vampire:not(.known) .bob { animation: hg-vampire-bob 3000ms ease-in-out var(--phase, 0ms) infinite alternate; }
@keyframes hg-vampire-bob { from { transform: translateY(-2px); } to { transform: translateY(2px); } }
```

## Vampire Card (`src/content/costume/card.ts`)

The `openCard` function is extended to handle vampire hits. When the hit has `vampire` set, the card uses the vampire variant:

- Title bar: `#660000` ground (instead of `#330066`), titled `Vampire identified`.
- Body:
  - The script host (wraps at `/`).
  - For caught vampires: `Caught doing:` + a list (`canvas`, `audio`, `fonts`).
  - For caught vampires: `Caught since you haunted this page` (the honest line).
  - For known vampires: `Known to fingerprint` (no "caught" line).
  - One line on what fingerprinting is.
  - If the hit's company is a known tracker (i.e. it appears in `trackers.json`): `[Exorcise <company>]` button.
  - If the hit is an unlisted third-party host: no Exorcise button.

The card is built inside `#cards` following the same frame style, with the title-bar colour change. The `[Exorcise]` button routes through the same `send({ type: "EXORCISE", ... })` path as the ghost card.

```ts
function openVampireCard(cards: HTMLElement, hit: CompanyHit, opener: HTMLElement, opts: CardOptions): HTMLElement {
  // ... same frame as openCard but title bar #660000 ...
  const bar = card.querySelector(".bar")!;
  (bar as HTMLElement).style.background = PALETTE.vampireLining;
  card.querySelector("h2")!.textContent = "Vampire identified";
  // Body
  const host = hit.domains[0] ?? hit.company;
  card.querySelector(".cat")!.textContent = "";
  // script host
  card.querySelector(".domains")!.textContent = host;
  // caught/known
  if (hit.vampire?.caught.length) {
    card.querySelector(".seen")!.textContent = `Caught doing: ${hit.vampire.caught.join(", ")}`;
    // Honest line
    const honest = doc.createElement("p");
    honest.className = "honest";
    honest.textContent = "Caught since you haunted this page";
    card.querySelector(".card-body")!.insertBefore(honest, card.querySelector(".act"));
  } else {
    card.querySelector(".seen")!.textContent = "Known to fingerprint";
  }
  // Exorcise button only for known tracker companies
  if (isKnownTracker(hit.company, data)) {
    act.textContent = `Exorcise ${hit.company}`;
    act.addEventListener("click", () => opts.send({ type: "EXORCISE", company: hit.company, domains: hit.domains }));
  } else {
    act.remove(); // no Exorcise for unlisted hosts
  }
  return card;
}
```

## Haunt-Moment Integration (`src/content/costume/haunt-moment.ts`)

The existing `playHaunt` timeline already has a vampire phase at 1800–2100ms. This spec implements it:

| Phase | Elements | Keyframes | Duration | Easing |
|-------|----------|-----------|----------|--------|
| Vampire fade-in | `.vampire` | `opacity: 0 → 1`, `translateY(8px) → translateY(0)` | 300ms | `cubic-bezier(.2,.8,.2,1)` |
| Glow swell | `.vampire:not(.known) .sprite` | `filter: drop-shadow(0 0 0px) → drop-shadow(0 0 6px #ff0033)` | 300ms (one swell) | `cubic-bezier(.2,.8,.2,1)` |

Under reduced motion, vampires appear at full opacity at 300ms (with the cross-fade), no glow swell, no drift.

## HUD Updates

The existing `setCounts` function from `hud.ts` already accepts a `vampires` count. The render function passes the number of companies with `vampire` set:

```ts
const vampireCount = companies.filter(c => c.vampire).length;
setCounts(hud, { ghosts: companies.filter(c => !c.vampire).length, vampires: vampireCount, tombstones: 0, curses: 0 });
```

## Popup Vampire Rows (`src/popup/screens.ts`)

The haunted screen's list surface is extended to show vampires after ghosts:

```
+------------------------------------------+
|  Ghosts                           7      |
|  [g] AdCo Inc                [Exorcise]  |
|  Vampires                         1      |
|  [v] cdn.example-metrics.net   [Caught]  |
|      Canvas + audio fingerprinting       |
|  [v] EvilCorp                [Known]     |
|      Known to fingerprint                 |
+------------------------------------------+
```

Each vampire row:
- 32px icon tile: the vampire sprite (using the existing `sprite(doc, "vampire", 16, ...)` from `sprites.ts`).
- Company or host name (15px ink).
- Short line (13px muted): `Canvas + audio fingerprinting` (caught APIs joined) or `Known to fingerprint`.
- Pill on the right: `Caught` (`#f1ecfb`/`#6633cc`) or `Known` (`#e3e6ec`/`#5b6170`).
- If the vampire is a known tracker company: `[Exorcise]` secondary button (same as ghost rows).
- If the vampire is an unlisted third-party host: no Exorcise button, just the pill.

```ts
function vampireRow(doc: Document, v: CompanyHit, exorcised: boolean, onExorcise: ScreenProps["onExorcise"]): HTMLElement {
  const caught = v.vampire!.caught;
  const knownOnly = v.vampire!.knownOnly;
  const pillClass = caught.length ? "pill-caught" : "pill-known";
  const pillText = caught.length ? "Caught" : "Known";
  const sub = caught.length
    ? caught.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(" + ") + " fingerprinting"
    : "Known to fingerprint";
  // ... build row with icon, name, sub, pill, and optional Exorcise ...
}
```

When no vampires are found: `No vampires. Your blood is safe.` (matching the per-kind empty state from DESIGN.md).

## Render Integration (`src/content/costume/render.ts`)

```ts
import { createVampireBridge } from "../hooks-bridge";

// In renderCostume(), after scanner setup:
const bridge = createVampireBridge();

// The nonce arrives via the { type: "vampires", nonce } message from the background.
// The content script cannot read chrome.storage.session directly.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "vampires" && typeof msg.nonce === "string") {
    bridge.start(msg.nonce, win.location.hostname, (company, api) => {
      // Merge vampire info into the scanner results.
      scan = { ...scan, companies: mergeVampire(scan.companies, company, api) };
      // Update HUD, ghosts/vampires, and popup.
      updateAll(scan);
    });
  }
});

// On scanner update, also mark known vampires:
scanner.onUpdate = (result) => {
  scan = markKnownVampires(result);
  updateAll(scan);
  send({ type: "TRACKER_UPDATE", companies: scan.companies, total: scan.total });
};

// Un-haunt: stop the bridge (removes the CustomEvent listener).
onUnhaunt(doc, () => {
  bridge.stop();
  // ... existing cleanups ...
});
```

### Nonce delivery

The background sends `{ type: "vampires", nonce }` via `chrome.tabs.sendMessage` after injecting the content script and before injecting the hook. The content script receives this message in its `chrome.runtime.onMessage` handler, starts the vampire bridge, and is ready to receive CustomEvents before the first wrapper call can fire.

## Non-Destructive Guarantee

- The hooks install wrappers on five prototype methods + two tracking wrappers (`fillText`, `strokeText`) + one property descriptor (`font`). All are restored on un-haunt via `Object.defineProperty` with the exact original descriptors saved at install time.
- The wrappers call the original with the same `this` and arguments, return the same result, and rethrow the same exceptions. The page's behaviour is identical.
- The only observable side effect is the `CustomEvent` dispatch, which uses a random nonce unknown to the page. The page's own scripts cannot listen for it (they don't know the event name).
- The `WeakSet` (text contexts) and `WeakMap` (font families) are per-document closure state and are discarded when the page navigates or un-haunts.
- No property is ever set on `window` — the hooks use a closure for all state. After restore, the closure is unreachable and the two event listeners (`<nonce>:ping`, `<nonce>:restore`) are removed.
- After un-haunt, all wrapped methods are the original function objects (identity-equal). `document.documentElement.outerHTML` is unchanged (the hooks don't touch the DOM).

## Test Strategy

### Unit tests (`test/vampire/`)

- **`hooks.test.ts`**: calls `installHooks(nonce)` on a mock `window`, calls each wrapped method, asserts: same result as original, same exception, `name`/`length`/`toString` preserved, restore via dispatching `<nonce>:restore` puts back the exact original descriptors (identity-equal). Tests the canvas-text heuristic (getImageData reports only after fillText/strokeText), the font-probing threshold (measureText reports after 20 distinct font families), the nonce (random per haunt, different from previous), the `<nonce>:ping` idempotency check (second `installHooks` call with same nonce is a no-op), and that no property is set on `window` by the hook.
- **`attribution.test.ts`**: feeds `{ api, scriptUrl }` reports with various script URLs (known tracker host, unlisted third-party host, first-party host), asserts the company/host resolution and first-party ignoring.
- **`merge.test.ts`**: starts with scanner results, feeds caught reports, asserts the `vampire.caught` array is extended (deduplicated), a report for an unlisted host creates a new `CompanyHit` with `count: 0`, and a known vampire (fingerprinting ≥ 2) gets `knownOnly: true`.

### Fixture page (`fixtures/vampires.html`)

A standalone HTML page with a sign-up form. Scripts served from two hosts mapped by `--host-resolver-rules`:
- One tracker host from `trackers.json` with `fingerprinting: 0` (so it is a ghost but not a "known" vampire — it must be *caught* to become a vampire).
- One unlisted host (not in `trackers.json`).

The scripts fingerprint canvas, audio, and fonts when the email field gets focus:

```html
<form>
  <label>Email <input type="email" id="email" autofocus></label>
  <button type="submit">Sign up</button>
</form>
<script src="http://tracker-host:4321/t/fingerprint.js"></script>
<script src="http://unlisted-host:4321/t/fingerprint.js"></script>
```

Each script:
```js
// On email focus:
email.addEventListener("focus", () => {
  // Canvas fingerprint
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.fillText("fingerprint", 0, 0);
  ctx.getImageData(0, 0, 1, 1);
  c.toDataURL();
  // Audio fingerprint
  const a = new OfflineAudioContext(1, 1, 44100);
  a.startRendering();
  // Font probing
  const c2 = document.createElement("canvas");
  const ctx2 = c2.getContext("2d");
  for (const font of ["Arial", "Verdana", "Times", ... 20 fonts]) {
    ctx2.font = `12px ${font}`;
    ctx2.measureText("test");
  }
});
```

### E2E test (`e2e/vampires.spec.ts`)

1. Launch Chromium with `--host-resolver-rules` mapping the tracker host and unlisted host to `127.0.0.1`.
2. Navigate to `fixtures/vampires.html`.
3. Capture `toDataURL()` result before haunting.
4. Haunt (inject content.js + send nonce + inject `installHooks` via `func`).
5. Focus the email field → trigger fingerprinting.
6. Assert caught vampires appear in `#lanes` inside the shadow root.
7. Assert the vampire card opens with `Caught doing: canvas, audio, fonts` and the honest line.
8. Assert `toDataURL()` returns the same data URL as before haunting.
9. Un-haunt (background dispatches `<nonce>:restore` + sends `unhaunt` message).
10. Assert prototypes are restored: `HTMLCanvasElement.prototype.toDataURL === originalToDataURL` (identity check).
11. Assert `document.documentElement.outerHTML` is byte-identical.
