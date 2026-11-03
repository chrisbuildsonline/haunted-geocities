# Design: Scaffold

## Context

This spec establishes the extension shell for Haunted GeoCities: manifest, build, background service worker, content script, popup, per-tab state, e2e harness, and Dockerfile. It does not implement costume features (ghosts, vampires, tombstones, curses) — those are separate specs that build on this scaffold.

Steering references: `product.md` (permissions model, scope boundaries), `tech.md` (language, build, Chrome MV3, overlay, audio, data, test/CI), `structure.md` (directory layout), `non-destructive-dom.md` (Shadow DOM, adopted stylesheets, reversibility), `accessibility-and-motion.md` (motion, keyboard, contrast, audio), `era-accuracy.md` (permitted 1998 techniques). Design reference: `design/DESIGN.md` Popup and Tokens sections.

## Architecture Overview

```
┌─────────────┐    HAUNT / UNHAUNT / GET_STATE    ┌──────────────────┐
│   Popup UI   │ ──────────────────────────────► │  Background SW    │
│  (popup.html) │ ◄────────────────────────────── │  (background.ts)  │
└─────────────┘    state response, status          └────────┬─────────┘
                                                          │
                    chrome.scripting.executeScript         │
                    chrome.tabs.sendMessage                │
                                                          ▼
                                               ┌──────────────────────┐
                                               │   Content Script      │
                                               │   (content.ts)         │
                                               │                        │
                                               │   Shadow DOM host       │
                                               │   <hg-crypt>            │
                                               │     └─ shadow root     │
                                               │        (closed)         │
                                               └──────────────────────┘
```

**Communication flow:**
1. Popup sends a `HAUNT` message to the background via `chrome.runtime.sendMessage`.
2. Background injects the content script into the active tab via `chrome.scripting.executeScript` (uses `activeTab` + `scripting`, no `host_permissions`).
3. Content script appends a Shadow DOM host `<hg-crypt>` to `document.documentElement`, creates a closed shadow root, and notifies the background that haunt succeeded.
4. Background sets `storage.session[tabId] = true`.
5. Popup polls or listens for state changes to update its screen.
6. Un-haunt: popup sends `UNHAUNT` → background sends `unhaunt` to the content script via `chrome.tabs.sendMessage` → content script removes the shadow host and adopted stylesheets → notifies background → background sets `storage.session[tabId] = false`.

## Module Layout

```
src/
  manifest.ts          # manifest.json generated from this typed object
  background/
    index.ts           # service worker entry: message router
    haunt.ts           # HAUNT handler: inject content script, set state
    unhaunt.ts         # UNHAUNT handler: message content script, set state
    state.ts           # GET_STATE handler + storage.session read/write
    permissions.ts     # optional host permission request/remove
  content/
    index.ts           # content script entry: message listener, haunt lifecycle
    overlay.ts         # Shadow DOM host creation, shadow root, adopted stylesheets
    unhaunt.ts         # remove shadow host + adopted stylesheets, confirm to BG
  popup/
    popup.html         # popup HTML shell
    popup.ts           # popup entry: screen rendering, event wiring
    screens.ts         # render idle / haunted / restricted screens
    settings.ts        # settings surface: link-check toggle, audio toggle
    styles.css         # popup CSS (scoped, modern look from DESIGN.md)
  data/
    types.ts           # shared message types, state shape, tab-state interface
  types/
    chrome.d.ts        # chrome.* type augmentations if needed
```

Test and e2e layout:

```
test/
  manifest.test.ts     # manifest structure, permissions, no host_permissions
  build.test.ts        # dist/ output exists after build
  background.test.ts   # message routing, state management (mocked chrome APIs)
  content.test.ts      # overlay creation, unhaunt, non-destructive (jsdom)
  popup.test.ts        # screen rendering, settings toggles (jsdom)
  state.test.ts        # storage.session key format, tab cleanup
  fixtures.test.ts     # fixture pages exist, no external deps
  docker.test.ts       # Dockerfile exists, lists correct commands
e2e/
  helpers.ts           # load unpacked extension, fixture server, popup helpers
  haunt.spec.ts        # haunt/unhaunt lifecycle e2e
  popup.spec.ts        # popup screen transitions e2e
  restricted.spec.ts   # restricted page detection e2e
fixtures/
  index.html           # basic fixture page with some text content
  clean.html           # minimal page (no trackers, no dead links)
  restricted.html      # not needed — chrome:// pages are tested differently
```

## Manifest

```jsonc
{
  "manifest_version": 3,
  "name": "Haunted GeoCities",
  "version": "0.1.0",
  "description": "Transform any modern web page into a 1998 GeoCities crypt.",
  "permissions": ["activeTab", "scripting", "declarativeNetRequest", "storage"],
  "optional_host_permissions": ["http://*/*", "https://*/*"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

No `host_permissions` at install. The `optional_host_permissions` array declares `http://*/*` and `https://*/*` so they can be requested at runtime via `chrome.permissions.request({ origins: [...] })` when the user opts into cross-site link checking.

The manifest is generated from a typed TypeScript object (`src/manifest.ts`) so unit tests can assert on it without parsing JSON. The Vite build copies the generated `manifest.json` to `dist/`.

## Vite Build

**Vite config** (`vite.config.ts`):

```ts
import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        background: "src/background/index.ts",
        content: "src/content/index.ts",
        popup: "src/popup/popup.html",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  plugins: [
    {
      name: "copy-manifest",
      closeBundle() {
        copyFileSync("src/manifest.json", "dist/manifest.json");
      },
    },
  ],
});
```

**Key decisions:**
- Multiple entry points: background (service worker), content (content script), popup (HTML with inline JS/CSS).
- No code splitting between entries — each entry is a self-contained bundle. Content scripts and service workers cannot use dynamic imports in MV3 without care, so `output.format` is `"iife"` or we rely on Vite's default for single-entry outputs.
- The manifest is copied to `dist/` as a post-build step.
- `package.json` adds `"build": "vite build"` to the scripts.

## Message Protocol

All messages are typed via a discriminated union in `src/data/types.ts`:

```ts
// Popup → Background
type PopupMessage =
  | { type: "HAUNT"; tabId: number }
  | { type: "UNHAUNT"; tabId: number }
  | { type: "GET_STATE"; tabId: number };

// Background → Content (via chrome.tabs.sendMessage)
type BackgroundToContentMessage =
  | { type: "unhaunt" };

// Content → Background (via chrome.runtime.sendMessage)
type ContentToBackgroundMessage =
  | { type: "HAUNT_SUCCESS"; tabId: number }
  | { type: "UNHAUNT_SUCCESS"; tabId: number };

// Background → Popup (response)
type StateResponse =
  | { haunted: boolean; restricted: boolean };
```

## Storage Schema

Per-tab haunted state lives in `chrome.storage.session` (cleared when the browser closes, matching the "session only" scope in `product.md`).

```
Key format:  "haunt:<tabId>"
Value:       { haunted: boolean }
```

The background listens for `chrome.tabs.onRemoved` and removes the entry for that tab ID.

Audio preference (muted/unmuted) lives in `chrome.storage.local`:

```
Key: "audioEnabled"
Value: boolean  (default: false — muted by default per accessibility-and-motion.md)
```

The link-check opt-in does not need storage — it is the presence or absence of the optional `http://*/*`/`https://*/*` origin permission itself. The popup checks `chrome.permissions.contains` to render the toggle state.

## Background Service Worker

**Entry:** `src/background/index.ts`

Registers a `chrome.runtime.onMessage` listener that routes by `message.type`:

| Message | Handler | Action |
|---------|---------|--------|
| `HAUNT` | `haunt.ts` | `chrome.scripting.executeScript` into the tab, then wait for `HAUNT_SUCCESS` |
| `UNHAUNT` | `unhaunt.ts` | `chrome.tabs.sendMessage` with `{ type: "unhaunt" }`, then wait for `UNHAUNT_SUCCESS` |
| `GET_STATE` | `state.ts` | Read `storage.session["haunt:<tabId>"]`, check if tab URL is restricted |

**Restricted page detection** (`state.ts`):

A tab is restricted if its URL matches any of:
- `chrome://*`
- `chrome-extension://*`
- `edge://*`
- `about:*`
- `view-source:*`
- `https://chromewebstore.google.com/*`
- `file://*` (unless the user granted file access)

The background uses `chrome.tabs.get(tabId)` to read the URL, then matches against these patterns. The popup calls `GET_STATE` on open and receives `{ haunted, restricted }`.

**Tab cleanup:** `chrome.tabs.onRemoved` listener removes the `haunt:<tabId>` entry from `storage.session`.

## Content Script

**Entry:** `src/content/index.ts`

Listens for `chrome.runtime.onMessage` with `{ type: "unhaunt" }`.

**Haunt flow** (triggered by injection, not a message):

1. Check if `<hg-crypt>` already exists on `document.documentElement`. If so, do nothing (idempotent).
2. Create the host element: `const host = document.createElement("hg-crypt")`.
3. Attach a closed shadow root: `host.attachShadow({ mode: "closed" })`.
4. Append the host to `document.documentElement`.
5. Inject adopted stylesheets into `document.adoptedStyleSheets` if needed for body padding (scaffold only adds an empty placeholder; real costume styles come in later specs).
6. Send `{ type: "HAUNT_SUCCESS", tabId }` to the background.

**Un-haunt flow:**

1. Find the `<hg-crypt>` host element on `document.documentElement`.
2. Remove it from the DOM.
3. Remove any adopted costume stylesheets from `document.adoptedStyleSheets`.
4. Send `{ type: "UNHAUNT_SUCCESS", tabId }` to the background.

**Non-destructive guarantee:**

The content script never calls `appendChild`, `insertBefore`, `setAttribute`, or any DOM mutation on any node other than `document.documentElement` (for the shadow host) and `document.adoptedStyleSheets` (for the adopted sheet). The shadow host is `position: fixed; inset: 0; pointer-events: none; z-index: 2147483647` so it overlays without interacting. All costume content lives inside the shadow root.

## Popup

**HTML:** `src/popup/popup.html` — a 360px-wide shell with a root `<div id="app">`.

**Entry:** `src/popup/popup.ts`

On load:
1. Get the active tab via `chrome.tabs.query({ active: true, currentWindow: true })`.
2. Send `GET_STATE` to the background.
3. Render the appropriate screen based on the response.

### Screen: idle (not haunted)

```
[ghost icon] Haunted GeoCities          ( Idle )
<page URL>
<neighborhood line if available>

┌─ surface ───────────────────────────┐
│  Turn this page into a 1998 crypt.   │
│  Ghosts, vampires and dead links     │
│  show up.                            │
│  [  Haunt this page  ]  ← pill       │
└──────────────────────────────────────┘

┌─ settings surface ──────────────────┐
│  Check links to other sites   [○  ] │
│  Asks Chrome to visit linked sites.  │
│  Sound effects                [○  ] │
│  Muted                               │
└──────────────────────────────────────┘

Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0
```

### Screen: haunted

```
[ghost icon] Haunted GeoCities       ( Haunted )
<page URL>

┌─ surface ───────────────────────────┐
│  (counts — populated by later specs) │
│  [  Un-haunt  ]  ← pill              │
└──────────────────────────────────────┘

┌─ settings surface (same as idle) ────┐
│  ...                                  │
└──────────────────────────────────────┘
```

In the scaffold, counts are zero and the list surface shows the empty state: "No ghosts here. Suspiciously clean."

### Screen: restricted

```
[ghost icon] Haunted GeoCities      ( Can't haunt )
This page is protected

┌─ surface ───────────────────────────┐
│  Chrome doesn't let extensions draw   │
│  on its own pages. Open any website   │
│  and press Haunt there.               │
└──────────────────────────────────────┘

┌─ settings surface (same as idle) ────┐
│  ...                                  │
└──────────────────────────────────────┘
```

No pill is shown on the restricted screen.

### Settings surface

Shared between idle and haunted screens. Contains:

1. **"Check links to other sites" toggle** — off by default.
   - Off sub-line: `Asks Chrome to visit linked sites. Off.`
   - Turning on: calls `chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] })`.
     - Granted: toggle stays on, sub-line reads `Checking links on other sites too.`
     - Denied: toggle springs back, sub-line reads `Permission not granted.`
   - Turning off: calls `chrome.permissions.remove({ origins: ["http://*/*", "https://*/*"] })`.

2. **"Sound effects" toggle** — off (muted) by default.
   - Off sub-line: `Muted`
   - On sub-line: `On · plays only after you click`
   - Persists to `chrome.storage.local` under key `audioEnabled`.

### Popup styling

Implements the Popup tokens from `design/DESIGN.md`:
- Canvas `#eef0f4`, surfaces `#ffffff` with radius 18px, shadow `0 1px 2px rgba(17,19,24,.04), 0 8px 24px rgba(17,19,24,.06)`.
- Near-black pill: `#111318` ground, `#ffffff` text, 48px tall, full width, radius 999, 15px semibold.
- Accent `#6633cc` for toggle-on, focus rings, links.
- Text: ink `#111318`, muted `#5b6170`.
- Font: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Focus: `outline: 2px solid #6633cc; outline-offset: 2px`.
- Width: 360px.

## Fixture Pages

`fixtures/` contains standalone HTML files with no external dependencies:

- `index.html` — a page with some text content, a few links, and a `<main>` element. Used for basic haunt/unhaunt tests.
- `clean.html` — a minimal page with no trackers and no dead links. Used to test the "suspiciously clean" empty state.

Fixture pages are original content — no third-party trademarks, logos, or copyrighted images. They are served by a local HTTP server during e2e tests.

## E2E Test Harness

**Playwright config** (`playwright.config.ts`):

Updated from the minimal config to support extension testing:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Extension tests need a real browser with extensions loaded
  use: {
    headless: false, // extensions require headed mode in Chromium
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // Extension loading is handled per-test via helpers
      },
    },
  ],
});
```

**Helpers** (`e2e/helpers.ts`):

```ts
// Launch Chromium with the unpacked extension loaded
export async function launchExtensionBrowser() {
  const pathToExtension = resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });
  return context;
}

// Serve fixture pages on a random port
export async function startFixtureServer() { ... }

// Get the extension's service worker
export async function getExtensionBackground(context) { ... }

// Open the popup for a given tab
export async function openPopup(context, extensionId, tabId) { ... }
```

**Test files:**
- `haunt.spec.ts` — navigate to a fixture page, click Haunt in the popup, assert `<hg-crypt>` shadow host exists, click Un-haunt, assert it is removed and page DOM is unchanged.
- `popup.spec.ts` — verify popup shows idle screen on a normal page, haunted screen after Haunt, and correct transitions.
- `restricted.spec.ts` — navigate to `chrome://version`, open popup, assert restricted screen is shown.

**Build dependency:** E2e tests require `bun run build` to have produced `dist/`. The `test:e2e` script should build first:

```json
"test:e2e": "bun run build && playwright test --pass-with-no-tests"
```

## Dockerfile

```dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

# Install system deps for Playwright Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright's Chromium browser
RUN bunx playwright install --with-deps chromium

# Copy project files
COPY . .

# Install dependencies
RUN bun install

# Run all three checks
RUN bun run typecheck
RUN bun run test
RUN bun run test:e2e
```

The Dockerfile:
1. Uses `oven/bun:1` as the base image.
2. Installs system libraries needed for headless Chromium (Playwright).
3. Installs the Playwright Chromium browser binary.
4. Copies project files and installs Bun dependencies.
5. Runs `typecheck`, `test`, and `test:e2e` in sequence. All three must pass.

The `.dockerignore` already excludes `prototype/`, `node_modules/`, `dist/`, `.git/`, `test-results/`, `.claude/`, `.omc/`, and `design/refs/`.

## Vite Dependency

The build requires `vite` as a dev dependency. Add to `package.json`:

```json
"devDependencies": {
  "@playwright/test": "^1.64.1",
  "@types/bun": "^1.4.4",
  "typescript": "^7.0.2",
  "vite": "^7.0.0"
}
```

## TypeScript

The existing `tsconfig.json` already covers `src`, `test`, `e2e`, and `scripts` in strict mode. No changes needed for the scaffold. The `types` array includes `"bun"` which provides Bun globals for tests.

The content script and background service worker run in Chrome extension contexts, not Node/Bun. TypeScript types for `chrome.*` APIs are needed. Add `@types/chrome` as a dev dependency:

```json
"@types/chrome": "^0.0.300"
```

And add `"chrome"` to `tsconfig.json` `types` array:

```json
"types": ["bun", "chrome"]
```
