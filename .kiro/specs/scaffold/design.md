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
    styles.css         # popup CSS (scoped, 1998 Win95 look from DESIGN.md)
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

The three sketches below show what each screen contains and in what order. The boxes, buttons, toggles and the header status are drawn in the "Popup Costume (1998)" section further down, which also has the box-accurate layouts.

```
[ghost icon] Haunted GeoCities          ( Idle )
<page URL>
<neighborhood line if available>

┌─ surface ───────────────────────────┐
│  Turn this page into a 1998 crypt.   │
│  Ghosts, vampires and dead links     │
│  show up.                            │
│  [  Haunt this page  ]  ← primary    │
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
│  [  Un-haunt  ]  ← primary           │
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

No primary push button is shown on the restricted screen.

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

### Popup Costume (1998)

The popup and `permissions.html` are Windows 95 windows. This replaces the earlier modern look (canvas `#eef0f4`, white radius-18 cards, `#111318` pill, blur shadows, rounded switches). Requirements 57-78 are the contract; `design/DESIGN.md` carries the same values.

**The era costume wins over the old modern-dashboard rules.** This is a Costume Contest entry and the judges said the popup broke the costume. Where this section disagrees with the old Popup rules (no borders, no nesting, 18px radius, soft shadows, 48px pill, `system-ui`), this section wins. The popup keeps what made it scannable: one primary action, a fixed type scale, 4.5:1 contrast, the focus ring and the reduced-motion rule. The Win95 system greys (`#c0c0c0`, `#dfdfdf`, `#808080`) are not web-safe colours. They are exempt from the web-safe rule in `era-accuracy.md`, which governs the page costume, not the extension's own UI.

#### Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--face` | `#c0c0c0` | Window, button and group box face |
| `--hilite` | `#ffffff` | Bevel top-left outer, etched highlight |
| `--light` | `#dfdfdf` | Bevel top-left inner |
| `--shadow` | `#808080` | Bevel bottom-right inner, etched line, disabled label |
| `--dark` | `#000000` | Bevel bottom-right outer, default button frame, text |
| `--title` | `#000080` | Title bar ground |
| `--title-ink` | `#ffffff` | Title bar text |
| `--field` | `#ffffff` | List box, checkbox, status field ground |
| `--ink` | `#000000` | Body text |
| `--sub` | `#333333` | Sub-lines, attribution |
| `--hover` | `#ccccff` | List row hover |
| `--counter` | `#000000` / `#33ff33` | Hit-counter ground / digits |
| `--link` / `--visited` | `#0000ff` / `#800080` | Links |
| `--desktop` | `#008080` | `permissions.html` ground |
| `--accent` | `#6633cc` | Focus ring and toolbar badge only |
| Radius | `0` | Everywhere |
| Blur | `0` | Every box-shadow |

| Text | Font | Size / weight |
|------|------|---------------|
| UI | `'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, Geneva, sans-serif` | 13px / 400; sub-lines and attribution 12px / 400 |
| Title bar, primary label, group legends | UI stack | 13px / 700 |
| Site title | `"Times New Roman", Times, serif` | 24px / 700 |
| Hit-counter digits | `"Courier New", Courier, monospace` | 24px / 700, `font-variant-numeric: tabular-nums` |

Sizes: window width 360px, at most 600px tall. Title bar 24px with the 16px ghost sprite. Primary push button 40px. Small push button 24px. Checkbox 13px. List row sprite tile 32px. Spacing: 8px between group boxes, 8px window padding, 12px inside group boxes.

Tag tokens (ground / text, each with a 1px `#000000` border): Caught `#ccccff`/`#330099`, Known `#cccccc`/`#000000`, 404 `#ffcccc`/`#660000`, 410 `#ffcc99`/`#663300`, Exorcised `#cccccc`/`#333333`.

#### Bevel recipe

Every bevel is an inset `box-shadow` with `0` blur, so no border colours need juggling and corners stay square. The classes are drawn in this order, outer ring first.

```css
/* Window and push button, raised */
.raised {
  border: 0;
  background: #c0c0c0;
  box-shadow:
    inset -1px -1px 0 #000000,  /* outer bottom-right */
    inset 1px 1px 0 #ffffff,    /* outer top-left */
    inset -2px -2px 0 #808080,  /* inner bottom-right */
    inset 2px 2px 0 #dfdfdf;    /* inner top-left */
}

/* Default push button: the raised bevel plus a 1px black frame */
.primary {
  box-shadow:
    0 0 0 1px #000000,
    inset -1px -1px 0 #000000, inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf;
}
/* Pressed: the bevel inverts, the black frame stays */
.primary:active {
  box-shadow:
    0 0 0 1px #000000,
    inset 1px 1px 0 #000000, inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf;
}

/* List box, status field, checkbox: sunken */
.sunken {
  background: #ffffff;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #000000;
}

/* Group box: etched, 2px in all. The outer shadow adds the white line, so give the box a 1px margin. */
.group {
  margin: 1px;
  border: 1px solid #808080;
  box-shadow: 1px 1px 0 #ffffff, inset 1px 1px 0 #ffffff;
}
.group > legend {
  padding: 0 4px;
  background: #c0c0c0;
  font-weight: 700;
}
```

A status field is `.sunken` with the face ground and 1px of the sunken bevel (`inset 1px 1px #808080, inset -1px -1px #ffffff`), as in the Win95 status bar. The list box is 2px as above.

#### Screen: idle

```text
+==[ghost16] Haunted GeoCities========== (title #000080, bold white 13) =+
| example.org                          <- Times New Roman bold 24        |
| +- Haunt -----------------------------------------------------------+ |
| | Turn this page into a 1998 crypt.                                  | |
| | Ghosts, vampires and dead links show up.                           | |
| | [#### Haunt this page ####]  <- default push button, 40px          | |
| +--------------------------------------------------------------------+ |
| +- Settings ---------------------------------------------------------+ |
| | [ ] Check links to other sites                                     | |
| |     Asks Chrome to visit linked sites. Off.                        | |
| | [ ] Sound effects                                                  | |
| |     Muted                                                          | |
| +--------------------------------------------------------------------+ |
| [ Idle ]  [ Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0 ]  | <- sunken status bar
+========================================================================+
```

#### Screen: haunted

```text
+==[ghost16] Haunted GeoCities============================================+
| example.org                                        <- 24px bold serif   |
| TimesSquare/Midway/7315                            <- address, 12px     |
| +- Found on this page -----------------------------------------------+ |
| | [ 0007 ]  [ 0001 ]  [ 0003 ]  [ 0002 ]  <- #000 cells, #33ff33 digits | |
| |  [g]       [v]       [t]       [c]       <- 16px sprite              | |
| |  Ghosts    Vampires  Tombstones Curses   <- kind label under each     | |
| | [#### Un-haunt ####]                                                  | |
| +--------------------------------------------------------------------+ |
| +- Ghosts (7) --------------------------------------------------------+ |
| | +-sunken white list box-------------------------------------------+ | |
| | | [g32] AdCo Inc                                      [Exorcise]  | | |
| | |       4 domains · Advertising                                   | | |
| | | [g32] PixelTrack                         (Exorcised) [Let it back]| | |
| | +-----------------------------------------------------------------+ | |
| +--------------------------------------------------------------------+ |
| +- Vampires (1) / Tombstones / Curses: same list box, same rows ------+ |
| +- Settings (as idle) ------------------------------------------------+ |
| [ Haunted ]  [ Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0 ] |
+========================================================================+
```

The title bar and the status bar stay in place. The client area between them scrolls when the window reaches 600px. The counts keep the 2x2 grid under 340px. A group box holds each list, and the list box inside it scrolls at 280px. Exorcised rows lose the old 60% opacity, because the `Exorcised` tag and the `Let it back` button already say the state and the opacity would break contrast.

#### Screen: restricted

```text
+==[ghost16] Haunted GeoCities============================================+
| This page is protected                             <- 24px bold serif   |
| +- Why not -----------------------------------------------------------+ |
| | Chrome doesn't let extensions draw on its own pages. Open any website | |
| | and press Haunt there.                  (no primary push button)      | |
| +--------------------------------------------------------------------+ |
| [ Can't haunt ]  [ Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0 ] |
+========================================================================+
```

The restricted screen has no settings group box, as before (requirement 30).

#### Page: `permissions.html`

```text
#008080 desktop, nothing else on it
          +==[ghost16] Check links to other sites===================+
          |  [ tombstone 48px ]                                     |
          |  Haunted GeoCities will send cookie-free requests to    |
          |  the sites a haunted page links to, to find dead        |
          |  links. Chrome words this as access to all websites.    |
          |  [#### Allow link checks ####]  <- default push button  |
          |  [ Link checks are on. You can close this tab. ]        | <- sunken status field,
          +=========================================================+    hidden until answered
```

The window is at most 440px wide, centred, 12vh from the top (32px under 480px wide), with the same bevel recipe. The title bar text is the page's `h1`. The button greys out once granted: `:disabled` label `#808080` with the Win95 white emboss (`text-shadow: 1px 1px 0 #ffffff`), no blur. A refusal leaves it enabled. The status field keeps `role="status"`. Granted shows `#000000` on `#ffffff`, refused shows `#660000` on `#ffcccc`, each with a square 6px marker. The page has no `transition`, no `animation`, and no hover change.

#### Contrast

| Text | Ground | Ratio |
|------|--------|-------|
| `#000000` body, labels, legends | `#c0c0c0` face | 11.5:1 |
| `#333333` sub-lines, attribution | `#c0c0c0` face | 6.9:1 |
| `#000000` | `#ffffff` list box, status field | 21:1 |
| `#333333` | `#ffffff` | 12.6:1 |
| `#000000` | `#ccccff` row hover | 13.6:1 |
| `#333333` | `#ccccff` row hover | 8.2:1 |
| `#ffffff` title bar text | `#000080` | 16.0:1 |
| `#33ff33` counter digits | `#000000` | 15.5:1 |
| `#0000ff` link | `#c0c0c0` / `#ffffff` | 4.7:1 / 8.6:1 |
| `#800080` visited link | `#c0c0c0` / `#ffffff` | 5.2:1 / 9.4:1 |
| `#330099` Caught | `#ccccff` | 8.5:1 |
| `#000000` Known | `#cccccc` | 13.1:1 |
| `#660000` 404 | `#ffcccc` | 9.4:1 |
| `#663300` 410 | `#ffcc99` | 7.0:1 |
| `#333333` Exorcised | `#cccccc` | 7.9:1 |
| `#660000` refused status | `#ffcccc` | 9.4:1 |
| `#6633cc` focus ring (not text, 3:1 needed) | `#c0c0c0` / `#ffffff` | 4.0:1 / 7.2:1 |

Disabled controls are the one exception: the `Allow link checks` label at `#808080` on `#c0c0c0` is 2.2:1. WCAG 1.4.3 exempts inactive components, and the sunken status field next to it states the result at 21:1.

#### Colour rules

- `#6633cc` is the focus ring and the toolbar badge ground. The popup no longer uses it for toggles, counts, links or buttons.
- Links are `#0000ff`, visited `#800080`, underlined.
- Nothing in the popup or on `permissions.html` has a rounded corner, a blurred shadow or a gradient. `permissions.html` has no transition or animation. The popup has none either, and keeps the `prefers-reduced-motion: reduce` block.


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
