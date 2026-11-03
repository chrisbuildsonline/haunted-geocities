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
│      └── chrome.scripting.executeScript({ target, world: "MAIN",             │
│             files: ["hooks.js"], args: [nonce] })                             │
│                                                                               │
│    nonce = crypto.randomUUID()  (stored in session for idempotency check)      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MAIN WORLD  (hooks.js — same JS context as the page's scripts)              │
│                                                                               │
│    installs wrappers on window's prototypes:                                  │
│      HTMLCanvasElement.prototype.toDataURL / toBlob                            │
│      CanvasRenderingContext2D.prototype.getImageData                          │
│      OfflineAudioContext.prototype.startRendering                             │
│      CanvasRenderingContext2D.prototype.measureText                            │
│                                                                               │
│    each wrapper:                                                              │
│      1. calls original with same this + args                                   │
│      2. on success: dispatches CustomEvent(nonce, { api, scriptUrl })         │
│      3. returns result / rethrows exception unchanged                         │
│      4. name, length, toString preserved                                      │
│                                                                               │
│    restores originals on signal (cleanup symbol on window)                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  ISOLATED WORLD  (content.js — content script)                                │
│                                                                               │
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
    router.ts            # (modified) injects hooks.js in MAIN world on HAUNT
  content/
    hooks.ts             # NEW: MAIN-world wrapper script (built as hooks.js)
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
    hooks.test.ts        # wrapper identity, same results, restore, toString, nonce
    attribution.test.ts  # known tracker → company, unlisted → host, first-party → ignored
    merge.test.ts        # caught extends existing, unlisted creates new, dedup

fixtures/
  vampires.html          # NEW: sign-up form with fingerprinting scripts

e2e/
  vampires.spec.ts       # NEW: haunt, focus, caught vampires, toDataURL same, restored
```

## MAIN-World Hook Script (`src/content/hooks.ts`)

The hook script is built as a standalone IIFE (`hooks.js`), injected via `chrome.scripting.executeScript({ world: "MAIN" })`. Like `content.js`, it cannot use ES module imports at runtime — Vite bundles it as a self-contained file.

### Installation

```ts
// hooks.ts (bundled as hooks.js)
// The nonce is passed as executeScript args[0].
const nonce = (globalThis as { __hgNonce?: string }).__hgNonce;

// Idempotent: if already installed on this window, do nothing.
const MARK = "__hgHooksInstalled";
if ((globalThis as Record<string, unknown>)[MARK]) return;
(globalThis as Record<string, unknown>)[MARK] = true;

// Save original descriptors.
const descriptors = {
  toDataURL: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toDataURL")!,
  toBlob: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob")!,
  getImageData: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "getImageData")!,
  startRendering: Object.getOwnPropertyDescriptor(OfflineAudioContext.prototype, "startRendering")!,
  measureText: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "measureText")!,
};
const originals = {
  toDataURL: HTMLCanvasElement.prototype.toDataURL,
  toBlob: HTMLCanvasElement.prototype.toBlob,
  getImageData: CanvasRenderingContext2D.prototype.getImageData,
  startRendering: OfflineAudioContext.prototype.startRendering,
  measureText: CanvasRenderingContext2D.prototype.measureText,
};
```

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

The `dispatch` function extracts the calling script URL from `new Error().stack` and dispatches the CustomEvent:

```ts
function dispatch(api: "canvas" | "audio" | "fonts") {
  const stack = new Error().stack ?? "";
  // First http(s) URL that is not this hook script's own URL.
  const scriptUrl = extractScriptUrl(stack);
  if (!scriptUrl) return;
  window.dispatchEvent(new CustomEvent(nonce, { detail: { api, scriptUrl } }));
}

function extractScriptUrl(stack: string): string | null {
  const lines = stack.split("\n");
  for (const line of lines) {
    // Skip the hook frame (this file).
    if (line.includes("hooks.js")) continue;
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

The hook script stores a cleanup function on `window` that the content script calls (via a CustomEvent) on un-haunt:

```ts
// Store cleanup on window for the content script to trigger.
(globalThis as Record<string, unknown>)["__hgRestore"] = function () {
  // Restore exact original descriptors.
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", descriptors.toDataURL);
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", descriptors.toBlob);
  Object.defineProperty(CanvasRenderingContext2D.prototype, "getImageData", descriptors.getImageData);
  Object.defineProperty(CanvasRenderingContext2D.prototype, "measureText", descriptors.measureText);
  Object.defineProperty(CanvasRenderingContext2D.prototype, "font", fontDesc);
  Object.defineProperty(CanvasRenderingContext2D.prototype, "fillText", descriptors.fillText);
  Object.defineProperty(CanvasRenderingContext2D.prototype, "strokeText", descriptors.strokeText);
  Object.defineProperty(OfflineAudioContext.prototype, "startRendering", descriptors.startRendering);
  delete (globalThis as Record<string, unknown>)[MARK];
  delete (globalThis as Record<string, unknown>)["__hgRestore"];
  delete (globalThis as Record<string, unknown>)["__hgNonce"];
};
```

The content script triggers restore by dispatching a CustomEvent named `__hgRestore` (or calling `window.__hgRestore()` via `executeScript` again). The simplest approach: the background injects a second MAIN-world script on UNHAUNT that calls the cleanup function.

## Background Integration (`src/background/router.ts`)

### HAUNT

The `haunt()` function is modified to inject the hook script alongside the content script:

```ts
async function haunt(tabId: number): Promise<TabState> {
  const state = await getState(tabId);
  if (state.restricted) return state;
  try {
    // Content script (isolated world) — existing.
    await api.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    // MAIN-world hooks — new. Generate a random nonce per haunt.
    const nonce = crypto.randomUUID();
    await api.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["hooks.js"],
      args: [nonce],
    });
    // Store the nonce in session so re-injection can check idempotency.
    await session.set({ [`nonce:${tabId}`]: nonce });
  } catch (e) {
    return { ...state, error: message(e) };
  }
  await session.set({ [hauntKey(tabId)]: true });
  return { ...state, haunted: true };
}
```

### UNHAUNT

The `unhaunt()` function is modified to inject a restore script in the MAIN world before sending the `unhaunt` message to the content script:

```ts
async function unhaunt(tabId: number): Promise<TabState> {
  // Restore MAIN-world prototypes.
  try {
    await api.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["hooks-restore.js"],
    });
  } catch { /* page already gone */ }
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

`hooks-restore.js` is a trivial IIFE that calls `window.__hgRestore?.()`:

```ts
// hooks-restore.ts (bundled as hooks-restore.js)
(globalThis as Record<string, unknown>)["__hgRestore"]?.();
```

### Nonce delivery

The `executeScript` `args` array passes the nonce to the MAIN-world script. Inside `hooks.js`, the args are available as the function's parameters. Vite bundles the script as an IIFE; the `args` arrive as the IIFE's call arguments:

```ts
// hooks.ts entry:
export default function (nonce: string) { /* install wrappers using nonce */ }
```

Vite's IIFE format wraps this so `chrome.scripting.executeScript({ args: [nonce] })` passes `nonce` as the first argument.

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

// The nonce comes from the background's session storage (or from a message).
// The background sets it in session before injecting hooks.js.
const nonce = await session.get(`nonce:${tabId}`);
bridge.start(nonce, win.location.hostname, (company, api) => {
  // Merge vampire info into the scanner results.
  scan = { ...scan, companies: mergeVampire(scan.companies, company, api) };
  // Update HUD, ghosts/vampires, and popup.
  updateAll(scan);
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

The background stores the nonce in `chrome.storage.session` under `nonce:${tabId}`. The content script reads it on haunt. Alternatively, the background can send the nonce via a `chrome.tabs.sendMessage` after injection. The session-storage approach is simpler and consistent with the existing haunt-key pattern.

## Non-Destructive Guarantee

- The hooks install wrappers on five prototype methods + two tracking wrappers (`fillText`, `strokeText`) + one property descriptor (`font`). All are restored on un-haunt via `Object.defineProperty` with the exact original descriptors saved at install time.
- The wrappers call the original with the same `this` and arguments, return the same result, and rethrow the same exceptions. The page's behaviour is identical.
- The only observable side effect is the `CustomEvent` dispatch, which uses a random nonce unknown to the page. The page's own scripts cannot listen for it (they don't know the event name).
- The `WeakSet` (text contexts) and `WeakMap` (font families) are per-document and are discarded when the page navigates or un-haunts.
- After un-haunt, all wrapped methods are the original function objects (identity-equal). `document.documentElement.outerHTML` is unchanged (the hooks don't touch the DOM).

## Test Strategy

### Unit tests (`test/vampire/`)

- **`hooks.test.ts`**: installs wrappers on a mock `window`, calls each wrapped method, asserts: same result as original, same exception, `name`/`length`/`toString` preserved, restore puts back the exact original descriptors (identity-equal). Tests the canvas-text heuristic (getImageData reports only after fillText/strokeText), the font-probing threshold (measureText reports after 20 distinct font families), and the nonce (random per haunt, different from previous).
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
4. Haunt (inject content.js + hooks.js).
5. Focus the email field → trigger fingerprinting.
6. Assert caught vampires appear in `#lanes` inside the shadow root.
7. Assert the vampire card opens with `Caught doing: canvas, audio, fonts` and the honest line.
8. Assert `toDataURL()` returns the same data URL as before haunting.
9. Un-haunt.
10. Assert prototypes are restored: `HTMLCanvasElement.prototype.toDataURL === originalToDataURL` (identity check).
11. Assert `document.documentElement.outerHTML` is byte-identical.
