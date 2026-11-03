# Requirements: Tracker Detector (R5)

## Overview

This spec covers the **tracker detector**: the pipeline that turns DuckDuckGo's Tracker Radar dataset into a compact committed data file, matches live third-party requests to tracker companies, renders one ghost per company in the costume's gutter lanes, drives the HUD counts and hit counter, populates the popup's ghost list, and lets the user Exorcise a company's domains for the current tab via `declarativeNetRequest` session rules.

It builds on the costume renderer (R4), which established the shadow DOM layers (`#lanes`, `#hud`), the haunt-moment timeline, the body-padding adopted stylesheet, and the reduced-motion handling. This spec populates the `#lanes` layer, replaces the HUD empty state with real counts, replaces the popup's static "No ghosts here" list with a live ghost list, and adds the Exorcise message round-trip through the background service worker.

## EARS Acceptance Criteria

### Data Ingest

1. The extension shall include a build-time script `scripts/ingest-trackers.ts` that reads the single Tracker Data Set file `data/raw/extension-tds.json` (keys `trackers` and `entities`, licensed CC BY-NC-SA 4.0) and writes a compact `src/data/trackers.json`.
2. The ingest script shall produce a JSON object keyed by tracker domain, where each value holds: the company display name (from the `owner.displayName` field), the prevalence (number), the categories (array of strings, possibly empty), and the fingerprinting score (number 0–3 from the dataset, or 0 when absent). Trackers whose `categories` array is empty shall be kept (not skipped).
3. The ingest script shall keep only trackers whose prevalence is greater than or equal to 0.0001.
3a. The ingest script shall read the `entities` object from the TDS file and produce an `entities` map in `src/data/trackers.json` keyed by company display name, where each value is the list of domains that entity owns. This map is used by the matcher for the same-company first-party check (requirement 10).
4. The ingest script shall copy the licence file `data/raw/tracker-radar-LICENSE.txt` to `src/data/LICENSE-tracker-radar.txt` and write `src/data/ATTRIBUTION.md` naming DuckDuckGo Tracker Radar, the CC BY-NC-SA 4.0 licence, and the changes made.
5. `src/data/trackers.json`, `src/data/LICENSE-tracker-radar.txt`, and `src/data/ATTRIBUTION.md` shall be committed to the repository; the build and the extension shall never need the raw dataset or the network at runtime.
6. The ingest script shall be deterministic: the same input file shall produce byte-identical output across runs (sorted keys, stable ordering).

### Matcher

7. A pure function `matchTracker(hostname, trackers, pageHost)` shall map a request hostname to its tracker company record, or return `null` when the hostname is not a known tracker domain.
8. The matcher shall match by exact domain first, then by parent-domain suffix: for `a.b.example.com` it shall try `a.b.example.com`, `b.example.com`, `example.com`, stopping at the first registrable domain found in the dataset.
9. The matcher shall never return a match when the request hostname is the page's own host or a subdomain of it (first-party requests to the page's own site never count).
10. The matcher shall never return a match when the request hostname belongs to the same tracker company that owns the page's own host (a company's own first-party requests on its own site are not tracking). The company that owns the page's own host is determined by looking up the page hostname in `data.domains` and then checking the `entities` map for all domains owned by that company; any request to a domain in that entity's domain list is first-party.
11. The matcher shall be a pure function with no side effects, importable from both the content script and unit tests without a DOM or Chrome API.

### Resource Timing Scanner

12. While the page is haunted, the content script shall read `performance.getEntriesByType('resource')` once at haunt time and register a `PerformanceObserver` for `resource` entries that arrive later, to build the set of third-party request hostnames.
13. The scanner shall extract the hostname from each `PerformanceResourceTiming.name` URL and pass it through the matcher, skipping entries whose hostname is the page's own host or subdomain.
14. The scanner shall group hits by company, accumulating a per-company record: company display name, categories, fingerprinting score (max over its matched domains), the list of matched domains, and the request count (one per resource timing entry that matched the company).
15. The scanner shall be read-only: it shall not modify any `PerformanceResourceTiming` entry, intercept network requests, or touch the page's DOM.
16. The `PerformanceObserver` shall be disconnected on un-haunt; no observer or timer shall remain after the page is restored.

### Ghosts (One Per Company)

17. The costume shall render at most one ghost per tracker company inside the `#lanes` layer of the shadow root, never over page text, matching the Ghosts section of `design/DESIGN.md`.
18. A lane shall exist on a side only if that gutter is 64px or wider; slot pitch shall be 72px (48px sprite + 24px label); slots shall run between the top bands and the HUD.
19. Each slot shall be checked with an `IntersectionObserver` against page text rects; any slot intersecting a text rect shall be skipped.
20. When there are more companies than available slots, the last slot shall become a `+N` stack token showing the overflow count.
21. When no lane exists at all (narrow pages), ghosts shall live only in the HUD count and the popup list; no ghost shall be drawn over page text.
22. Each ghost sprite shall be 48×48, body `#ffffff` with `#ccffff` shade and `#000033` eyes, with a 2-art-px hem tinted per company: `hash(company) mod 6` over the `hemTints` array from the tokens.
23. Each ghost shall have a glow of `filter: drop-shadow(0 0 6px #6633cc) drop-shadow(0 0 2px #ccffff)`.
24. Each ghost shall carry a label below the sprite: Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis, showing the company display name.
25. During the haunt moment (1400–2000ms phase), tracker ghosts shall rise 16px into their slots and fade from 0 to 1, each over 300ms, staggered 60ms (first 8; the rest arrive with the 8th), easing `cubic-bezier(.2,.8,.2,1)`.
26. After the haunt moment, each ghost shall drift with a bob of ±4px vertical over 4000ms and a sway of ±6px horizontal over 7000ms, with a phase offset of slot index × 700ms, never leaving its 64px lane slot.
27. Under `prefers-reduced-motion: reduce`, ghosts shall sit still at their slot centres with no bob, sway, or rise animation.

### Ghost Card

28. Clicking a ghost or pressing Enter on a focused ghost shall open a card inside the `#cards` layer, following the card style in `design/DESIGN.md`.
29. The card title bar shall show the company display name (`#330066` ground, Times New Roman bold 14px `#ffffcc`, 22px tall, with a 16×16 `[x]` close button).
30. The card body shall show the category, `Haunts these domains:` followed by a Times New Roman 13px list of matched domains, and `Seen <N> times on this page` where `<N>` is the request count.
31. The card body shall end with an `[Exorcise]` default Win95 button and the footnote `Blocked until you close the browser.`
32. After Exorcise, the ghost sprite shall fade to 40% opacity with an `EXORCISED` stamp, and the button shall become `[Let it back]`.
33. Esc shall close the card and return focus to the opener ghost; the card shall be clamped between the top bands and the HUD.

### HUD Updates

34. The HUD counts shall replace the empty state with live values: the ghost count shall be the number of tracker companies found, the vampire, tombstone, and curse counts remain 0 in this spec.
35. The hit counter (odometer) value shall be the total number of tracker requests seen across all companies, not zero.
36. When no trackers are found, the HUD shall show the empty state `No ghosts here. Suspiciously clean.` as in R4.
37. The HUD counts and odometer shall update when the scanner finds new tracker requests after the haunt moment, reusing the existing `setCounts` and `setOdometer` functions from `src/content/costume/hud.ts`.

### Popup Ghost List

38. The popup haunted screen shall list ghosts sorted by request count (descending), then by company name (ascending).
39. Each ghost row shall show a 32px icon tile with the ghost sprite, the company display name (15px ink), the domain count and category (13px muted), and an `[Exorcise]` secondary button on the right.
40. When a company is exorcised, its row shall show an `(Exorcised)` tinted pill instead of the Exorcise button, and the row text shall be at 60% opacity.
41. When no trackers are found, the list surface shall show `No ghosts here. Suspiciously clean.` and `Trackers that load later will appear here.`
42. The ghost list shall be populated from a message the content script sends to the background, which the popup polls or receives via a storage change; the list shall reflect the current page's trackers only.

### Exorcise (Declarative Net Request)

43. Exorcising a company shall add one `declarativeNetRequest` session rule that blocks all of that company's matched domains for the current tab only (`tabIds: [tabId]`, `action: { type: "block" }`, `priority: 1`).
44. The Exorcise action shall be available from both the ghost card (button inside the costume) and the popup ghost row (button inside the popup), both routing through the background service worker.
45. For `EXORCISE`, `LET_BACK`, `CLEAR_EXORCISE`, and `TRACKER_UPDATE` messages sent by the content script, the background shall obtain the tab ID from `sender.tab.id` (content scripts cannot call `chrome.tabs.getCurrent`). The content script shall not include a `tabId` field in these messages.
46. The content script shall send a `LET_BACK` message to the background, which removes the matching session rule.
47. After Exorcise, subsequent tracker requests from that company's domains on that tab shall be refused by the network layer (the request shall not reach the page).
47a. When the background receives an `EXORCISE` or `LET_BACK` message, it shall accept only domains that are present in `trackers.json` for the named company. Any domain not found in the tracker data for that company shall be silently ignored (not blocked). This prevents a compromised or buggy content script from blocking arbitrary domains.
48. The `Exorcist` class from `src/background/` shall manage session rule IDs with a simple incrementing integer counter (one session rule per tab+company). There is no LRU pool and no maximum rule cap; one rule per tab+company is sufficient.
49. Un-haunt shall remove all session rules for that tab; the content script shall send a `CLEAR_EXORCISE` message and the background shall remove every session rule whose `tabIds` contains that tab.
50. Tab close shall remove all session rules for that tab; the background shall listen on `chrome.tabs.onRemoved` and remove matching rules.
51. Exorcise rules are session-scoped: they live only until the browser closes unless the user explicitly persists them (persistence is out of scope for this spec).

### Non-Destructive DOM

52. The tracker detector shall never modify any page DOM node outside the shadow host.
53. The `PerformanceObserver` and `IntersectionObserver` shall be read-only: they detect resources and measure slot positions but do not mutate the page.
54. Page scripts shall never be edited, blocked, or reordered.
55. Never change form behaviour — no adding, removing, or modifying form elements, handlers, or submission logic.
56. After un-haunt, `document.documentElement.outerHTML` shall be byte-identical to its pre-haunt value.

### Accessibility

57. All ghost sprites shall be keyboard reachable with visible focus indicators (the costume focus ring from R4).
58. The ghost card's `[Exorcise]` / `[Let it back]` and `[x]` close buttons shall be keyboard reachable; Esc shall close the card.
59. The popup ghost rows and their `[Exorcise]` buttons shall be keyboard reachable with the popup focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`).
60. HUD and overlay text shall meet 4.5:1 contrast ratio against its background.
61. No flashing, blinking, or strobing faster than 3 Hz shall occur in any tracker-detector visual element.

### Reduced Motion

62. Under `prefers-reduced-motion: reduce`, the ghost rise-in shall be replaced by an instant opacity 1; ghosts shall sit still at their slot centres with no bob or sway.
63. Under `prefers-reduced-motion: reduce`, the haunt-moment phase that rises ghosts (1400–2000ms) shall be skipped; ghosts appear with the cross-fade at 300ms.

### E2E Test

64. An end-to-end test shall prove that after Exorcise, a tracker request from the exorcised company's domain on that tab is refused (the resource does not load). The test shall use the real shipped `src/data/trackers.json` (no test-only patch). Chromium shall be launched with `--host-resolver-rules` mapping a few real tracker domains to `127.0.0.1` so that the fixture page `fixtures/trackers.html` loads resources from those domains via the local fixture server. The refusal proof is a request from the page to an exorcised domain failing with `net::ERR_BLOCKED_BY_CLIENT`.
65. The same test shall prove that after "Let it back" or Un-haunt, the tracker request succeeds again.
