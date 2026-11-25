# Requirements: Site Haunt (R11)

## Overview

Today a haunt lasts one page. A click on any link, or a reload, throws the overlay away with the old document, and the user has to open the popup and press Haunt again. This spec adds **site haunt**: after Haunt, the same tab keeps haunting every page of the same site until the tab leaves the site.

Following a site means the background must inject `content.js` into pages the user never clicked the toolbar for, so `activeTab` is not enough. The extension asks for access to that one site through the optional host permissions it already declares (`http://*/*` and `https://*/*`). The manifest does not change.

The whole-site haunt is an explicit, separate choice (F26, owner decision, jury run 154). The idle popup has two actions. **Haunt this page** is the primary button and the safe default: it never asks for a permission and gives the one-page haunt, exactly as before F25. **Haunt this whole site** is a second, ordinary button that asks once. If the user says no, the result is the one-page haunt.

| Piece | What it does |
| --- | --- |
| Popup | `Haunt this page` sends `HAUNT` and never calls `permissions.request`. `Haunt this whole site` asks for the site's origins inside its click, sends `HAUNT` at once, then `FOLLOW_SITE` if the answer is yes. Shows `Haunting all of SITE`. |
| Background | Stores `site:<tabId>` in `storage.session`, re-injects `content.js` quietly on each new page of the site, and ends the site haunt and gives the permission back when the tab leaves. |
| Content script | A quiet haunt skips the three-second haunt moment and arrives settled. |

Steering references: `non-destructive-dom.md` (the page is untouched, un-haunt restores it), `product.md` (permissions model: no `host_permissions` at install, optional hosts only on the user's say-so), `tech.md` (MV3 service worker, `storage.session`), `accessibility-and-motion.md` (the quiet haunt shows less motion, never more), `structure.md` (module placement). Related specs: `scaffold` (popup, router, `TabState`), `costume-renderer` (the haunt moment), `runtime-vampires` (nonce and MAIN-world hooks), `tombstones` (the optional link-check origins), `sound-effects` (the whoosh stays on the Haunt click).

## Terms

- **Site**: the string `siteOf(url)` returns. It is a hostname, not an origin.
- **Site origins**: the match patterns `siteOrigins(site)` returns, the thing asked for and granted.
- **Site entry**: the value stored at `site:<tabId>` in `chrome.storage.session` while a tab follows a site.
- **Haunt entry**: the existing `haunt:<tabId>` value, `true` while the tab is haunted.
- **Link-check origins**: `http://*/*` and `https://*/*` (`LINK_CHECK_ORIGINS`), granted when the user turns on "Check links to other sites".
- **New document**: a navigation or reload after which the old content script no longer answers a `ping`. A hash or `pushState` change keeps the document and the overlay.
- **Quiet haunt**: a haunt that skips the haunt moment and arrives settled.

## EARS Acceptance Criteria

### The site of a URL

1. The function `siteOf(url)` shall return the URL's hostname in lower case with one leading `www.` removed, and `null` for any URL whose protocol is not `http:` or `https:` and for any string that is not a URL.
2. `siteOf` shall remove only one leading `www.`, so `www.www.example.com` gives `www.example.com`, and shall leave a host such as `wwwexample.com` unchanged.
3. The function `onSite(url, site)` shall return true when `siteOf(url)` equals `site` or ends with `"." + site`, and false otherwise. `evilnps.gov` is not on `nps.gov`, and `nps.gov.evil.com` is not on `nps.gov`.
4. When `site` is an IP address or has no dot (`localhost`), `onSite` shall return true only for an exact match, because a suffix of an address or of a dotless name is not a parent domain.
5. The function `siteOrigins(site)` shall return `http://SITE/*`, `https://SITE/*`, `http://*.SITE/*` and `https://*.SITE/*`, and for an IP address or a dotless host only the first two.
6. Every pattern `siteOrigins` returns shall be covered by `optional_host_permissions` (`http://*/*` and `https://*/*`), and the shipping manifest shall still have no `host_permissions`.

### Two actions, and asking in the site click

7. The idle popup shall show **Haunt this page** in the Haunt group box as its one primary button (class `primary`, the default and the safe choice). Clicking it shall never call `chrome.permissions.request` and shall send `HAUNT` only, so the haunt is one page, exactly as before F25. No other button in the popup shall have class `primary`.
8. When the tab's URL has a site (`siteOf(url)` is not `null`, so `http` or `https`), the idle popup shall also show, in the same group box, a second ordinary Win95 button **Haunt this whole site** (class `btn site-haunt`). Under it shall be a hint, linked to the button by `aria-describedby`: `Follows every link on SITE. Chrome asks once.` where SITE is `siteOf(url)`, in lower case.
9. When the user clicks **Haunt this whole site**, the popup shall call `chrome.permissions.request({ origins: siteOrigins(site) })` before any `await` in the click handler, so the call is made inside the user gesture, and shall send `HAUNT` at once without waiting for the permission answer, so the current page haunts with `activeTab`.
10. When the tab's URL has no site (a restricted page, a `file:` page), the popup shall show no **Haunt this whole site** button, and no click shall call `permissions.request`. While either action is in flight, both buttons shall be disabled and the clicked one shall have `aria-busy="true"`, until the `HAUNT` answer and, for the site button, the permission answer have arrived. The popup shall then refresh its screen once.
11. When the request resolves `true` and `HAUNT` did not fail, the popup shall send `FOLLOW_SITE` with the tab id, and shall show the state that answer returns. Every later page of the same site in that tab is then haunted without further clicks, and without the haunt moment (criteria 18 to 26).
12. When the request resolves `false` or rejects, the popup shall send no `FOLLOW_SITE`, and the haunt shall be one page only: a reload or a navigation clears it.
13. When `HAUNT` fails, from either button, the popup shall show the existing haunt error and shall not send `FOLLOW_SITE`. After a granted site request the popup shall also hand the site origins back with `permissions.remove`, ignoring its error. The whoosh (sound effects) plays once on either click.

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
45. Popup tests in `test/popup.test.ts` shall cover: the page button never calls `permissions.request`; the site button requests the origins before any `await`; `HAUNT` sent at once; `FOLLOW_SITE` after `HAUNT` on a `true`; none after `false`, a rejection or a failed haunt; the hint names the site; no site button for a `file:` or restricted tab; one `.primary` button only; both buttons disabled and the clicked one `aria-busy`; and the site line (criteria 7 to 13, 36, 37).
46. E2E tests in `e2e/site-haunt.spec.ts` shall show: the page click never requests the permission; the site click then an internal link gives a haunted next page with no haunt moment; a link to another site gives a clean page; a reload stays haunted; a denied permission gives one page (criteria 7, 11, 12, 19, 20, 22, 26).
47. `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run lint:manifest` and `bun run docker:test` shall pass, with the popup's baselines regenerated in Docker and reviewed (the haunted screen for the site line, the idle screen for the second button).
48. The README, `docs/devpost.md` and `docs/demo-script.md` shall describe both buttons, and the demo shall show the Allow path and the Deny path.
