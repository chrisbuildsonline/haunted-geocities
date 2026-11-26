# Requirements: Site Haunt (R11)

## Overview

Today a haunt lasts one page. A click on any link, or a reload, throws the overlay away with the old document, and the user has to open the popup and press Haunt again. This spec adds **site haunt**: after Haunt, the same tab keeps haunting every page of the same site until the tab leaves the site.

Following a site means the background must inject `content.js` into pages the user never clicked the toolbar for, so `activeTab` is not enough. The extension asks for access to that one site through the optional host permissions it already declares (`http://*/*` and `https://*/*`). The manifest does not change.

F26 (jury run 154) split the idle popup into two buttons. **F27 (owner decision) replaces that with one button**: criteria 7 to 13 and 45 describe it, and group 8 of `tasks.md` is superseded by group 9. The idle popup has a single primary button, **Haunt page**, which does the whole-site haunt and asks Chrome once. If the user says no, the result is the one-page haunt.

F27 also adds a **page-change cover** (criteria 49 to 63). A quiet re-haunt takes a moment to arrive, so the original page would flash on each follow-up page. A dynamic content script, `cover.js`, puts up a 1998 loading screen at `document_start` and removes it when the costume is in.

| Piece | What it does |
| --- | --- |
| Popup | `Haunt page` asks for the site's origins inside its click, sends `HAUNT` at once, then `FOLLOW_SITE` if the answer is yes. Shows `Haunting all of SITE`. |
| Background | Stores `site:<tabId>` in `storage.session`, registers `cover.js` for the site, re-injects `content.js` quietly on each new page of the site, and ends the site haunt, the registration and the permission when the tab leaves. |
| Cover script | `cover.js` covers a new page of a haunted site before it paints and removes the cover when the costume is rendered. |
| Content script | A quiet haunt skips the three-second haunt moment and arrives settled, then tells the cover to go. |

Steering references: `non-destructive-dom.md` (the page is untouched, un-haunt restores it), `product.md` (permissions model: no `host_permissions` at install, optional hosts only on the user's say-so), `tech.md` (MV3 service worker, `storage.session`), `accessibility-and-motion.md` (the quiet haunt shows less motion, never more), `structure.md` (module placement). Related specs: `scaffold` (popup, router, `TabState`), `costume-renderer` (the haunt moment), `runtime-vampires` (nonce and MAIN-world hooks), `tombstones` (the optional link-check origins), `sound-effects` (the whoosh stays on the Haunt click).

## Terms

- **Site**: the string `siteOf(url)` returns. It is a hostname, not an origin.
- **Site origins**: the match patterns `siteOrigins(site)` returns, the thing asked for and granted.
- **Site entry**: the value stored at `site:<tabId>` in `chrome.storage.session` while a tab follows a site.
- **Haunt entry**: the existing `haunt:<tabId>` value, `true` while the tab is haunted.
- **Link-check origins**: `http://*/*` and `https://*/*` (`LINK_CHECK_ORIGINS`), granted when the user turns on "Check links to other sites".
- **New document**: a navigation or reload after which the old content script no longer answers a `ping`. A hash or `pushState` change keeps the document and the overlay.
- **Quiet haunt**: a haunt that skips the haunt moment and arrives settled.
- **Cover**: the full-viewport `hg-cover` loading screen `cover.js` shows while a new page of a haunted site waits for its quiet haunt.
- **Marker**: `sessionStorage["__hauntedGeoCitiesSite"]`, per tab and per origin, set to `"1"` in a haunted tab. It tells `cover.js` at once, without a message, that this tab follows a site.

## EARS Acceptance Criteria

### The site of a URL

1. The function `siteOf(url)` shall return the URL's hostname in lower case with one leading `www.` removed, and `null` for any URL whose protocol is not `http:` or `https:` and for any string that is not a URL.
2. `siteOf` shall remove only one leading `www.`, so `www.www.example.com` gives `www.example.com`, and shall leave a host such as `wwwexample.com` unchanged.
3. The function `onSite(url, site)` shall return true when `siteOf(url)` equals `site` or ends with `"." + site`, and false otherwise. `evilnps.gov` is not on `nps.gov`, and `nps.gov.evil.com` is not on `nps.gov`.
4. When `site` is an IP address or has no dot (`localhost`), `onSite` shall return true only for an exact match, because a suffix of an address or of a dotless name is not a parent domain.
5. The function `siteOrigins(site)` shall return `http://SITE/*`, `https://SITE/*`, `http://*.SITE/*` and `https://*.SITE/*`, and for an IP address or a dotless host only the first two.
6. Every pattern `siteOrigins` returns shall be covered by `optional_host_permissions` (`http://*/*` and `https://*/*`), and the shipping manifest shall still have no `host_permissions`.

### One button, asking in its click (F27)

7. The idle popup shall show one button in the Haunt group box, **Haunt page** (class `primary`), and it shall be the only `.primary` button in the popup. There shall be no **Haunt this whole site** button, no `.site-haunt` element and no second Haunt action.
8. When the tab's URL has a site (`siteOf(url)` is not `null`, so `http` or `https`), the idle popup shall show under the button a muted line, linked to the button by `aria-describedby`: `Chrome may ask once to let the haunt follow you around SITE.` where SITE is `siteOf(url)`, in lower case. When the URL has no site, the line shall not be shown.
9. When the user clicks **Haunt page** on a tab that has a site, the popup shall call `chrome.permissions.request({ origins: siteOrigins(site) })` before any `await` in the click handler, so the call is made inside the user gesture, and shall send `HAUNT` at once without waiting for the permission answer, so the current page haunts with `activeTab`.
10. When the tab's URL has no site (a restricted page, a `file:` page), no click shall call `permissions.request`, and `HAUNT` is sent as before. While the click is in flight, the button shall be disabled and have `aria-busy="true"`, until the `HAUNT` answer and the permission answer have arrived. The popup shall then refresh its screen once.
11. When the request resolves `true` and `HAUNT` did not fail, the popup shall send `FOLLOW_SITE` with the tab id, and shall show the state that answer returns. Every later page of the same site in that tab is then haunted without further clicks, without the haunt moment, and without a flash of the original page (criteria 18 to 26 and 49 to 63).
12. When the request resolves `false`, rejects or throws, the popup shall send no `FOLLOW_SITE`, and the haunt shall be one page only: a reload or a navigation clears it. Nothing is registered for the site.
13. When `HAUNT` fails, the popup shall show the existing haunt error and shall not send `FOLLOW_SITE`. After a granted request it shall also hand the site origins back with `permissions.remove`, ignoring its error. The whoosh (sound effects) plays once on the click.

### Storing the site entry

14. When the background receives `FOLLOW_SITE`, it shall store `site:<tabId>` = site in `storage.session` only if all three hold: the tab is haunted, the tab's URL is on that site (the site is `siteOf` of the tab's URL, never a value from the message), and `permissions.contains({ origins: siteOrigins(site) })` is true.
15. When any of the three fails, the background shall store nothing and answer with the tab's state, without an error.
16. Because Chrome's permission prompt can close the toolbar popup before it answers, the background shall also listen to `permissions.onAdded`. When the added origins include every site origin of a haunted tab that has no site entry, the background shall store that tab's site entry. The comparison is on the pattern strings, tab by tab.
17. A site entry shall exist only while the haunt entry exists for the same tab.

### Following the site

18. When `tabs.onUpdated` reports `status: "loading"` and the content script of the tab does not answer a `ping`, the background shall treat the tab as on a new document. A tab whose content script answers is left alone.
19. While the tab has a site entry, when the new URL (`changeInfo.url`, else `tab.url`) is on the site and the site origins are still granted, the background shall keep the haunt: it shall clear the per-page reports (ghosts, tombstones, curses, nonce, exorcise rules and badge), keep the haunt and site entries, and inject `content.js` again, quietly.
20. In every other case on a new document (no site entry, a URL off the site, the origins no longer granted, a URL with no site), the background shall stop: remove the haunt and site entries and clear the tab, as it does today.
21. When `tabs.onUpdated` reports `status: "complete"` for a tab that has a site entry and a haunt entry, and its content script does not answer a `ping`, the background shall inject `content.js` quietly again, as a retry for a page that was not ready at `loading`.
22. A reload of a page on the site shall stay haunted, through criteria 18 and 19.
23. The background shall not start a second injection for a tab while one is running, so `loading` and `complete` for the same page inject once.

### Quiet haunt

24. Before `content.js`, the background shall run a function in the ISOLATED world that sets `globalThis.__hauntedGeoCitiesQuiet = true`.
25. `content.js` shall read that flag and delete it, then call `renderCostume(document, { quiet: true })` when it was set, and `renderCostume(document)` otherwise. The flag shall never remain set after content.js runs.
26. A quiet `renderCostume` shall skip the haunt moment: no CRT-off, no parade, no caption and no wipe. It shall arrive settled, as it already does in a hidden tab.
27. After a quiet haunt the background shall install the MAIN-world vampire hooks again, with a fresh nonce, because the clear in criterion 19 removed the old one.
28. A haunt started by the Haunt button shall not be quiet.

### Ending the site haunt

29. The site haunt shall end, by removing the site entry, on Un-haunt, on a new document off the site, on tab close, and when Chrome removes the site permission.
30. When `permissions.onRemoved` fires, the background shall drop every site entry whose site origins are no longer contained. The page stays haunted as a one-page haunt, and the next new document clears it (criterion 20).
31. When a site entry is dropped, the background shall call `chrome.permissions.remove({ origins: siteOrigins(site) })`, so that Chrome no longer lists site access for the extension.
32. The background shall skip that `remove` when another tab still has a site entry for the same site, or when `http://*/*` and `https://*/*` are both granted, because the user turned those on for link checks and they already cover every site.
33. The background shall ignore any error from `permissions.remove`, including the error for an origin that was never optional.
34. When a tab with no site entry is un-haunted, closed or navigated away, the background shall make no `permissions` call.

### State and popup

35. `TabState` shall gain `site: string | null`: the tab's site entry while the tab is haunted, else `null`. Every `TabState` the background builds, including the error fallback, shall set it.
36. When `site` is set, the popup's haunted screen shall show the line `Haunting all of SITE` under the address. When it is `null`, nothing extra shall be shown.
37. Un-haunt shall end the site haunt (criteria 29, 31) and the popup shall then show the idle screen.
38. The line shall be plain text, 4.5:1 contrast, and shall not use a colour outside the web-safe 216.

### Privacy and permissions

39. The feature shall add no permission, no `host_permissions`, no `optional_permissions` and no `web_accessible_resources`, and shall change nothing in the shipping manifest. `bun run lint:manifest` shall still pass.
40. The feature shall keep no browsing history: the only record is the site entry in `storage.session`, one per haunted tab, gone when the tab leaves, the browser closes, or Un-haunt runs. Nothing shall be written to `storage.local` or `storage.sync`.
41. Nothing shall leave the machine because of this feature. It adds no network request and no remote code.
42. The background shall take the site only from the tab's own URL, never from a message body, and shall ignore a `FOLLOW_SITE` that comes from a content script.

### Tests

43. Unit tests in `test/site-haunt.test.ts` shall cover `siteOf`, `onSite` and `siteOrigins` (criteria 1 to 6), including `evilnps.gov`, IP and dotless hosts, and non-http URLs.
44. Unit tests in the same file shall drive the background with the mock in `test/chrome-mock.ts` through every transition of the state machine in `design.md` (criteria 14 to 23, 27, 29 to 35, 40, 42).
45. Popup tests in `test/popup.test.ts` shall cover: one `.primary` button and no `.site-haunt`; the click requests the origins before any `await`; `HAUNT` sent at once; `FOLLOW_SITE` after `HAUNT` on a `true`; none after `false`, a rejection, a throw or a failed haunt; the note names the site and is linked by `aria-describedby`; no note and no request for a `file:` or restricted tab; the button disabled and `aria-busy` until both answers arrive; and the site line (criteria 7 to 13, 36, 37).
46. E2E tests in `e2e/site-haunt.spec.ts` shall show: one button only; the click then an internal link gives a haunted next page with no haunt moment; a link to another site gives a clean page; a reload stays haunted; a denied permission gives one page (criteria 7, 11, 12, 19, 20, 22, 26). The cover tests are criterion 63.
47. `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run lint:manifest` and `bun run docker:test` shall pass, with the popup's baselines regenerated in Docker and reviewed (the idle screen for the one button and its note, the haunted screen for the site line).
48. The README, `docs/devpost.md` and `docs/demo-script.md` shall describe the one button, the note, and the cover on the next page, and the demo shall show the Allow path and the Deny path.

### The page-change cover (F27)

49. When the background stores a site entry (`FOLLOW_SITE` or `permissions.onAdded`), it shall register a dynamic content script with `chrome.scripting.registerContentScripts`: `id` `"cover-" + site`, `matches` `siteOrigins(site)`, `js` `["cover.js"]`, `runAt` `"document_start"`, `allFrames` `false`, `persistAcrossSessions` `false`. It shall skip the call when `getRegisteredContentScripts({ ids })` already lists that id, and ignore any error.
50. When a site entry is dropped, the background shall unregister `"cover-" + site` unless another tab still has a site entry for the same site. It shall not look at the link-check grant: the registration goes even when the access stays. It shall also unregister every `cover-` script at browser start, in the same handler that hands stale access back.
51. `cover.js` shall run in the ISOLATED world at `document_start`, before the page paints. It shall change no page node except appending its one `hg-cover` element to `documentElement`.
52. The marker shall be set by the background, with an ISOLATED-world `executeScript` in the haunted tab, when the site entry is stored and before each quiet re-haunt. `content.js` shall remove it on un-haunt.
53. `cover.js` shall read the marker synchronously. With the marker, it shall put up the cover at once and then send `COVER_CHECK`. When the answer is `false` (a `sessionStorage` copied into a new tab) it shall remove the cover and the marker. Without the marker, it shall send `COVER_CHECK` and put up the cover only on `true` (a subdomain, which is another origin and has no marker). A tab that is not haunted shall never be covered.
54. The background shall answer `COVER_CHECK` from `sender.tab.id` alone, with `true` only when that tab is haunted, has a site entry, and its URL is on that site, and `false` otherwise. It shall ignore a tab id in the body and a sender that is an extension page.
55. The cover shall be a custom element `hg-cover` with a closed shadow root, full viewport, `position: fixed`, at the top `z-index`. It shall look like a 1998 GeoCities and Windows 95 loading screen: a dark crypt background, a small bobbing pixel ghost, the text `Loading crypt…` and a Win95 sunken progress bar with moving blue blocks. Every colour is web-safe, the ghost is original pixel art, and the face is Comic Sans MS with the stack in `design/DESIGN.md`.
56. The text shall sit in an element with `role="status"` so a screen reader hears it. The cover shall have no focusable content, shall not set `inert` on the page, shall not move focus, and shall block pointer events only while it is shown.
57. With `prefers-reduced-motion: reduce`, the cover shall be static: no bob, no moving blocks and no fade. The motion shall stay under 3 Hz.
58. The cover shall be removed with a 200ms fade when the quiet costume render finishes: `content.js` calls the hook `cover.js` left on the ISOLATED world's global. It shall also be removed after 3000ms at the latest, and at once on un-haunt. Removal is idempotent and leaves no `hg-cover` node.
59. The first haunt of a page shall keep its three-second haunt moment and shall never show the cover: the registration affects only documents that load after it.
60. Leaving the site, Un-haunt, tab close and access removal shall unregister the script (criterion 50). After a denied permission nothing shall be registered.
61. The cover shall add no permission, no `web_accessible_resources` and no manifest entry. `cover.js` is a self-contained IIFE in `dist/`, `bun run lint:manifest` shall still pass, and the cover makes no network request.
62. The marker shall hold only the value `"1"`. It is per-tab session storage, so it keeps no history and is gone when the tab closes.
63. Unit tests in `test/cover.test.ts` shall cover criteria 51 to 58 (marker, check answers, reduced motion, the 3s fallback, the removal hook, no focusable content). Background tests in `test/site-haunt.test.ts` shall cover criteria 49, 50, 52 and 54. `e2e/site-haunt.spec.ts` shall show that the next internal link is covered at `DOMContentLoaded` and before first paint, then uncovered and haunted with no intro, that Deny registers nothing, that an un-haunted tab on the same site is never covered, and that Un-haunt and leaving the site remove the registration.
