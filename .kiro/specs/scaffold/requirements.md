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
26. The idle screen shall show exactly one primary push button labelled "Haunt this page", drawn as requirement 63 says.
27. The haunted screen shall show exactly one primary push button labelled "Un-haunt", drawn as requirement 63 says.
28. The restricted screen shall not display a primary push button.
29. The primary push button shall be the Win95 default push button of the "Popup Costume (1998)" section (requirement 63): full width, 40px tall, `#c0c0c0` face, bold 13px `#000000` label.
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

### Popup Costume (1998)

The popup and `permissions.html` are dressed as Windows 95 windows, the same era as the crypt, and stay clean and scannable. This section changes how the popup looks. It does not change what it does: requirements 22-25 and 30-40 keep their behaviour. Where requirements 30, 31 and 35 say "surface" they now mean a group box (requirement 61), and where requirements 31-37 say "toggle" they now mean a checkbox (requirement 68). Values are in the `Popup Costume (1998)` section of `design.md`.

Window and type

57. The popup shall be drawn as a Windows 95 window with face `#c0c0c0` and a 2px raised bevel (top-left `#ffffff` outer and `#dfdfdf` inner, bottom-right `#000000` outer and `#808080` inner), and no popup or `permissions.html` CSS shall use a box-shadow with a blur radius above 0.
58. The popup window shall have a `#000080` title bar holding the 16px pixel ghost sprite and the text "Haunted GeoCities" in bold white 13px.
59. The popup shall set its text in the font stack `'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, Geneva, sans-serif`, except the site title (requirement 60) and the hit-counter digits (requirement 64).
60. The popup shall set the site title in Times New Roman bold 24px.

Grouping and shape

61. The popup shall group its content in etched Win95 group boxes, each with a 2px etched `#808080`/`#ffffff` border and a legend text, and shall not draw floating cards.
62. The popup and `permissions.html` CSS shall use `border-radius: 0` or no `border-radius` at all, so that no element has a rounded corner.

Actions

63. The popup shall show exactly one primary action on the idle and haunted screens (requirements 26-28), drawn as a full-width 40px Win95 default push button: `#c0c0c0` face, raised bevel, an extra 1px `#000000` outer frame and a bold 13px `#000000` label. While the button is pressed, the bevel shall invert.
64. When the popup is on the haunted screen, the popup shall show the four counts as hit-counter cells with a `#000000` ground and `#33ff33` digits in Courier New bold 24px with tabular figures, and shall show the 16px sprite and the kind label under each cell.
65. Where the popup lists ghosts, vampires, tombstones or curses, the popup shall set each list in a sunken white list box with a 2px inset bevel (`#808080`/`#ffffff`), and each row shall keep a 32px sprite tile with no radius and show a `#ccccff` ground on hover.
66. The Exorcise and Let it back buttons shall be 24px Win95 push buttons.
67. The tags shall be square with a 1px `#000000` border and these colours (ground/text): Caught `#ccccff`/`#330099`, Known `#cccccc`/`#000000`, 404 `#ffcccc`/`#660000`, 410 `#ffcc99`/`#663300`, Exorcised `#cccccc`/`#333333`.

Settings, status and links

68. The two settings controls shall be Win95 checkboxes, each a 13px sunken white box that shows a black pixel check when on, and shall keep their labels, sub-lines and behaviour (requirements 31-37).
69. The popup shall show its status (Idle, Haunted or Can't haunt) in a sunken Win95 status bar at the bottom of the window, together with the Tracker Radar attribution line (requirement 38), and shall not show the status in the header.
70. The popup shall draw links `#0000ff`, and visited links `#800080`, underlined.
71. The accent `#6633cc` shall appear in the popup only as the focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`, unchanged) and as the toolbar badge ground.

Size, contrast and motion

72. The popup text shall meet a 4.5:1 contrast ratio against its own ground, for every text and ground pair in the contrast table of `design.md`. Disabled controls are exempt, as WCAG 1.4.3 allows.
73. The popup shall be 360px wide and at most 600px tall, and shall honour `prefers-reduced-motion` (requirement 55).

Permissions page

74. The `permissions.html` page shall show a `#008080` desktop with one centred Win95 dialog window at most 440px wide, and shall not be fixed at 360px.
75. The dialog shall have a title bar reading "Check links to other sites", the 48px tombstone sprite and the explanation sentence, worded exactly as before: "Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites."
76. The dialog shall have an "Allow link checks" default push button (requirement 63), whose label shall turn `#808080` and whose control shall be disabled once the permission is granted.
77. The dialog shall show the answer to the permission request in a sunken status field.
78. While `permissions.html` is open, nothing on it shall animate or transition.
