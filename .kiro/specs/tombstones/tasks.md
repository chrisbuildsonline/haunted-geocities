# Tasks: Tombstones (R7)

Implementation checklist for the tombstones spec. Each task references the requirement numbers it satisfies and names the test that proves it.

Tests live under `test/tombstones/` (Bun unit tests) and `e2e/` (Playwright end-to-end tests).

## 1. Types

- [x] 1.1 Add `DeadLink` interface to `src/data/types.ts`: `{ url: string; path: string; status: number }` (status is 404 or 410).
  - Req: 13, 23
  - Test: `test/tombstones/links.test.ts` → `"DeadLink type is exported and importable"`.

- [x] 1.2 Add `CHECK_LINKS` and `TOMBSTONE_UPDATE` variants to `ContentRequest`: `{ type: "CHECK_LINKS"; urls: string[] }` and `{ type: "TOMBSTONE_UPDATE"; dead: DeadLink[] }`.
  - Req: 15, 23
  - Test: `test/tombstones/router.test.ts` → `"ContentRequest has CHECK_LINKS and TOMBSTONE_UPDATE variants"`.

- [x] 1.3 Add `tombstones` variant to `ContentMessage`: `{ type: "tombstones"; dead: DeadLink[] }` (background → content direction).
  - Req: 21
  - Test: `test/tombstones/router.test.ts` → `"ContentMessage has tombstones variant"`.

- [x] 1.4 Add `tombstonesKey = (tabId: number) => \`tombstones:\${tabId}\`` to `src/data/types.ts`.
  - Req: 24
  - Test: `test/tombstones/router.test.ts` → `"tombstonesKey returns tombstones:<tabId>"`.

- [x] 1.5 Add `tombstones: DeadLink[]` field to `TabState`.
  - Req: 26
  - Test: `test/tombstones/router.test.ts` → `"TabState has tombstones field"`.

## 2. Link Collector

- [x] 2.1 Create `src/content/links.ts` exporting `collectLinks(doc: Document, siteOrigin: string, costumeHost: string): { sameOrigin: string[]; crossSite: string[] }`. Select all `a[href]` elements, resolve each href against `doc.baseURI`, and keep only `http`/`https` schemes.
  - Req: 1, 2
  - Test: `test/tombstones/links.test.ts` → `"collectLinks keeps http and https links only"`, `"collectLinks drops ftp links"`.

- [x] 2.2 Drop links whose href is hash-only (starts with `#`), `javascript:`, `mailto:`, `tel:`, or that carry a `download` attribute.
  - Req: 2
  - Test: `test/tombstones/links.test.ts` → `"collectLinks drops hash-only links"`, `"collectLinks drops javascript: links"`, `"collectLinks drops mailto: links"`, `"collectLinks drops tel: links"`, `"collectLinks drops download links"`.

- [x] 2.3 Drop the fragment from each URL by setting `url.hash = ""` after resolution.
  - Req: 3
  - Test: `test/tombstones/links.test.ts` → `"collectLinks normalises by dropping the fragment"`.

- [x] 2.4 Deduplicate normalised URLs so each distinct URL appears at most once, preserving document order (first occurrence wins).
  - Req: 4
  - Test: `test/tombstones/links.test.ts` → `"collectLinks deduplicates URLs"`, `"collectLinks preserves document order on dedup"`.

- [x] 2.5 Drop any link whose resolved URL's host is the costume host (`hg-crypt`) or that is inside the costume host's subtree, using `a.closest(costumeHost)`.
  - Req: 5
  - Test: `test/tombstones/links.test.ts` → `"collectLinks drops costume-host links"`.

- [x] 2.6 Split URLs into `sameOrigin` (same origin as `siteOrigin`) and `crossSite` (every other http/https URL).
  - Req: 6
  - Test: `test/tombstones/links.test.ts` → `"collectLinks splits same-origin and cross-site"`.

- [x] 2.7 Cap `sameOrigin` at 60 URLs and `crossSite` at 30 URLs, keeping the first in document order and dropping the rest.
  - Req: 7
  - Test: `test/tombstones/links.test.ts` → `"collectLinks caps sameOrigin at 60"`, `"collectLinks caps crossSite at 30"`.

- [x] 2.8 Verify `collectLinks` is a pure function with no side effects, importable from both the content script and unit tests without a Chrome API.
  - Req: 8
  - Test: `test/tombstones/links.test.ts` → `"collectLinks is pure: no Chrome API, no side effects"`.

## 3. Same-Origin Link Checker

- [ ] 3.1 Create `src/content/link-check.ts` exporting `checkLinks(urls: readonly string[], opts: CheckOptions): Promise<DeadLink[]>`. Each URL is checked via `fetch(url, { method: "HEAD", credentials: "omit", redirect: "manual", cache: "no-store" })` with a 5-second timeout enforced by `AbortController`.
  - Req: 9
  - Test: `test/tombstones/link-check.test.ts` → `"checkLinks sends HEAD with credentials omit, redirect manual, cache no-store"`, `"checkLinks enforces 5-second timeout via AbortController"`.

- [x] 3.2 Check at most 4 URLs concurrently using a worker-pool pattern.
  - Req: 10
  - Test: `test/tombstones/link-check.test.ts` → `"checkLinks checks at most 4 URLs concurrently"`.

- [x] 3.3 If a HEAD request fails with HTTP 405 or 501, retry once with `GET` (same `credentials: "omit"`, same 5-second timeout).
  - Req: 11
  - Test: `test/tombstones/link-check.test.ts` → `"405 then GET retry returns alive"`, `"501 then GET retry returns alive"`.

- [x] 3.4 Only an HTTP status of 404 or 410 marks a URL as dead (tombstone). Network errors, timeouts, opaque redirects (type `opaqueredirect`, status 0), and every other HTTP status count as alive.
  - Req: 12
  - Test: `test/tombstones/link-check.test.ts` → `"404 returns dead"`, `"410 returns dead"`, `"timeout returns alive"`, `"network error returns alive"`, `"opaque redirect returns alive"`, `"200 returns alive"`, `"500 returns alive"`.

- [x] 3.5 Return `{ url, path, status }[]` for dead links only, where `path` is the URL's pathname and `status` is 404 or 410.
  - Req: 13
  - Test: `test/tombstones/link-check.test.ts` → `"dead link has correct url, path, and status"`, `"path extraction: http://example.com/blog/post.html → /blog/post.html"`.

## 4. Cross-Site Link Checker (Opt-In)

- [x] 4.1 Create `src/background/link-guard.ts` exporting `refusedHost(hostname: string): boolean`. Refuse `localhost`, `*.localhost`, `*.local`, `*.internal`, IPv4 loopback (`127.0.0.0/8`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), IPv6 `::1`, unique-local (`fc00::/7`), and link-local (`fe80::/10`).
  - Req: 19
  - Test: `test/tombstones/link-guard.test.ts` → `"localhost is refused"`, `"foo.localhost is refused"`, `"bar.local is refused"`, `"baz.internal is refused"`, `"127.0.0.1 is refused"`, `"10.0.0.1 is refused"`, `"172.16.0.1 is refused"`, `"192.168.1.1 is refused"`, `"169.254.1.1 is refused"`, `"::1 is refused"`, `"fc00::1 is refused"`, `"fe80::1 is refused"`, `"8.8.8.8 is not refused"`, `"example.com is not refused"`.

- [x] 4.2 The content script checks `chrome.permissions.contains({ origins: LINK_CHECK_ORIGINS })` before sending cross-site URLs to the background. When the permission is missing, cross-site links are not checked.
  - Req: 14
  - Test: `test/tombstones/router.test.ts` → `"content script skips CHECK_LINKS when permission is missing"`.

- [x] 4.3 When the optional origins are granted, the content script sends cross-site URLs in a `CHECK_LINKS` content request: `{ type: "CHECK_LINKS", urls: string[] }`.
  - Req: 15
  - Test: `test/tombstones/router.test.ts` → `"content script sends CHECK_LINKS with cross-site URLs when permission granted"`.

- [x] 4.4 The background router accepts `CHECK_LINKS` only from a content-script sender whose `sender.tab.id` is a haunted tab (`haunt:<tabId>` exists in `chrome.storage.session`). When the tab is not haunted, refuse silently.
  - Req: 16
  - Test: `test/tombstones/router.test.ts` → `"CHECK_LINKS accepted from haunted tab"`, `"CHECK_LINKS refused when tab is not haunted"`.

- [x] 4.5 The background router refuses `CHECK_LINKS` when the optional http/https origins are not granted (`chrome.permissions.contains` returns false).
  - Req: 17
  - Test: `test/tombstones/router.test.ts` → `"CHECK_LINKS refused when optional permission is missing"`.

- [ ] 4.6 The background checks each cross-site URL with the same fetch rules as the same-origin checker (HEAD, `credentials: "omit"`, `redirect: "manual"`, `cache: "no-store"`, 5-second timeout, 4 concurrent, retry GET on 405/501, only 404/410 make a tombstone).
  - Req: 18
  - Test: `test/tombstones/router.test.ts` → `"background uses same checkLinks fetch rules for cross-site"`.

- [x] 4.7 The background filters URLs through `refusedHost` before calling `checkLinks`, dropping any URL whose hostname is refused.
  - Req: 19
  - Test: `test/tombstones/router.test.ts` → `"refused hosts are filtered before checkLinks"`.

- [x] 4.8 The background does not follow any redirect on the cross-site path. An `opaqueredirect` response counts as alive, never a tombstone.
  - Req: 20
  - Test: `test/tombstones/link-check.test.ts` → `"opaque redirect returns alive in cross-site path"`.

- [x] 4.9 The background sends dead cross-site links back to the content script via `chrome.tabs.sendMessage` as `{ type: "tombstones", dead: { url, path, status }[] }`.
  - Req: 21
  - Test: `test/tombstones/router.test.ts` → `"background sends tombstones message with dead cross-site links"`.

- [x] 4.10 Document the DNS-rebinding ceiling in `design.md`: a public hostname that resolves to a private IP at fetch time is not caught by `refusedHost`. This is accepted as a known limitation.
  - Req: 22
  - Test: `test/tombstones/link-guard.test.ts` → `"refusedHost is hostname-only, does not resolve DNS"`.

## 5. State Management

- [x] 5.1 The content script sends dead links (same-origin and cross-site) to the background in a `TOMBSTONE_UPDATE` content request: `{ type: "TOMBSTONE_UPDATE", dead: { url, path, status }[] }`.
  - Req: 23
  - Test: `test/tombstones/router.test.ts` → `"content script sends TOMBSTONE_UPDATE with dead links"`.

- [x] 5.2 The background stores tombstones per tab in `chrome.storage.session` under `tombstonesKey(tabId)` (i.e. `tombstones:<tabId>`).
  - Req: 24
  - Test: `test/tombstones/router.test.ts` → `"TOMBSTONE_UPDATE stores dead links under tombstones:<tabId>"`.

- [x] 5.3 The background clears `tombstonesKey(tabId)` on Un-haunt and on navigation (the same `tabs.onUpdated` "loading" check that clears ghosts and the nonce).
  - Req: 25
  - Test: `test/tombstones/router.test.ts` → `"clearTab removes tombstonesKey"`, `"navigation clears tombstonesKey"`.

- [x] 5.4 `getState` populates `tombstones` from `chrome.storage.session` using `tombstonesKey(tabId)`.
  - Req: 26
  - Test: `test/tombstones/router.test.ts` → `"getState returns tombstones from session storage"`.

- [x] 5.5 The background returns `tombstones` in every `getState` response so the popup can list them.
  - Req: 27
  - Test: `test/tombstones/router.test.ts` → `"getState response includes tombstones array"`.

## 6. TOMB Sprite and Art

- [ ] 6.1 Add the `TOMB` sprite (8×10 art grid at 2 CSS px per pixel = 16×20 CSS px) to `src/content/costume/art.ts` with `TOMB_LEGEND`: `G: P.stone (#cccccc)`, `D: P.stoneShadow (#666666)`, `M: P.moss (#336633)`.
  - Req: 28
  - Test: `test/tombstones/sprite.test.ts` → `"TOMB sprite is 8×10 with correct palette colours"`.

- [x] 6.2 Export `tombMarkerSvg()` returning an inline SVG string of the TOMB sprite at 16×20 CSS px with `image-rendering: pixelated`.
  - Req: 28
  - Test: `test/tombstones/sprite.test.ts` → `"tombMarkerSvg produces 16×20 inline SVG with pixelated rendering"`.

## 7. Tombstone Markers

- [ ] 7.1 Create `src/content/costume/tombstones.ts` with `renderTombstoneMarkers(dead, markers, slots, opts)` that places a tombstone marker (`<button>`) in the `#markers` layer for each dead link.
  - Req: 28
  - Test: `test/tombstones/marker.test.ts` → `"renderTombstoneMarkers creates buttons in #markers layer"`.

- [x] 7.2 Place each marker 4px after the link's last client rect, vertically centred on it. The marker shall never overlap page text.
  - Req: 29
  - Test: `test/tombstones/marker.test.ts` → `"marker placed 4px after last rect, vertically centred"`.

- [x] 7.3 If placing the marker 4px after the last rect would leave the viewport, place the marker in the nearest gutter lane at the same y (using the same `planSlots` lane logic from `ghosts.ts`).
  - Req: 30
  - Test: `test/tombstones/marker.test.ts` → `"marker falls back to gutter lane when after-rect placement leaves viewport"`.

- [ ] 7.4 If there is no lane at that y either, do not render a marker for that link. The HUD count and the popup list shall still include it.
  - Req: 31
  - Test: `test/tombstones/marker.test.ts` → `"marker not rendered when no lane available, but count includes it"`.

- [x] 7.5 Markers follow scroll and resize, repositioned with `requestAnimationFrame` throttling.
  - Req: 32
  - Test: `test/tombstones/marker.test.ts` → `"markers reposition on scroll with requestAnimationFrame throttling"`.

- [x] 7.6 Markers are hidden while their link is off screen, using an `IntersectionObserver` on the link element. The observer toggles `display` on the marker (inside the shadow root), never on the page link.
  - Req: 33
  - Test: `test/tombstones/marker.test.ts` → `"marker hidden when link off screen via IntersectionObserver"`, `"observer toggles display on marker only, not page link"`.

- [x] 7.7 Markers are focusable `<button>` elements with `aria-label` set to `Dead link: <path>, <status>`.
  - Req: 34
  - Test: `test/tombstones/marker.test.ts` → `"marker is a button with aria-label Dead link: <path>, <status>"`.

- [x] 7.8 Markers fade in 200ms after the haunt moment (at the 2300–2500ms markers phase). Under `prefers-reduced-motion: reduce`, markers appear with the cross-fade at 300ms, no fade-in animation.
  - Req: 35
  - Test: `test/tombstones/marker.test.ts` → `"markers fade in at 2300ms haunt-moment phase"`, `"reduced motion: markers appear with cross-fade at 300ms, no fade-in"`.

## 8. Tombstone Card

- [x] 8.1 Create `openTombstoneCard(cards, dead, opener, opts)` in `src/content/costume/card.ts` (or `tombstones.ts`). The card is a 176px-wide `#cccccc` slab with an 88px top radius (archched headstone, no blur), a 2px bevel `#ffffff`/`#666666`, and moss pixels `#336633` along the base.
  - Req: 36
  - Test: `test/tombstones/card.test.ts` → `"tombstone card is 176px #cccccc slab with 88px top radius and bevel"`.

- [x] 8.2 The inscription is absolutely pinned to the stone face (16px inset) in Times New Roman `#000000`: `HERE LIES` (11px, letter-spacing 2px), the path at 13px, then `404 · Not Found` (11px) or `410 · Gone` (11px).
  - Req: 37
  - Test: `test/tombstones/card.test.ts` → `"inscription has HERE LIES, path, and status in Times New Roman #000000"`.

- [x] 8.3 The path text uses `-webkit-line-clamp: 3` (max 3 lines). A `<wbr>` is inserted after every `/`. `overflow-wrap` is `normal` and `word-break` is `keep-all`, so lines break only at `/` and never inside a filename.
  - Req: 38
  - Test: `test/tombstones/card.test.ts` → `"path has wbr after every /"`, `"path uses line-clamp 3"`, `"path overflow-wrap normal and word-break keep-all"`.

- [x] 8.4 A single path segment too long for one line is ellipsised at its start (so the end of the filename is visible), using `direction: rtl` on a wrapper span.
  - Req: 39
  - Test: `test/tombstones/card.test.ts` → `"long segment ellipsised at start with direction rtl"`.

- [x] 8.5 The path text is set with `textContent` per segment (split at `/`, insert `<wbr>` between segments), never `innerHTML` from the URL.
  - Req: 40
  - Test: `test/tombstones/card.test.ts` → `"path set with textContent per segment, never innerHTML"`.

- [x] 8.6 The card has a Win95 `[x]` close button.
  - Req: 41
  - Test: `test/tombstones/card.test.ts` → `"card has Win95 [x] close button"`.

- [x] 8.7 `Esc` closes the card and returns focus to the marker that opened it.
  - Req: 42, 57
  - Test: `test/tombstones/card.test.ts` → `"Esc closes card and returns focus to opener marker"`.

- [x] 8.8 Only one card is open at a time (shared with the ghost and vampire cards).
  - Req: 43
  - Test: `test/tombstones/card.test.ts` → `"only one card open at a time"`.

## 9. Haunt-Moment and HUD

- [x] 9.1 The `#markers` layer opacity is animated at the 2300ms haunt-moment phase (existing `playHaunt` already fades `#markers` in), so tombstone markers fade in with it.
  - Req: 35
  - Test: `test/tombstones/haunt-moment.test.ts` → `"markers layer fades in at 2300ms haunt-moment"`.

- [x] 9.2 The HUD tombstone count shows the number of dead links (the length of the `tombstones` array), via the existing `setCounts` function.
  - Req: 44
  - Test: `test/tombstones/hud.test.ts` → `"HUD tombstone count equals dead links length"`.

- [x] 9.3 The HUD tombstone count updates when new dead links are found (after cross-site dead links are merged).
  - Req: 45
  - Test: `test/tombstones/hud.test.ts` → `"HUD tombstone count updates after cross-site merge"`.

## 10. Popup

- [x] 10.1 The popup haunted screen lists tombstones after vampires. Each row shows the path on line 1 (wrapping at `/`), and a status pill `404` or `410` on line 2 with the host when the link is cross-site.
  - Req: 46
  - Test: `test/tombstones/popup.test.ts` → `"tombstone row shows path wrapping at / and status pill with host for cross-site"`.

- [x] 10.2 When no tombstones are found, the list surface shows `No tombstones. Every link is alive.`
  - Req: 47
  - Test: `test/tombstones/popup.test.ts` → `"empty tombstone list shows No tombstones. Every link is alive."`.

- [x] 10.3 The Tombstones tile in the count grid shows the tombstone count.
  - Req: 48
  - Test: `test/tombstones/popup.test.ts` → `"Tombstones tile shows tombstone count"`.

## 11. Render Integration

- [x] 11.1 Modify `renderCostume()` to call `collectLinks(doc, siteOrigin, HOST_TAG)`, then `checkLinks(sameOrigin)` for same-origin dead links, render markers, update HUD, and send `TOMBSTONE_UPDATE` to the background.
  - Req: 1, 9, 23, 28, 44
  - Test: `test/tombstones/integration.test.ts` → `"renderCostume collects links, checks same-origin, renders markers, updates HUD, sends TOMBSTONE_UPDATE"`.

- [x] 11.2 If `chrome.permissions.contains(LINK_CHECK_ORIGINS)` is true, send `CHECK_LINKS` with the cross-site URLs to the background. On receiving `{ type: "tombstones", dead }`, merge cross-site dead into the existing set, re-render markers, update HUD count, and send a merged `TOMBSTONE_UPDATE`.
  - Req: 14, 15, 21, 45
  - Test: `test/tombstones/integration.test.ts` → `"cross-site dead links merged and re-rendered after CHECK_LINKS round-trip"`.

- [x] 11.3 On Un-haunt, remove all tombstone markers, disconnect the `IntersectionObserver`, and remove scroll/resize listeners. The page DOM is untouched.
  - Req: 51, 55
  - Test: `test/tombstones/integration.test.ts` → `"onUnhaunt removes markers, disconnects observer, removes listeners"`.

## 12. Fixtures

- [ ] 12.1 Create `fixtures/links.html` with: a live same-origin link (to `index.html`), a link to `/missing-page.html` (404), a link to `/gone/` (410), a deep path `/blog/2019/the-very-long-haunted-filename-that-must-not-break.html` (404), a `mailto:` link, and a hash-only link. The `mailto:` and hash links must be ignored by the collector.
  - Req: 49
  - Test: `test/tombstones/links.test.ts` → `"fixture page has live, dead 404, dead 410, deep path, mailto, and hash links"`.

- [x] 12.2 Modify `scripts/fixture-server.ts` to answer `/gone/` with HTTP 410.
  - Req: 50
  - Test: `test/tombstones/link-check.test.ts` → `"fixture server returns 410 for /gone/"`.

## 13. Non-Destructive DOM

- [x] 13.1 The link checker, the collector, the marker positioning, and the tombstone card never modify any page DOM node outside the shadow host.
  - Req: 51
  - Test: `test/tombstones/non-destructive.test.ts` → `"no page DOM nodes modified outside shadow host"`.

- [x] 13.2 `fetch` calls for link checking use `credentials: "omit"` so no cookies are sent to checked URLs.
  - Req: 52
  - Test: `test/tombstones/link-check.test.ts` → `"fetch uses credentials: omit"`.

- [x] 13.3 The page's scripts are never edited, blocked, or reordered.
  - Req: 53
  - Test: `test/tombstones/non-destructive.test.ts` → `"page scripts never edited, blocked, or reordered"`.

- [x] 13.4 Never change form behaviour — no adding, removing, or modifying form elements, handlers, or submission logic.
  - Req: 54
  - Test: `test/tombstones/non-destructive.test.ts` → `"form behaviour unchanged"`.

- [x] 13.5 After Un-haunt, `document.documentElement.outerHTML` is byte-identical to its pre-haunt value.
  - Req: 55
  - Test: `test/tombstones/non-destructive.test.ts` → `"outerHTML byte-identical after unhaunt"`.

## 14. Accessibility

- [x] 14.1 All tombstone markers are keyboard reachable (`<button>`) with visible focus indicators (the costume focus ring).
  - Req: 56
  - Test: `test/tombstones/accessibility.test.ts` → `"tombstone markers are focusable buttons with visible focus ring"`.

- [x] 14.2 The tombstone card's `[x]` close button is keyboard reachable; `Esc` closes the card and returns focus to the opener marker.
  - Req: 57
  - Test: `test/tombstones/accessibility.test.ts` → `"card close button keyboard reachable, Esc closes and returns focus"`.

- [x] 14.3 Popup tombstone rows and their status pills are keyboard reachable with the popup focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`).
  - Req: 58
  - Test: `test/tombstones/accessibility.test.ts` → `"popup tombstone rows keyboard reachable with #6633cc focus ring"`.

- [x] 14.4 HUD and overlay text meet 4.5:1 contrast ratio against its background.
  - Req: 59
  - Test: `test/tombstones/accessibility.test.ts` → `"tombstone text meets 4.5:1 contrast"`.

- [x] 14.5 No flashing, blinking, or strobing faster than 3 Hz occurs in any tombstone visual element.
  - Req: 60
  - Test: `test/tombstones/accessibility.test.ts` → `"no tombstone animation period under 333ms"`.

## 15. Reduced Motion

- [x] 15.1 Under `prefers-reduced-motion: reduce`, the tombstone marker fade-in at the haunt moment is replaced by the cross-fade at 300ms; no fade-in animation.
  - Req: 61
  - Test: `test/tombstones/reduced-motion.test.ts` → `"reduced motion: markers appear with cross-fade at 300ms, no fade-in"`.

- [x] 15.2 Under `prefers-reduced-motion: reduce`, tombstone markers do not drift or animate beyond the cross-fade.
  - Req: 62
  - Test: `test/tombstones/reduced-motion.test.ts` → `"reduced motion: markers do not drift or animate beyond cross-fade"`.

## 16. Unit Tests

- [x] 16.1 Write `test/tombstones/links.test.ts` verifying the link collector: keeps http/https only, drops hash-only/`javascript:`/`mailto:`/`tel:`/`download`/costume-host links, normalises by dropping the fragment, deduplicates, splits same-origin and cross-site, caps at 60/30, and preserves document order.
  - Req: 63
  - Test: `test/tombstones/links.test.ts` → `"collector keeps http/https only"`, `"collector drops hash-only/javascript:/mailto:/tel:/download/costume-host"`, `"collector normalises fragment"`, `"collector deduplicates"`, `"collector splits same-origin and cross-site"`, `"collector caps at 60/30"`, `"collector preserves document order"`.

- [ ] 16.2 Write `test/tombstones/link-check.test.ts` verifying the same-origin checker with a mock `fetch`: 404 → dead, 410 → dead, 405 then GET retry → alive, timeout → alive, network error → alive, opaque redirect → alive, 200 → alive, 500 → alive.
  - Req: 64
  - Test: `test/tombstones/link-check.test.ts` → `"404 → dead"`, `"410 → dead"`, `"405 then GET retry → alive"`, `"501 then GET retry → alive"`, `"timeout → alive"`, `"network error → alive"`, `"opaque redirect → alive"`, `"200 → alive"`, `"500 → alive"`.

- [ ] 16.3 Write `test/tombstones/link-guard.test.ts` verifying the background host refusal list: `localhost`, `*.localhost`, `*.local`, `*.internal`, IPv4 loopback/private/link-local, and IPv6 `::1` / `fc00::/7` are all refused.
  - Req: 65
  - Test: `test/tombstones/link-guard.test.ts` → `"localhost refused"`, `"*.localhost refused"`, `"*.local refused"`, `"*.internal refused"`, `"IPv4 loopback refused"`, `"IPv4 private refused"`, `"IPv4 link-local refused"`, `"::1 refused"`, `"fc00::/7 refused"`, `"public IP not refused"`, `"public hostname not refused"`.

- [x] 16.4 Write `test/tombstones/router.test.ts` verifying the router: `CHECK_LINKS` is accepted only from a haunted tab, refused when the tab is not haunted, and refused when the optional permission is missing. Also verify `TOMBSTONE_UPDATE` stores dead links, `getState` returns tombstones, and `clearTab` removes `tombstonesKey`.
  - Req: 66
  - Test: `test/tombstones/router.test.ts` → `"CHECK_LINKS accepted from haunted tab"`, `"CHECK_LINKS refused when not haunted"`, `"CHECK_LINKS refused when permission missing"`, `"TOMBSTONE_UPDATE stores dead links"`, `"getState returns tombstones"`, `"clearTab removes tombstonesKey"`.

## 17. E2E Tests

- [x] 17.1 Create `e2e/tombstones.spec.ts` that launches Chromium with the unpacked extension, starts the fixture server (which returns 410 for `/gone/`), and navigates to `http://127.0.0.1:4321/links.html`.
  - Req: 49, 50
  - Test: `e2e/tombstones.spec.ts` → `"fixture server serves links.html and 410 for /gone/"`.

- [x] 17.2 Haunt the tab, wait for the haunt moment to complete (2500ms), and assert markers appear beside dead links in the shadow root (`#markers .tomb-marker`).
  - Req: 28, 67
  - Test: `e2e/tombstones.spec.ts` → `"tombstone markers appear beside dead links in shadow root"`.

- [x] 17.3 Assert the HUD count is correct (matches the number of dead links: the 404, the 410, and the deep path 404).
  - Req: 44, 67
  - Test: `e2e/tombstones.spec.ts` → `"HUD tombstone count is correct"`.

- [x] 17.4 Click a tombstone marker, assert the stone card opens in `#cards`, the path text contains `<wbr>` elements after each `/`, and no break occurs inside a filename segment.
  - Req: 38, 67
  - Test: `e2e/tombstones.spec.ts` → `"stone card wraps only at / with wbr elements"`.

- [x] 17.5 Press Escape, assert the card is removed and focus returns to the marker that opened it.
  - Req: 42, 67
  - Test: `e2e/tombstones.spec.ts` → `"Esc closes card and returns focus to marker"`.

- [x] 17.6 Open the popup, assert the Tombstones tile shows the count, and tombstone rows appear after vampires, each with a path and a status pill (`404` or `410`).
  - Req: 46, 48, 67
  - Test: `e2e/tombstones.spec.ts` → `"popup lists tombstones after vampires with path and status pill"`.

- [x] 17.7 Capture `document.documentElement.outerHTML` before haunting, Un-haunt, and assert it is byte-identical.
  - Req: 55, 67
  - Test: `e2e/tombstones.spec.ts` → `"page byte-identical after unhaunt"`.
