# Tasks: Scaffold

Implementation checklist for the scaffold spec. Each task references the requirement numbers it satisfies and names the test that proves it.

Tests live under `test/` (Bun unit tests) and `e2e/` (Playwright end-to-end tests).

## 1. Project Configuration

- [x] 1.1 Add `"build": "vite build"` script to `package.json` and ensure `"type": "module"`, `"private": true`, `"license": "MIT"`.
  - Req: 10
  - Test: `test/scaffold.test.ts` → `"package.json" > "scripts"` — asserts `build` script exists.

- [ ] 1.2 Add `"test:e2e"` script that builds before running Playwright: `"bun run build && playwright test --pass-with-no-tests"`.
  - Req: 9, 45
  - Test: `test/scaffold.test.ts` → `"package.json" > "scripts"` — asserts `test:e2e` contains `playwright test`.

- [x] 1.3 Add `"chrome"` to `tsconfig.json` `types` array alongside `"bun"`.
  - Req: 11, 21
  - Test: `test/scaffold.test.ts` → `"package.json" > "metadata"` — confirms project config; typecheck via `bun run typecheck` (req 50).

- [x] 1.4 Add `vite`, `@types/chrome` to `devDependencies` (pinned versions).
  - Req: 7, 11
  - Test: `test/scaffold.test.ts` → `"package.json" > "metadata"` — devDependencies present.

## 2. Manifest

- [x] 2.1 Create `src/manifest.ts` exporting a typed manifest object with `"manifest_version": 3`.
  - Req: 1
  - Test: `test/manifest.test.ts` → `"manifest_version is 3"`.

- [x] 2.2 Declare `permissions: ["activeTab", "scripting", "declarativeNetRequest", "storage"]`.
  - Req: 2
  - Test: `test/manifest.test.ts` → `"permissions contains activeTab, scripting, declarativeNetRequest, storage"`.

- [x] 2.3 Omit `host_permissions` from the manifest entirely.
  - Req: 3
  - Test: `test/manifest.test.ts` → `"no host_permissions declared"`.

- [x] 2.4 Declare `optional_host_permissions: ["http://*/*", "https://*/*"]`.
  - Req: 4
  - Test: `test/manifest.test.ts` → `"optional_host_permissions contains http://*/* and https://*/*"`.

- [x] 2.5 Declare `background.service_worker` pointing to `"background.js"`.
  - Req: 5, 11
  - Test: `test/manifest.test.ts` → `"background.service_worker is set"`.

- [x] 2.6 Declare `action.default_popup` pointing to `"popup.html"`.
  - Req: 6
  - Test: `test/manifest.test.ts` → `"action.default_popup points to popup.html"`.

## 3. Vite Build

- [x] 3.1 Create `vite.config.ts` with three entry points: `src/background/index.ts`, `src/content/index.ts`, `src/popup/popup.html`.
  - Req: 7
  - Test: `test/build.test.ts` → `"vite config has three entry points"`.

- [x] 3.2 Set `build.outDir` to `"dist"` and configure output filenames (`[name].js`, `[name].[ext]`).
  - Req: 8
  - Test: `test/build.test.ts` → `"output dir is dist"`.

- [x] 3.3 Add `copy-manifest` plugin to copy `manifest.json` to `dist/` on `closeBundle`.
  - Req: 9
  - Test: `test/build.test.ts` → `"manifest.json is copied to dist"`.

- [x] 3.4 Verify `bun run build` produces `dist/` containing `manifest.json`, `background.js`, `content.js`, `popup.html`, and popup CSS/JS.
  - Req: 9
  - Test: `test/build.test.ts` → `"dist contains manifest, background, content, popup"`.

## 4. Shared Types

- [x] 4.1 Create `src/data/types.ts` with the `PopupMessage` discriminated union (`HAUNT`, `UNHAUNT`, `GET_STATE`).
  - Req: 12, 13, 14
  - Test: `test/background.test.ts` → `"storage keys" > "haunted state is keyed haunt:<tabId>"` — uses `hauntKey` from types.

- [ ] 4.2 Add `BackgroundToContentMessage` (`{ type: "unhaunt" }`) and `ContentToBackgroundMessage` (`HAUNT_SUCCESS`, `UNHAUNT_SUCCESS`).
  - Req: 13, 15, 16
  - Test: `test/background.test.ts` → `"UNHAUNT" > "tells the content script to unhaunt and clears the state"`.

- [x] 4.3 Add `hauntKey(tabId)` helper returning `"haunt:<tabId>"` and `StateResponse` type (`{ haunted, restricted, url }`).
  - Req: 14, 41
  - Test: `test/background.test.ts` → `"storage keys" > "haunted state is keyed haunt:<tabId>"`.

## 5. Background Service Worker

- [x] 5.1 Create `src/background/index.ts` as the service worker entry that calls `createBackground(chrome).register()`.
  - Req: 11
  - Test: `test/background.test.ts` → `"router" > "register() adds one runtime.onMessage listener and the tab listeners"`.

- [x] 5.2 Create `src/background/router.ts` with `createBackground(chrome)` that registers `chrome.runtime.onMessage`, `chrome.tabs.onRemoved`, and `chrome.tabs.onUpdated` listeners.
  - Req: 11, 42
  - Test: `test/background.test.ts` → `"router" > "register() adds one runtime.onMessage listener and the tab listeners"`.

- [x] 5.3 Implement the `HAUNT` handler: call `chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })`, then set `storage.session[haunt:<tabId>] = true`.
  - Req: 12, 15
  - Test: `test/background.test.ts` → `"HAUNT" > "injects content.js into the tab and marks it haunted"`.

- [x] 5.4 Refuse `HAUNT` on a restricted tab without injecting.
  - Req: 12
  - Test: `test/background.test.ts` → `"HAUNT" > "refuses a restricted tab without injecting"`.

- [x] 5.5 Handle injection failure: leave tab idle, report error in response.
  - Req: 12, 15
  - Test: `test/background.test.ts` → `"HAUNT" > "an injection failure leaves the tab idle and reports an error"`.

- [x] 5.6 Implement the `UNHAUNT` handler: call `chrome.tabs.sendMessage(tabId, { type: "unhaunt" })`, then clear `storage.session[haunt:<tabId>]`.
  - Req: 13, 16
  - Test: `test/background.test.ts` → `"UNHAUNT" > "tells the content script to unhaunt and clears the state"`.

- [x] 5.7 Clear haunted state even if the content script is gone (receiving end does not exist).
  - Req: 16
  - Test: `test/background.test.ts` → `"UNHAUNT" > "clears the state even if the content script is gone"`.

- [x] 5.8 Implement the `GET_STATE` handler: read `storage.session`, check restricted URL, return `{ haunted, restricted, url }`.
  - Req: 14
  - Test: `test/background.test.ts` → `"GET_STATE" > "a fresh web tab is idle and not restricted"`.

- [x] 5.9 Create `src/background/restricted.ts` with `isRestrictedUrl(url, fileAccess)` matching `chrome://`, `chrome-extension://`, `edge://`, `about:`, `view-source:`, `chromewebstore`, `devtools://`, `data:`, `blob:`, and `file://` (conditionally).
  - Req: 14, 23
  - Test: `test/restricted.test.ts` → `"isRestrictedUrl"` — restricts and allows cases.

- [x] 5.10 Implement `chrome.tabs.onRemoved` listener that deletes the closed tab's `haunt:<tabId>` entry.
  - Req: 42
  - Test: `test/background.test.ts` → `"tab lifecycle" > "tabs.onRemoved deletes that tab's entry only"`.

- [ ] 5.11 Implement `chrome.tabs.onUpdated` listener that clears haunted state on navigation (`status: "loading"`) but preserves it on title/complete updates.
  - Req: 41
  - Test: `test/background.test.ts` → `"tab lifecycle" > "a navigation (status loading) clears the state"` and `"other tab updates (title, complete) keep the state"`.

- [ ] 5.12 Create `src/background/permissions.ts` with `requestLinkCheckPermissions()` and `removeLinkCheckPermissions()` wrapping `chrome.permissions.request/remove` with `origins: ["http://*/*", "https://*/*"]`.
  - Req: 32, 34
  - Test: `test/popup.test.ts` → `"settings" > "turning on link-check calls permissions.request with origins"` and `"turning off link-check calls permissions.remove with origins"`.

## 6. Content Script

- [x] 6.1 Create `src/content/index.ts` as the content script entry. On injection, call `haunt()` and register an `onMessage` listener for `{ type: "unhaunt" }`.
  - Req: 17, 19
  - Test: `test/content.test.ts` → `"haunt creates a shadow host on document.documentElement"`.

- [x] 6.2 Create `src/content/overlay.ts` with `haunt()`: create `<hg-crypt>` element, attach a closed shadow root, append to `document.documentElement`.
  - Req: 17
  - Test: `test/content.test.ts` → `"haunt attaches a closed shadow root"`.

- [x] 6.3 Make `haunt()` idempotent: if `<hg-crypt>` already exists, do nothing.
  - Req: 17
  - Test: `test/content.test.ts` → `"haunt is idempotent"`.

- [x] 6.4 Verify no page DOM nodes outside the shadow host are modified.
  - Req: 18, 20
  - Test: `test/content.test.ts` → `"page markup is byte-identical after haunt"`.

- [ ] 6.5 Create `src/content/unhaunt.ts` with `unhaunt()`: remove the `<hg-crypt>` host, remove adopted costume stylesheets from `document.adoptedStyleSheets`, send `UNHAUNT_SUCCESS` to background.
  - Req: 19, 54
  - Test: `test/content.test.ts` → `"unhaunt removes the shadow host and adopted stylesheets"`.

- [x] 6.6 Verify the page DOM is unchanged after unhaunt.
  - Req: 20, 54
  - Test: `test/content.test.ts` → `"page markup is byte-identical after unhaunt"`.

- [x] 6.7 Inject costume styles only via `document.adoptedStyleSheets` or inside the shadow root — never modify page `<style>` or `<link>` elements.
  - Req: 53
  - Test: `test/content.test.ts` → `"no page style or link elements are modified"`.

- [x] 6.8 Confirm the content script is injectable via `chrome.scripting.executeScript` with only `activeTab` + `scripting` (no `host_permissions`).
  - Req: 21
  - Test: `test/background.test.ts` → `"HAUNT" > "injects content.js into the tab and marks it haunted"` (injection uses `files: ["content.js"]`, no host permission).

## 7. Popup

- [x] 7.1 Create `src/popup/popup.html` as a 360px-wide shell with `<div id="app">`.
  - Req: 40
  - Test: `test/popup.test.ts` → `"popup is 360px wide"`.

- [x] 7.2 Create `src/popup/popup.ts` as the popup entry: query active tab, send `GET_STATE`, render the appropriate screen.
  - Req: 22, 24, 25
  - Test: `test/popup.test.ts` → `"renders idle screen on unrestricted non-haunted page"` and `"renders haunted screen on haunted page"`.

- [x] 7.3 Create `src/popup/screens.ts` with `renderIdle()`, `renderHaunted()`, `renderRestricted()` functions. Only one screen is visible at a time.
  - Req: 22, 23, 24, 25
  - Test: `test/popup.test.ts` → `"renders restricted screen on restricted page"`.

- [x] 7.4 Idle screen shows exactly one near-black pill labelled "Haunt this page".
  - Req: 26
  - Test: `test/popup.test.ts` → `"idle screen has one pill labelled Haunt this page"`.

- [x] 7.5 Haunted screen shows exactly one near-black pill labelled "Un-haunt".
  - Req: 27
  - Test: `test/popup.test.ts` → `"haunted screen has one pill labelled Un-haunt"`.

- [x] 7.6 Restricted screen shows no pill.
  - Req: 28
  - Test: `test/popup.test.ts` → `"restricted screen has no pill"`.

- [x] 7.7 Style the pill: `#111318` ground, `#ffffff` text, 48px height, full width, radius 999, 15px font-size, 600 font-weight.
  - Req: 29
  - Test: `test/popup.test.ts` → `"pill has correct colours, dimensions, and typography"`.

- [x] 7.8 Show the settings surface on idle and haunted screens (not on restricted).
  - Req: 30
  - Test: `test/popup.test.ts` → `"settings surface is shown on idle and haunted"` and `"settings surface is not shown on restricted"`.

- [x] 7.9 Create `src/popup/settings.ts` with the "Check links to other sites" toggle, off by default.
  - Req: 31
  - Test: `test/popup.test.ts` → `"link-check toggle is off by default"`.

- [x] 7.10 Turning the link-check toggle on calls `chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] })`.
  - Req: 32
  - Test: `test/popup.test.ts` → `"turning on link-check calls permissions.request with origins"`.

- [x] 7.11 If the permission request is denied, the toggle springs back to off.
  - Req: 33
  - Test: `test/popup.test.ts` → `"denied permission request springs toggle back to off"`.

- [x] 7.12 Turning the link-check toggle off calls `chrome.permissions.remove({ origins: ["http://*/*", "https://*/*"] })`.
  - Req: 34
  - Test: `test/popup.test.ts` → `"turning off link-check calls permissions.remove with origins"`.

- [x] 7.13 Add "Sound effects" toggle, off (muted) by default, persisting to `chrome.storage.local["audioEnabled"]`.
  - Req: 35
  - Test: `test/popup.test.ts` → `"sound toggle is off by default"`.

- [x] 7.14 Sound toggle off sub-line reads "Muted".
  - Req: 36
  - Test: `test/popup.test.ts` → `"sound toggle off shows Muted sub-line"`.

- [x] 7.15 Sound toggle on sub-line reads "On · plays only after you click".
  - Req: 37
  - Test: `test/popup.test.ts` → `"sound toggle on shows On · plays only after you click sub-line"`.

- [x] 7.16 Display the Tracker Radar attribution line: "Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0".
  - Req: 38
  - Test: `test/popup.test.ts` → `"attribution line is present"`.

- [x] 7.17 All interactive controls are keyboard reachable with visible focus indicators.
  - Req: 39
  - Test: `test/popup.test.ts` → `"all controls are keyboard reachable"` and `"focus indicators are visible"`.

- [x] 7.18 Create `src/popup/styles.css` implementing popup tokens from `design/DESIGN.md` (canvas `#eef0f4`, surfaces `#ffffff`, accent `#6633cc`, focus `outline: 2px solid #6633cc`).
  - Req: 29, 40, 56
  - Test: `test/popup.test.ts` → `"popup width is 360px"` and `"text meets 4.5:1 contrast"`.

## 8. Per-Tab Haunted State

- [x] 8.1 Store haunted state in `chrome.storage.session` under key `"haunt:<tabId>"` with boolean value.
  - Req: 41
  - Test: `test/background.test.ts` → `"storage keys" > "haunted state is keyed haunt:<tabId>"`.

- [x] 8.2 Remove the tab's state entry from `storage.session` when the tab is closed.
  - Req: 42
  - Test: `test/background.test.ts` → `"tab lifecycle" > "tabs.onRemoved deletes that tab's entry only"`.

## 9. Fixture Pages

- [x] 9.1 Create `fixtures/index.html` — a standalone HTML page with text content, a few links, and a `<main>` element. No external dependencies.
  - Req: 43
  - Test: `test/fixtures.test.ts` → `"index.html exists and has no external dependencies"`.

- [x] 9.2 Create `fixtures/clean.html` — a minimal page with no trackers and no dead links.
  - Req: 43
  - Test: `test/fixtures.test.ts` → `"clean.html exists and has no external dependencies"`.

- [x] 9.3 Ensure no fixture page contains third-party trademarks or copyrighted material.
  - Req: 44
  - Test: `test/fixtures.test.ts` → `"no fixture contains third-party trademarks"`.

## 10. E2E Test Harness

- [ ] 10.1 Create `e2e/helpers.ts` with `launchExtensionBrowser()` that loads the unpacked extension from `dist/` via `--load-extension`.
  - Req: 45
  - Test: `e2e/haunt.spec.ts` — depends on helpers to launch browser with extension.

- [ ] 10.2 Add `startFixtureServer()` to `e2e/helpers.ts` serving `fixtures/` on a random port.
  - Req: 46
  - Test: `e2e/haunt.spec.ts` — navigates to fixture server URL.

- [ ] 10.3 Add `getExtensionBackground(context)` and `openPopup(context, extensionId, tabId)` helpers.
  - Req: 45, 49
  - Test: `e2e/popup.spec.ts` — uses helpers to open popup and verify screen.

- [x] 10.4 Create `e2e/haunt.spec.ts`: navigate to fixture, click Haunt in popup, assert `<hg-crypt>` shadow host exists on the page.
  - Req: 47
  - Test: `e2e/haunt.spec.ts` → `"Haunt appends a shadow DOM host to the page"`.

- [x] 10.5 In `e2e/haunt.spec.ts`: click Un-haunt, assert shadow host is removed and page DOM is unchanged.
  - Req: 48, 54
  - Test: `e2e/haunt.spec.ts` → `"Un-haunt removes the shadow host and leaves the DOM unchanged"`.

- [x] 10.6 Create `e2e/popup.spec.ts`: verify popup shows idle screen on a normal page, haunted screen after Haunt.
  - Req: 49
  - Test: `e2e/popup.spec.ts` → `"popup shows idle screen then haunted screen after Haunt"`.

- [x] 10.7 Create `e2e/restricted.spec.ts`: navigate to `chrome://version`, open popup, assert restricted screen.
  - Req: 23, 49
  - Test: `e2e/restricted.spec.ts` → `"popup shows restricted screen on chrome://version"`.

## 11. Dockerfile

- [ ] 11.1 Create `Dockerfile` based on `oven/bun:1` that installs system deps for Playwright Chromium and runs `bunx playwright install --with-deps chromium`.
  - Req: 50, 51, 52
  - Test: `test/docker.test.ts` → `"Dockerfile exists and uses oven/bun base image"`.

- [x] 11.2 Add `RUN bun install`, `RUN bun run typecheck`, `RUN bun run test`, `RUN bun run test:e2e` in sequence.
  - Req: 50, 51, 52
  - Test: `test/docker.test.ts` → `"Dockerfile runs typecheck, test, and test:e2e"`.

## 12. Accessibility

- [x] 12.1 Honour `prefers-reduced-motion` in popup CSS: disable non-essential popup motion (transitions, animations).
  - Req: 55
  - Test: `test/popup.test.ts` → `"prefers-reduced-motion disables popup motion"`.

- [x] 12.2 Ensure popup text meets 4.5:1 contrast ratio against its background (ink on surface, muted on surface, pillInk on pill).
  - Req: 56
  - Test: `test/design.test.ts` → `"tokens" > "ink on surface has WCAG contrast >= 4.5"` and `"muted on surface has WCAG contrast >= 4.5"` and `"pillInk on pill has WCAG contrast >= 4.5"`.
