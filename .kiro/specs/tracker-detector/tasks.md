# Tasks: Tracker Detector (R5)

Implementation checklist for the tracker detector spec. Each task references the requirement numbers it satisfies and names the test that proves it.

Tests live under `test/tracker/` (Bun unit tests) and `e2e/` (Playwright end-to-end tests).

## 1. Ingest Script

- [x] 1.1 Create `scripts/ingest-trackers.ts` with `ingest(rawDir, outDir)` that reads the single TDS file `data/raw/extension-tds.json` (keys `trackers` and `entities`), extracts `owner.displayName` (or `owner.name`), `prevalence`, `categories` (stored as-is, possibly empty), and `fingerprinting` (0–3, or 0 when absent) per domain from the `trackers` object, and writes `src/data/trackers.json` with a `domains` map keyed by domain with `{ company, prevalence, categories, fingerprinting }`.
  - Req: 1, 2
  - Test: `test/tracker/ingest.test.ts` → `"ingest produces domain-keyed JSON with company, prevalence, categories, fingerprinting"`.

- [x] 1.2 Keep only trackers whose prevalence is `>= 0.0001`. Trackers whose `categories` array is empty shall be kept (not skipped). There is no category mapping or filtering.
  - Req: 2, 3
  - Test: `test/tracker/ingest.test.ts` → `"domains below prevalence threshold are excluded"` and `"domains with empty categories are kept"`.

- [x] 1.3 Read the `entities` object from the TDS file and produce an `entities` map in `src/data/trackers.json` keyed by company display name, where each value is the list of domains that entity owns.
  - Req: 3a
  - Test: `test/tracker/ingest.test.ts` → `"entities map is keyed by company name with domain lists"`.

- [x] 1.4 Copy `data/raw/tracker-radar-LICENSE.txt` to `src/data/LICENSE-tracker-radar.txt` and write `src/data/ATTRIBUTION.md` naming DuckDuckGo Tracker Radar, the CC BY-NC-SA 4.0 licence, and the changes made. Refuse to run if the licence file is missing.
  - Req: 4
  - Test: `test/tracker/ingest.test.ts` → `"LICENSE copied and ATTRIBUTION.md written"` and `"missing licence file throws"`.

- [x] 1.5 Output is deterministic: sort domain keys, entity keys, and entity domain lists alphabetically; use `JSON.stringify(output, null, 0)`. Same input → byte-identical output.
  - Req: 6
  - Test: `test/tracker/ingest.test.ts` → `"two runs produce byte-identical output"`.

- [x] 1.6 Run the script to generate `src/data/trackers.json`, `src/data/LICENSE-tracker-radar.txt`, and `src/data/ATTRIBUTION.md`. Commit all three. The build and the extension never need the raw dataset or the network at runtime.
  - Req: 5
  - Test: `test/tracker/ingest.test.ts` → `"committed trackers.json exists and parses"`.

## 2. Types

- [ ] 2.1 Add `TrackerData` (with `domains` and `entities` maps), `CompanyHit`, `ScanResult`, and `BackgroundRequest` types to `src/data/types.ts`. The `tabId` field is optional on all `BackgroundRequest` variants: content scripts omit it; the popup includes it.
  - Req: 2, 3a, 11, 42, 44, 45
  - Test: `test/tracker/types.test.ts` → `"TrackerData with entities and CompanyHit types are exported and importable"`.

## 3. Matcher

- [x] 3.1 Create `src/content/matcher.ts` with `lookupDomain(hostname, data)` that tries the hostname and then each parent domain, returning the first match in `data.domains` or null.
  - Req: 7, 8
  - Test: `test/tracker/matcher.test.ts` → `"exact domain matches"` and `"parent-domain matches via suffix walk"`.

- [x] 3.2 Implement `matchTracker(hostname, data, pageHost)` that returns a `CompanyHit` or null. Skip when the hostname is the page's own host or subdomain (first-party).
  - Req: 7, 9
  - Test: `test/tracker/matcher.test.ts` → `"first-party request (page's own host) returns null"` and `"subdomain of page host returns null"`.

- [x] 3.3 Skip when the request hostname belongs to the same tracker company that owns the page's own host. Look up the page hostname in `data.domains` to find the owning company, then check `data.entities[company]` for all domains owned by that company; any request to a domain in that entity's domain list is first-party.
  - Req: 10
  - Test: `test/tracker/matcher.test.ts` → `"same-company first-party request returns null"`.

- [x] 3.4 The matcher is a pure function with no DOM or Chrome API dependency.
  - Req: 11
  - Test: `test/tracker/matcher.test.ts` → `"matcher imports without DOM or chrome globals"`.

## 4. Scanner

- [x] 4.1 Create `src/content/scanner.ts` with `TrackerScanner` class. Constructor takes `TrackerData`, `pageHost`, and an `onUpdate` callback. `start()` reads `performance.getEntriesByType('resource')` once and registers a `PerformanceObserver` for new `resource` entries.
  - Req: 12
  - Test: `test/tracker/scanner.test.ts` → `"scanner reads existing entries and observes future ones"`.

- [x] 4.2 The scanner extracts the hostname from each `PerformanceResourceTiming.name`, passes it through `matchTracker`, and skips entries that the matcher rejects (first-party, same-company, unknown).
  - Req: 13, 9, 10
  - Test: `test/tracker/scanner.test.ts` → `"first-party entries are skipped"` and `"same-company entries are skipped"`.

- [x] 4.3 The scanner groups hits by company, accumulating domains (deduplicated), request count (one per matching entry), categories, and fingerprinting (max over matched domains).
  - Req: 14
  - Test: `test/tracker/scanner.test.ts` → `"entries from same company are grouped with correct count and deduplicated domains"`.

- [x] 4.4 The scanner is read-only: it does not modify any `PerformanceResourceTiming` entry, intercept requests, or touch the DOM.
  - Req: 15
  - Test: `test/tracker/scanner.test.ts` → `"scanner does not modify performance entries or page DOM"`.

- [x] 4.5 `stop()` disconnects the `PerformanceObserver`; no observer remains after stop.
  - Req: 16
  - Test: `test/tracker/scanner.test.ts` → `"stop disconnects the PerformanceObserver"`.

## 5. Ghosts: Slot Assignment

- [ ] 5.1 Create `src/content/costume/ghosts.ts` with `updateGhosts(lanes, companies, doc)` that builds `.lane.left` and `.lane.right` containers inside `#lanes`, each populated with ghost slots at 72px pitch.
  - Req: 17, 18
  - Test: `test/tracker/ghosts.test.ts` → `"lanes created inside #lanes with 72px pitch"`.

- [x] 5.2 A lane is hidden when its gutter is narrower than 64px; no ghost is rendered on that side.
  - Req: 18
  - Test: `test/tracker/ghosts.test.ts` → `"lane hidden when gutter < 64px"`.

- [ ] 5.3 Each slot is checked with an `IntersectionObserver` against page text rects; slots intersecting text are skipped.
  - Req: 19
  - Test: `test/tracker/ghosts.test.ts` → `"slots intersecting text rects are skipped"`.

- [x] 4.4 When there are more companies than available slots, the last slot becomes a `+N` stack token showing the overflow count.
  - Req: 20
  - Test: `test/tracker/ghosts.test.ts` → `"overflow renders +N stack token"`.

- [x] 5.5 When no lane exists (both gutters < 64px), no ghost sprites are rendered; ghosts live only in the HUD count and the popup list.
  - Req: 21
  - Test: `test/tracker/ghosts.test.ts` → `"narrow page: no ghost sprites rendered"`.

## 6. Ghosts: Sprite and Label

- [x] 6.1 Each ghost sprite is 48×48, body `#ffffff` with `#ccffff` shade and `#000033` eyes, drawn as an SVG with `shape-rendering: crispEdges`.
  - Req: 22
  - Test: `test/tracker/ghosts.test.ts` → `"ghost sprite is 48×48 with correct palette colours"`.

- [x] 6.2 The hem is tinted per company: `hash(company) mod 6` over `HEM_TINTS`.
  - Req: 22
  - Test: `test/tracker/ghosts.test.ts` → `"hem tint is deterministic per company from HEM_TINTS"`.

- [ ] 6.3 Each ghost has `filter: drop-shadow(0 0 6px #6633cc) drop-shadow(0 0 2px #ccffff)`.
  - Req: 23
  - Test: `test/tracker/ghosts.test.ts` → `"ghost glow filter matches DESIGN.md"`.

- [ ] 6.4 Each ghost has a label below the sprite: Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis, showing the company display name.
  - Req: 24
  - Test: `test/tracker/ghosts.test.ts` → `"label shows company name, Comic Sans 11px, max 12ch ellipsis"`.

## 7. Ghosts: Haunt-Moment Rise-In

- [ ] 7.1 Modify `src/content/costume/haunt-moment.ts` `playHaunt()` to add a ghost rise-in phase at 1400ms: each `.ghost` animates `translateY(16px → 0)` and `opacity: 0 → 1` over 300ms, staggered 60ms per ghost (first 8; rest arrive with the 8th), easing `cubic-bezier(.2,.8,.2,1)`.
  - Req: 25
  - Test: `test/tracker/haunt-moment.test.ts` → `"ghosts rise 16px and fade in at 1400ms, staggered 60ms"`.

- [x] 7.2 Under reduced motion, ghosts appear at full opacity at 300ms (with the cross-fade), no rise animation.
  - Req: 63
  - Test: `test/tracker/reduced-motion.test.ts` → `"reduced motion: ghosts appear instantly, no rise"`.

## 8. Ghosts: Drift

- [ ] 8.1 After the haunt moment, each ghost drifts with a bob of ±4px vertical over 4000ms and a sway of ±6px horizontal over 7000ms, with a phase offset of `slotIndex × 700ms`.
  - Req: 26
  - Test: `test/tracker/ghosts.test.ts` → `"drift: bob ±4px/4000ms, sway ±6px/7000ms, phase offset = slotIndex × 700ms"`.

- [ ] 8.2 A ghost never leaves its 64px lane slot (peak speed ~6px/s).
  - Req: 26
  - Test: `test/tracker/ghosts.test.ts` → `"drift amplitude stays within 64px lane"`.

- [x] 8.3 Under reduced motion, ghosts sit still at their slot centres with no bob, sway, or rise.
  - Req: 27, 62
  - Test: `test/tracker/reduced-motion.test.ts` → `"reduced motion: no drift animations on ghosts"`.

## 9. Ghosts: Exorcised State

- [x] 9.1 After Exorcise, the ghost sprite fades to 40% opacity and shows an `EXORCISED` stamp.
  - Req: 32
  - Test: `test/tracker/ghosts.test.ts` → `"exorcised ghost has opacity 0.4 and EXORCISED stamp"`.

## 10. Ghost Card

- [ ] 10.1 Create `src/content/costume/card.ts` with `openCard(croot, hit, ghostEl)` that builds a card inside `#cards`: 248px wide, `#000033` ground, 2px bevel `#ccccff`/`#333366`, `4px 4px 0 #000000` shadow.
  - Req: 28
  - Test: `test/tracker/card.test.ts` → `"card frame matches DESIGN.md card style"`.

- [x] 10.2 Title bar: 22px, `#330066`, Times New Roman bold 14px `#ffffcc`, company name + 16×16 `[x]` close button.
  - Req: 29
  - Test: `test/tracker/card.test.ts` → `"card title bar has company name and close button"`.

- [x] 10.3 Body: category, `Haunts these domains:` + Times New Roman 13px domain list, `Seen <N> times on this page`, `[Exorcise]` default Win95 button, footnote `Blocked until you close the browser.`
  - Req: 30, 31
  - Test: `test/tracker/card.test.ts` → `"card body has category, domains, request count, Exorcise button, footnote"`.

- [x] 10.4 After Exorcise, the button becomes `[Let it back]`; the ghost fades to 40% with the stamp.
  - Req: 32
  - Test: `test/tracker/card.test.ts` → `"Exorcise changes button to Let it back and stamps ghost"`.

- [x] 10.5 Esc closes the card and returns focus to the opener; only one card open at a time; card clamped between top bands and HUD.
  - Req: 33
  - Test: `test/tracker/card.test.ts` → `"Esc closes card and returns focus"` and `"only one card open at a time"`.

- [x] 10.6 The `[Exorcise]` button sends `chrome.runtime.sendMessage({ type: "EXORCISE", company, domains })`. The `[Let it back]` button sends `{ type: "LET_BACK", company }`. The content script does not include a `tabId` field — the background uses `sender.tab.id`.
  - Req: 45, 46
  - Test: `test/tracker/card.test.ts` → `"Exorcise sends EXORCISE message without tabId"` and `"Let it back sends LET_BACK message without tabId"`.

## 11. HUD Updates

- [x] 11.1 Modify `renderCostume()` to call `setCounts(hud, { ghosts: companies.length, vampires: 0, tombstones: 0, curses: 0 })` and `setOdometer(hud, totalRequests)` when the scanner emits.
  - Req: 34, 35
  - Test: `test/tracker/hud.test.ts` → `"HUD ghost count reflects number of companies"` and `"odometer reflects total tracker requests"`.

- [x] 11.2 When no trackers are found, the HUD shows the empty state `No ghosts here. Suspiciously clean.` (via existing `setCounts`).
  - Req: 36
  - Test: `test/tracker/hud.test.ts` → `"no trackers: HUD shows empty state"`.

- [ ] 11.3 The HUD counts and odometer update when the scanner finds new tracker requests after the haunt moment.
  - Req: 37
  - Test: `test/tracker/hud.test.ts` → `"HUD updates when scanner finds new requests"`.

## 12. Popup Ghost List

- [x] 12.1 Modify `src/popup/screens.ts` haunted screen: replace the static "No ghosts here" list with a ghost list sorted by request count (descending), then company name (ascending).
  - Req: 38
  - Test: `test/tracker/popup.test.ts` → `"ghost list sorted by request count desc, then company name asc"`.

- [ ] 12.2 Each ghost row: 32px icon tile (ghost sprite, tinted per company), company name (15px ink), `<N> domains · <category>` (13px muted), `[Exorcise]` secondary button.
  - Req: 39
  - Test: `test/tracker/popup.test.ts` → `"ghost row has icon, name, domain count, category, Exorcise button"`.

- [ ] 12.3 When a company is exorcised, its row shows an `(Exorcised)` tinted pill and row text at 60% opacity; the button becomes `[Let it back]`.
  - Req: 40
  - Test: `test/tracker/popup.test.ts` → `"exorcised row shows pill and 60% opacity"`.

- [x] 12.4 When no trackers are found, the list shows `No ghosts here. Suspiciously clean.` and `Trackers that load later will appear here.`
  - Req: 41
  - Test: `test/tracker/popup.test.ts` → `"empty list shows both messages"`.

- [x] 12.5 The popup receives tracker data from the content script (via `TRACKER_UPDATE` message to background, stored in `chrome.storage.session` under a per-tab key), reflecting the current page's trackers only. The popup reads this on mount and on `chrome.storage.onChanged`.
  - Req: 42
  - Test: `test/tracker/popup.test.ts` → `"popup receives tracker list from storage session"`.

- [x] 12.6 The `[Exorcise]` / `[Let it back]` button in the popup sends `chrome.runtime.sendMessage({ type: "EXORCISE", tabId, company, domains })` / `{ type: "LET_BACK", tabId, company }`. The popup includes `tabId` (obtained via `chrome.tabs.query({ active: true, currentWindow: true })`) because it is not a content script.
  - Req: 44
  - Test: `test/tracker/popup.test.ts` → `"popup Exorcise button sends EXORCISE message with tabId"`.

## 13. Exorcise: Background

- [x] 13.1 Create `src/background/exorcise.ts` with the `Exorcist` class: `exorcise(tabId, company, domains)` adds a DNR session rule `{ priority: 1, action: { type: "block" }, condition: { requestDomains: domains, tabIds: [tabId] } }`.
  - Req: 43, 48
  - Test: `test/tracker/exorcise.test.ts` → `"exorcise adds block rule with correct tabIds and requestDomains"`.

- [x] 13.2 The `Exorcist` manages rule IDs with a simple incrementing integer counter (`nextRuleId++`). There is no LRU pool and no maximum rule cap. One session rule per tab+company, keyed by `"tabId:company"`. Re-exorcising the same company on the same tab replaces the existing rule.
  - Req: 48
  - Test: `test/tracker/exorcise.test.ts` → `"rule IDs are incrementing integers"` and `"re-exorcise replaces existing rule"`.

- [x] 13.3 `letBack(tabId, company)` removes the matching session rule. Only `tabId` and `company` are needed — no domains required.
  - Req: 46
  - Test: `test/tracker/exorcise.test.ts` → `"letBack removes the rule by tab+company"`.

- [x] 13.4 `clearTab(tabId)` removes all session rules whose `tabIds` contains that tab.
  - Req: 49, 50
  - Test: `test/tracker/exorcise.test.ts` → `"clearTab removes all rules for a tab"`.

- [x] 13.5 `exorcise` returns `false` (never throws) on failure; `letBack` and `clearTab` swallow errors.
  - Req: 43
  - Test: `test/tracker/exorcise.test.ts` → `"exorcise returns false on API error, does not throw"`.

## 14. Exorcise: Background Router

- [x] 14.1 Modify `src/background/router.ts` to route `EXORCISE`, `LET_BACK`, and `CLEAR_EXORCISE` messages to the `Exorcist` singleton. For messages from the content script, the background obtains the tab ID from `sender.tab.id` (the content script does not include a `tabId` field). For messages from the popup, the `tabId` comes from the message body.
  - Req: 45, 46, 49
  - Test: `test/tracker/router.test.ts` → `"router routes EXORCISE to exorcist.exorcise using sender.tab.id"` and `"router routes LET_BACK to exorcist.letBack"` and `"router routes CLEAR_EXORCISE to exorcist.clearTab"`.

- [x] 14.2 When the background receives an `EXORCISE` or `LET_BACK` message, it accepts only domains that are present in `trackers.json` for the named company. Any domain not found in the tracker data for that company is silently ignored. This prevents a compromised or buggy content script from blocking arbitrary domains.
  - Req: 47a
  - Test: `test/tracker/router.test.ts` → `"router filters domains not in trackers.json for the named company"`.

- [x] 14.3 Add `chrome.tabs.onRemoved` listener that calls `exorcist.clearTab(tabId)` on tab close.
  - Req: 50
  - Test: `test/tracker/router.test.ts` → `"tabs.onRemoved calls clearTab"`.

- [x] 14.4 Add `TRACKER_UPDATE` message handling: store `companies` and `total` in `chrome.storage.session` under a per-tab key (using `sender.tab.id`) so the popup can read them.
  - Req: 42
  - Test: `test/tracker/router.test.ts` → `"TRACKER_UPDATE stores companies in storage.session under per-tab key"`.

## 15. Exorcise: Content Script Integration

- [x] 15.1 The content script does not obtain or include its `tabId` in Exorcise/let-back/clear/tracker-update messages. The background resolves the tab ID from `sender.tab.id`. The content script sends `{ type: "EXORCISE", company, domains }`, `{ type: "LET_BACK", company }`, `{ type: "CLEAR_EXORCISE" }`, and `{ type: "TRACKER_UPDATE", companies, total }`.
  - Req: 45
  - Test: `test/tracker/integration.test.ts` → `"content script sends messages without tabId field"`.

- [x] 15.2 On un-haunt, the content script sends `CLEAR_EXORCISE` before the un-haunt animation.
  - Req: 49
  - Test: `test/tracker/integration.test.ts` → `"unhaunt sends CLEAR_EXORCISE before animation"`.

- [x] 15.3 The content script sends `TRACKER_UPDATE` to the background when the scanner emits, so the popup can read the list.
  - Req: 42
  - Test: `test/tracker/integration.test.ts` → `"scanner update sends TRACKER_UPDATE to background"`.

## 16. Render Integration

- [x] 16.1 Modify `src/content/costume/render.ts` to import `trackers.json`, create a `TrackerScanner`, start it after the costume layers are built, and wire `onUpdate` to `setCounts`, `setOdometer`, `updateGhosts`, and `TRACKER_UPDATE`.
  - Req: 12, 34, 35, 42
  - Test: `test/tracker/integration.test.ts` → `"renderCostume starts scanner and wires updates to HUD and ghosts"`.

- [x] 16.2 Register `scanner.stop()` and `CLEAR_EXORCISE` on `onUnhaunt`.
  - Req: 16, 49
  - Test: `test/tracker/integration.test.ts` → `"onUnhaunt stops scanner and sends CLEAR_EXORCISE"`.

## 17. Non-Destructive DOM

- [x] 17.1 The tracker detector never modifies any page DOM node outside the shadow host.
  - Req: 52
  - Test: `test/tracker/non-destructive.test.ts` → `"no page DOM nodes modified outside shadow host"`.

- [x] 17.2 `PerformanceObserver` and `IntersectionObserver` are read-only (no page mutation).
  - Req: 53
  - Test: `test/tracker/non-destructive.test.ts` → `"observers do not mutate page DOM"`.

- [x] 17.3 Page scripts never edited, blocked, or reordered.
  - Req: 54
  - Test: `test/tracker/non-destructive.test.ts` → `"no script tags modified or reordered"`.

- [x] 17.4 Never change form behaviour.
  - Req: 55
  - Test: `test/tracker/non-destructive.test.ts` → `"form elements and handlers unchanged"`.

- [x] 17.5 After un-haunt, `document.documentElement.outerHTML` is byte-identical to pre-haunt.
  - Req: 56
  - Test: `test/tracker/non-destructive.test.ts` → `"outerHTML byte-identical after unhaunt"`.

## 18. Accessibility

- [x] 18.1 All ghost sprites are keyboard reachable (`tabindex="0"` or wrapped in a `<button>`) with visible focus indicators (costume focus ring from R4).
  - Req: 57
  - Test: `test/tracker/accessibility.test.ts` → `"ghost sprites are focusable and have focus ring"`.

- [x] 18.2 The ghost card's `[Exorcise]`, `[Let it back]`, and `[x]` close buttons are keyboard reachable; Esc closes the card.
  - Req: 58
  - Test: `test/tracker/accessibility.test.ts` → `"card buttons are keyboard reachable"` and `"Esc closes card"`.

- [ ] 18.3 Popup ghost rows and `[Exorcise]` buttons are keyboard reachable with the popup focus ring.
  - Req: 59
  - Test: `test/tracker/accessibility.test.ts` → `"popup ghost rows are keyboard reachable with #6633cc focus ring"`.

- [x] 18.4 HUD and overlay text meets 4.5:1 contrast.
  - Req: 60
  - Test: `test/tracker/accessibility.test.ts` → `"ghost label #ffffcc on #000033 ≥ 4.5:1"`.

- [ ] 18.5 No flashing/strobing faster than 3 Hz in any tracker-detector visual element.
  - Req: 61
  - Test: `test/tracker/accessibility.test.ts` → `"no animation period under 333ms"`.

## 19. E2E Tests

- [x] 19.1 Create `e2e/tracker.spec.ts` with a fixture page (`fixtures/trackers.html`) that loads resources from real tracker domains (e.g. `doubleclick.net`, `google-analytics.com`). The test uses the real shipped `src/data/trackers.json` — no test-only patch. Chromium is launched with `--host-resolver-rules` mapping those real tracker domains to `127.0.0.1` so requests hit the local fixture server.
  - Req: 64
  - Test: `e2e/tracker.spec.ts` → `"fixture loads tracker resources via host-resolver-rules"`.

- [x] 19.2 Haunt the fixture → assert ghost sprites appear inside `#lanes` in the shadow root.
  - Req: 17
  - Test: `e2e/tracker.spec.ts` → `"ghosts appear in lanes after haunt"`.

- [x] 19.3 Assert the HUD shows the correct ghost count and odometer value.
  - Req: 34, 35
  - Test: `e2e/tracker.spec.ts` → `"HUD shows correct ghost count and odometer"`.

- [x] 19.4 Open popup → assert ghost rows sorted by request count.
  - Req: 38
  - Test: `e2e/tracker.spec.ts` → `"popup lists ghosts sorted by request count"`.

- [x] 19.5 Click Exorcise → assert the tracker resource request is refused with `net::ERR_BLOCKED_BY_CLIENT` (listen for `requestfailed` event and check `errorText`).
  - Req: 47, 64
  - Test: `e2e/tracker.spec.ts` → `"exorcised tracker request fails with net::ERR_BLOCKED_BY_CLIENT"`.

- [x] 19.6 Click "Let it back" → assert the tracker request succeeds again (listen for `requestfinished` event).
  - Req: 65
  - Test: `e2e/tracker.spec.ts` → `"let it back: tracker request succeeds"`.

- [x] 19.7 Un-haunt → assert all DNR session rules for that tab are removed.
  - Req: 49
  - Test: `e2e/tracker.spec.ts` → `"unhaunt clears all session rules for tab"`.

- [x] 19.8 Un-haunt → `document.documentElement.outerHTML` byte-identical to pre-haunt.
  - Req: 56
  - Test: `e2e/tracker.spec.ts` → `"unhaunt: outerHTML byte-identical"`.

- [x] 19.9 Tab close → assert all DNR session rules for that tab are removed.
  - Req: 50
  - Test: `e2e/tracker.spec.ts` → `"tab close clears session rules for tab"`.
