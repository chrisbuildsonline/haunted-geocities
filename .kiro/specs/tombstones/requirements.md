# Requirements: Tombstones (R7)

## Overview

This spec covers **tombstone links**: dead same-origin links (HTTP 404/410) that become tombstones while a tab is haunted. It adds a pure link collector, a same-origin link checker that runs in the content script, an opt-in cross-site link checker that runs in the background service worker, per-tab tombstone state, tombstone markers in the costume's markers layer, a tombstone card that is the stone itself, popup tombstone rows, and the fixture and test surfaces.

It builds on the costume renderer (R4), which established the shadow DOM layers (`#markers` z-index 3, `#cards` z-index 6), the haunt-moment timeline, the body-padding adopted stylesheet, and the reduced-motion handling. It also builds on the tracker detector (R5) and runtime vampires (R6), which established the gutter-lane ghosts and vampires, the HUD counts, the popup list pattern, the background message router, and the per-tab session storage keys. This spec populates the `#markers` layer, adds a `tombstones` count to the HUD, adds tombstone rows to the popup after the vampire rows, and wires a new `CHECK_LINKS` and `TOMBSTONE_UPDATE` message round-trip.

The costume overlay is a non-destructive decoration. The link checker uses `fetch` with `credentials: 'omit'` and `redirect: 'manual'`; it never follows redirects on the cross-site path. The page's DOM, styles, and scripts must be byte-identical after Un-haunt.

Steering references: `product.md` (tombstone links, cross-site opt-in host permission, scope boundaries), `tech.md` (Shadow DOM, adopted stylesheets, MutationObserver, IntersectionObserver, no `host_permissions` at install), `non-destructive-dom.md` (observers read-only, no page mutation, byte-identical un-haunt, never change form behaviour), `accessibility-and-motion.md` (reduced motion, 3 Hz ceiling, keyboard, contrast), `era-accuracy.md` (web-safe colours, Times New Roman, original pixel art), `structure.md` (`src/content/`, `src/background/`, `src/data/types.ts`, `fixtures/`).

## EARS Acceptance Criteria

### Link Collector

1. A pure module `src/content/links.ts` shall export a `collectLinks(doc: Document, siteOrigin: string, costumeHost: string)` function that returns `{ sameOrigin: string[]; crossSite: string[] }`.
2. The collector shall select all `a[href]` elements in the document, keep only links whose href scheme is `http` or `https`, and drop links whose href is hash-only (starts with `#`), `javascript:`, `mailto:`, `tel:`, or that carry a `download` attribute.
3. The collector shall drop the fragment from each URL (normalise by stripping everything from `#` onward).
4. The collector shall deduplicate URLs so each distinct normalised URL appears at most once, preserving document order (first occurrence wins).
5. The collector shall drop any link whose resolved URL's host is the costume host (`hg-crypt` custom element) or that is inside the costume host's shadow root subtree.
6. The collector shall split the URLs into `sameOrigin` (same origin as `siteOrigin`) and `crossSite` (every other http/https URL).
7. The collector shall cap `sameOrigin` at 60 URLs and `crossSite` at 30 URLs, keeping the first in document order and dropping the rest.
8. The collector shall be a pure function with no side effects, importable from both the content script and unit tests without a Chrome API.

### Same-Origin Link Checker

9. The content script shall check each same-origin URL by calling `fetch(url, { method: 'HEAD', credentials: 'omit', redirect: 'manual', cache: 'no-store' })` with a 5-second timeout enforced by `AbortController`.
10. The checker shall check at most 4 URLs concurrently.
11. If a HEAD request fails with HTTP 405 or 501 (method not allowed), the checker shall retry once with `GET` (same `credentials: 'omit'`, same 5-second timeout).
12. Only an HTTP status of 404 or 410 shall mark a URL as dead (a tombstone). Network errors, timeouts, opaque redirects (type `opaqueredirect`), and every other HTTP status count as alive — a URL shall never become a false tombstone.
13. The checker shall return `{ url, path, status }[]` for dead links only, where `path` is the URL's pathname and `status` is 404 or 410.

### Cross-Site Link Checker (Opt-In)

14. The content script shall check whether `chrome.permissions.contains({ origins: LINK_CHECK_ORIGINS })` returns true before sending any cross-site URLs to the background. When the permission is missing, cross-site links are not checked (no tombstones from cross-site links).
15. When the optional http/https origins are granted, the content script shall send the cross-site URLs to the background in a `CHECK_LINKS` content request: `{ type: "CHECK_LINKS", urls: string[] }`.
16. The background router shall accept `CHECK_LINKS` only from a content-script sender whose `sender.tab.id` is a haunted tab (the `haunt:<tabId>` key exists in `chrome.storage.session`). When the tab is not haunted, the router shall refuse the request.
17. The background router shall refuse `CHECK_LINKS` when the optional http/https origins are not granted (`chrome.permissions.contains` returns false).
18. The background shall check each cross-site URL with the same fetch rules as the same-origin checker (HEAD, `credentials: 'omit'`, `redirect: 'manual`, `cache: 'no-store'`, 5-second timeout, 4 concurrent, retry GET on 405/501, only 404/410 make a tombstone).
19. The background shall refuse to check any URL whose hostname is `localhost`, any hostname ending in `.localhost`, any hostname ending in `.local`, any hostname ending in `.internal`, or any IPv4/IPv6 address in loopback (`127.0.0.0/8`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), or unique-local (`fc00::/7`) ranges.
20. The background shall not follow any redirect on the cross-site path. An `opaqueredirect` response counts as alive, never a tombstone.
21. The background shall send dead cross-site links back to the content script via `chrome.tabs.sendMessage` as `{ type: "tombstones", dead: { url, path, status }[] }`.
22. A known security ceiling: DNS rebinding to a LAN IP is not caught by the hostname refusal list. If a public hostname resolves to a private IP at fetch time, the fetch may reach an internal service. This shall be documented in `design.md` and accepted as a known limitation.

### State

23. Dead links (same-origin and cross-site) shall be sent to the background in a `TOMBSTONE_UPDATE` content request: `{ type: "TOMBSTONE_UPDATE", dead: { url, path, status }[] }`.
24. The background shall store tombstones per tab in `chrome.storage.session` under `tombstonesKey(tabId)`, where `tombstonesKey` is `tombstones:<tabId>`.
25. The background shall clear `tombstonesKey(tabId)` on Un-haunt and on navigation (the same `tabs.onUpdated` "loading" check that clears ghosts and the nonce).
26. `TabState` shall gain a `tombstones: { url: string; path: string; status: number }[]` field, populated from `chrome.storage.session` in `getState`.
27. The background shall return `tombstones` in every `getState` response so the popup can list them.

### Costume: Markers

28. Each dead link shall get a 16×20 tombstone marker (8×10 art grid at 2 CSS px) in the `#markers` layer of the shadow root, using a new `TOMB` sprite in `art.ts`.
29. The marker shall be placed 4px after the link's last client rect, vertically centred on it, and shall never overlap page text.
30. If placing the marker 4px after the last rect would leave the viewport, the marker shall go in the nearest gutter lane at the same y (using the same `planSlots` lane logic from `ghosts.ts`).
31. If there is no lane at that y either, no marker shall be rendered for that link. The HUD count and the popup list shall still include it.
32. Markers shall follow scroll and resize, repositioned with `requestAnimationFrame` throttling.
33. Markers shall be hidden while their link is off screen (using an `IntersectionObserver` on the link element).
34. Markers shall be focusable buttons with `aria-label` set to `Dead link: <path>, <status>`.
35. Markers shall fade in 200ms after the haunt moment (at the 2300–2500ms markers phase). Under `prefers-reduced-motion: reduce`, markers appear with the cross-fade at 300ms, no fade-in animation.

### Costume: Tombstone Card

36. The tombstone card is the stone itself, per `design/DESIGN.md`: a 176px-wide `#cccccc` slab with an 88px top radius (arched headstone, no blur), a 2px bevel `#ffffff`/`#666666`, and moss pixels `#336633` along the base.
37. The inscription shall be absolutely pinned to the stone face (16px inset) in Times New Roman `#000000`: `HERE LIES` (11px, letter-spacing 2px), the path at 13px, then `404 · Not Found` (11px) or `410 · Gone` (11px).
38. The path text shall use `-webkit-line-clamp: 3` (max 3 lines). A `<wbr>` shall be inserted after every `/`. `overflow-wrap` shall be `normal` and `word-break` shall be `keep-all`, so lines break only at `/` and never inside a filename.
39. A single path segment too long for one line shall be ellipsised at its start (so the end of the filename is visible).
40. The path text shall be set with `textContent` per segment (split at `/`, insert `<wbr>` between segments), never `innerHTML` from the URL.
41. The card shall have a Win95 `[x]` close button.
42. `Esc` shall close the card and return focus to the marker that opened it.
43. Only one card shall be open at a time (shared with the ghost and vampire cards).

### HUD

44. The HUD tombstone count shall show the number of dead links (the length of the `tombstones` array), via the existing `setCounts` function.
45. The HUD tombstone count shall update when new dead links are found.

### Popup

46. The popup haunted screen shall list tombstones after vampires: each row shows the path on line 1 (wrapping at `/`), and a status pill `404` or `410` on line 2 with the host when the link is cross-site.
47. When no tombstones are found, the list surface shall show `No tombstones. Every link is alive.`
48. The Tombstones tile in the count grid shall show the tombstone count.

### Fixtures

49. A fixture page `fixtures/links.html` shall contain: a live same-origin link (to a file that exists), a link to a missing file that the fixture server answers 404, a link to `/gone/` that the fixture server answers 410, a deep path like `/blog/2019/the-very-long-haunted-filename-that-must-not-break.html` that 404s, a `mailto:` link, and a hash-only link. The `mailto:` and hash links must be ignored by the collector.
50. The fixture server (`scripts/fixture-server.ts`) shall answer `/gone/` with HTTP 410.

### Non-Destructive DOM

51. The link checker, the collector, the marker positioning, and the tombstone card shall never modify any page DOM node outside the shadow host.
52. `fetch` calls for link checking shall use `credentials: 'omit'` so no cookies are sent to checked URLs.
53. The page's scripts are never edited, blocked, or reordered.
54. Never change form behaviour — no adding, removing, or modifying form elements, handlers, or submission logic.
55. After un-haunt, `document.documentElement.outerHTML` shall be byte-identical to its pre-haunt value.

### Accessibility

56. All tombstone markers shall be keyboard reachable (`<button>`) with visible focus indicators (the costume focus ring).
57. The tombstone card's `[x]` close button shall be keyboard reachable; `Esc` shall close the card and return focus to the opener marker.
58. Popup tombstone rows and their status pills shall be keyboard reachable with the popup focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`).
59. HUD and overlay text shall meet 4.5:1 contrast ratio against its background.
60. No flashing, blinking, or strobing faster than 3 Hz shall occur in any tombstone visual element.

### Reduced Motion

61. Under `prefers-reduced-motion: reduce`, the tombstone marker fade-in at the haunt moment shall be replaced by the cross-fade at 300ms; no fade-in animation.
62. Under `prefers-reduced-motion: reduce`, tombstone markers shall not drift or animate beyond the cross-fade.

### Tests

63. Unit tests in `test/tombstones/` shall verify the link collector: keeps http/https only, drops hash-only/`javascript:`/`mailto:`/`tel:`/`download`/costume-host links, normalises by dropping the fragment, deduplicates, splits same-origin and cross-site, caps at 60/30, and preserves document order.
64. Unit tests in `test/tombstones/` shall verify the same-origin checker with a mock `fetch`: 404 → dead, 410 → dead, 405 then GET retry → alive, timeout → alive, network error → alive, opaque redirect → alive, 200 → alive, 500 → alive.
65. Unit tests in `test/tombstones/` shall verify the background host refusal list: `localhost`, `*.localhost`, `*.local`, `*.internal`, IPv4 loopback/private/link-local, and IPv6 `::1` / `fc00::/7` are all refused.
66. Unit tests in `test/tombstones/` shall verify the router: `CHECK_LINKS` is accepted only from a haunted tab, refused when the tab is not haunted, and refused when the optional permission is missing.
67. An end-to-end test `e2e/tombstones.spec.ts` shall verify: markers appear beside dead links in the shadow root, the stone card wraps only at `/`, the HUD count is correct, the popup lists tombstones, and the page is left byte for byte the same after Un-haunt.
