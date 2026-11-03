# Requirements: Scaffold

## Overview

This spec covers the foundational scaffold for the Haunted GeoCities Chrome extension: the MV3 manifest, Vite build pipeline, background service worker, content script, popup UI, per-tab haunted state, e2e test harness, and Dockerfile. It does not implement costume features (ghosts, vampires, tombstones, curses, dark patterns); those are separate specs.

The scaffold establishes the extension shell, the Haunt/Un-haunt lifecycle, and the popup's three-screen UI. Every requirement below is testable: unit tests run under `bun test ./test/`, e2e tests run under Playwright against a local fixture server, and the Dockerfile proves all three commands pass in a clean container.

## EARS Acceptance Criteria

### Manifest

1. The manifest shall conform to Chrome Manifest V3 (`"manifest_version": 3`).
2. The manifest shall declare `permissions` containing `activeTab`, `scripting`, `declarativeNetRequest`, and `storage`.
3. The manifest shall not declare `host_permissions`.
4. The manifest shall declare `optional_host_permissions` containing `"http://*/*"` and `"https://*/*"`.
5. The manifest shall declare a service worker via `background.service_worker`.
6. The manifest shall declare `action.default_popup` pointing to the popup HTML file.

### Build

7. The build system shall use Vite to compile `src/background`, `src/content`, and `src/popup`.
8. The build system shall output all artifacts to `dist/`.
9. When `bun run build` is executed, the system shall produce a loadable unpacked extension in `dist/` containing `manifest.json`, the background service worker, the content script, and the popup HTML/CSS/JS.
10. The `package.json` shall declare a `build` script that runs the Vite build.

### Background Service Worker

11. The background shall be an MV3 service worker registered in the manifest.
12. When the background receives a `HAUNT` message from the popup, the background shall inject the content script into the active tab via `chrome.scripting.executeScript`.
13. When the background receives an `UNHAUNT` message, the background shall send an `unhaunt` message to the content script in the target tab via `chrome.tabs.sendMessage`.
14. When the background receives a `GET_STATE` message, the background shall return the haunted state for the requested tab.
15. When the content script is successfully injected, the background shall set the per-tab haunted state to `true` in `chrome.storage.session`.
16. When the background receives confirmation that the content script has un-haunted the page, the background shall set the per-tab haunted state to `false` in `chrome.storage.session`.

### Content Script

17. The content script shall append a Shadow DOM host element to `document.documentElement` with a closed shadow root.
18. The content script shall not modify any page DOM node outside the shadow host.
19. When the content script receives an `unhaunt` message, the content script shall remove the shadow host and any adopted stylesheets from the document.
20. While the page is haunted, the page's own markup shall remain byte-identical to its pre-haunt state.
21. The content script shall be injectable via `chrome.scripting.executeScript` using only the `activeTab` and `scripting` permissions — no `host_permissions` required.

### Popup

22. The popup shall display exactly one of three screens: idle, haunted, or restricted.
23. When the popup opens on a restricted page, the popup shall display the restricted screen.
24. When the popup opens on an unrestricted page that is not haunted, the popup shall display the idle screen.
25. When the popup opens on an unrestricted page that is haunted, the popup shall display the haunted screen.
26. The idle screen shall show exactly one near-black pill labelled "Haunt this page".
27. The haunted screen shall show exactly one near-black pill labelled "Un-haunt".
28. The restricted screen shall not display a pill.
29. The pill shall have ground `#111318`, text `#ffffff`, height 48px, full width, radius 999, font-size 15px, font-weight 600.
30. Where the popup is on the idle or haunted screen, the popup shall show a settings surface.
31. The settings surface shall contain a "Check links to other sites" toggle, off by default.
32. When the "Check links to other sites" toggle is turned on, the popup shall call `chrome.permissions.request` with `origins` set to `"http://*/*"` and `"https://*/*"`.
33. If the permission request is denied, the toggle shall spring back to the off position.
34. When the "Check links to other sites" toggle is turned off, the popup shall remove the `http://*/*`/`https://*/*` origin permissions via `chrome.permissions.remove` with `origins`.
35. The settings surface shall contain a "Sound effects" toggle, off (muted) by default.
36. While the "Sound effects" toggle is off, the sub-line shall read "Muted".
37. When the "Sound effects" toggle is turned on, the sub-line shall read "On · plays only after you click".
38. The popup shall display the Tracker Radar attribution line reading "Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0".
39. All popup interactive controls shall be keyboard reachable with visible focus indicators.
40. The popup shall be 360px wide.

### Per-Tab Haunted State

41. The system shall store per-tab haunted state in `chrome.storage.session`, keyed by tab ID.
42. When a tab is closed, the background shall remove that tab's haunted state entry from `chrome.storage.session`.

### Fixture Pages

43. Fixture pages shall be standalone HTML files in `fixtures/` with no external dependencies.
44. Fixture pages shall not contain third-party trademarks or copyrighted material.

### E2E Test Harness

45. The e2e test harness shall load the unpacked extension from `dist/` into a Chromium instance via Playwright.
46. The e2e test harness shall serve fixture pages from `fixtures/` via a local HTTP server.
47. When the e2e test harness triggers Haunt on a fixture page, the test shall observe a Shadow DOM host element appended to the page.
48. When the e2e test harness triggers Un-haunt, the test shall observe that the Shadow DOM host is removed and the page DOM is unchanged.
49. The e2e test harness shall verify that the popup displays the correct screen (idle, haunted, restricted) for the current tab state.

### Dockerfile

50. The Dockerfile shall produce an image in which `bun run typecheck` passes.
51. The Dockerfile shall produce an image in which `bun run test` passes.
52. The Dockerfile shall produce an image in which `bun run test:e2e` passes.

### Non-Destructive DOM

53. The content script shall inject all costume styles via adopted stylesheets (`document.adoptedStyleSheets`) or inside the shadow root, never by modifying the page's `<style>` or `<link>` elements.
54. When Un-haunt is complete, the system shall have removed the shadow host and all adopted costume stylesheets, returning the DOM to its original state.

### Accessibility

55. The popup shall honour `prefers-reduced-motion` by disabling non-essential popup motion.
56. The popup text shall meet a 4.5:1 contrast ratio against its background.
