# Tasks: Dark Patterns (R8)

Implementation checklist for the dark patterns spec. Each task names the requirement numbers it satisfies (`requirements.md`) and the test that proves it. Tests live under `test/dark-patterns/` (Bun unit tests, `happy-dom`) and `e2e/` (Playwright).

Do the tasks in order: each group builds on the one before. Run `bun run typecheck` and `bun run test` after every group.

## 1. Types and keys

- [x] 1.1 In `src/data/types.ts`, add `DARK_PATTERN_KINDS` (`scarcity`, `countdown`, `timer`, `confirmshaming`, `prechecked`), `DarkPatternKind` and `Curse { kind; snippet }`.
  - Req: 1, 35
  - Test: `test/dark-patterns/router.test.ts` → `"DARK_PATTERN_KINDS lists the five kinds"`.

- [x] 1.2 Add `{ type: "CURSE_UPDATE"; curses: Curse[] }` to `ContentRequest`.
  - Req: 35
  - Test: `test/dark-patterns/router.test.ts` → `"ContentRequest has a CURSE_UPDATE variant"` (a type-level check that compiles).

- [x] 1.3 Add `cursesKey = (tabId: number) => \`curses:${tabId}\`` next to `tombstonesKey`.
  - Req: 37
  - Test: `test/dark-patterns/router.test.ts` → `"cursesKey is curses:<tabId>"`.

- [x] 1.4 Add `curses: Curse[]` to `TabState`. Update every `TabState` literal so `bun run typecheck` passes: `src/popup/app.ts` (`NO_TAB`), `test/background.test.ts`, `test/popup.test.ts`, `test/costume.test.ts`, `test/tombstones/router.test.ts`, `test/tombstones/popup.test.ts`, `test/vampire/popup.test.ts`, `test/vampire/spec-gaps.test.ts` (find them with `grep -rn "tombstones: \[\]"`).
  - Req: 39, 58
  - Test: `bun run typecheck`; `test/dark-patterns/router.test.ts` → `"TabState has a curses field"`.

## 2. Detector module (`src/content/dark-patterns.ts`)

- [x] 2.1 Create the module with `DarkPattern`, `detectDarkPatterns(root, costumeHost)`, and the shared helpers `blockOf`, `flowOf`, `locate`, `inSkipped`, `snippet`, `snippetOf`, `collapse`, `PRECEDENCE`. No Chrome API import.
  - Req: 1, 2
  - Test: `test/dark-patterns/detect.test.ts` → `"module imports with no chrome global"`, `"returns [] for a page with no patterns"`.

- [x] 2.2 Implement the skip rules: prune `script`, `style`, `noscript`, `template`, `head`, the costume host (by tag name), `hidden`, `aria-hidden="true"`, `input[type=hidden]` and computed `display: none` (a `TreeWalker` filter returning `FILTER_REJECT`); ignore text under computed `visibility: hidden|collapse`; `inSkipped` for the two `querySelectorAll` passes.
  - Req: 6
  - Test: `test/dark-patterns/detect.test.ts` → `"skips the costume host"`, `"skips script, style, noscript, template and head text"`, `"skips hidden, aria-hidden and display:none subtrees"`, `"skips text under visibility:hidden but keeps a visible child"`, `"skips a checked newsletter box inside a skipped node"`.

- [x] 2.3 Implement flows: group text nodes by `blockOf`, join their data (a `<br>` between nodes adds a space), keep per-node offsets. Implement `locate` returning the lowest common ancestor of the first and last text node of the match, never above the block.
  - Req: 10, 11, 12, 13
  - Test: `test/dark-patterns/detect.test.ts` → `"Only <b>2</b> left matches on the <p>"`, `"matches when em and strong split the words"`, `"reports the b when the whole phrase is inside it"`, `"reports the p for nested spans"`, `"a phrase split across two p elements does not match"`, `"a br between words counts as a space"`, `"one match per kind per block"`.

- [x] 2.4 Implement `scarcity` (three patterns).
  - Req: 7, 9, 14
  - Test: `test/dark-patterns/detect.test.ts` → `"scarcity: Only 2 left, just 3 items remaining, 12 people are viewing, Low stock"`, `"scarcity ignores case and extra whitespace"`, `"scarcity: Only the best coffee, Just 2 minutes from the station and Left-handed mugs do not match"`.

- [x] 2.5 Implement `countdown` (four patterns).
  - Req: 8, 9, 14
  - Test: `test/dark-patterns/detect.test.ts` → `"countdown: Offer ends in 3 hours, Ends in 15 min, Limited-time offer, 2 hours left"`, `"countdown: Our road ends in a cul-de-sac and Open daily 09:00 to 17:30 do not match"`.

- [x] 2.6 Implement `confirmshaming` over `a`, `button`, `[role=button]`, `input[type=button|submit]` (value), text ≤ 80 characters, built from `LEAD`, `THANKS`, `SEP`, `I` and `SHAME`.
  - Req: 15, 16
  - Test: `test/dark-patterns/detect.test.ts` → `"confirmshaming: No thanks, I hate saving money"`, `"confirmshaming: No, I prefer paying full price"`, `"confirmshaming: Maybe later, I don't like deals"`, `"confirmshaming: No thanks, I'll pay full price"`, `"confirmshaming on an input[type=submit] value"`, `"plain declines do not match: No thanks, No, thanks, Not now, Maybe later, Skip, Close, No thanks, I'm good"`, `"a long paragraph starting with No is not a decline control"`.

- [x] 2.7 Implement `prechecked`: `input[type=checkbox]` with the `checked` attribute; label from the wrapping `label`, else `label[for]` found by comparing `htmlFor` (no selector built from the id), else `aria-label`; match `OPT_IN_WORDS`; report the label element, else the input.
  - Req: 17, 18, 19, 20
  - Test: `test/dark-patterns/detect.test.ts` → `"prechecked: wrapping label with newsletter"`, `"prechecked: label for= with partners"`, `"prechecked: aria-label with subscribe"`, `"prechecked reports the label element"`, `"prechecked reads the attribute, not the property"`, `"no match: Remember my cart (checked), Email me when it is back (unchecked), checked box with no label text"`.

- [x] 2.8 Implement the snippet rule (`collapse`, `snippet`, `snippetOf`), one pattern per element by `PRECEDENCE`, document order and the 30 cap.
  - Req: 3, 4, 5
  - Test: `test/dark-patterns/detect.test.ts` → `"snippet is the collapsed element text"`, `"snippet is at most 60 characters and ends in … when cut"`, `"a cut scarcity snippet starts at the match"`, `"a cut confirmshaming snippet starts at the text start"`, `"scarcity wins over countdown on the same element"`, `"prechecked wins over scarcity on the same label"`, `"returns at most 30 patterns in document order"`.

- [x] 2.9 Implement `mergeCurses(statics, timers)`: a timer replaces a countdown on the same element or on an ancestor or descendant element; one per element by `PRECEDENCE`; document order; cap 30.
  - Req: 4, 5, 26
  - Test: `test/dark-patterns/merge.test.ts` → `"timer replaces a countdown on the same element"`, `"timer replaces a countdown on an ancestor"`, `"timer replaces a countdown on a descendant"`, `"a timer does not replace a scarcity on the same element"`, `"result is in document order"`, `"result is capped at 30"`.

- [x] 2.10 Add `KIND_INFO` (`name`, `title`, `trick` per kind).
  - Req: 49, 50, 54
  - Test: `test/dark-patterns/card.test.ts` → `"KIND_INFO titles match DESIGN.md plus Ticking timer"`, `"every trick is one sentence"`.

- [x] 2.11 Prove the detector is read-only.
  - Req: 2, 27
  - Test: `test/dark-patterns/detect.test.ts` → `"outerHTML is identical before and after detectDarkPatterns"`, `"calling it twice returns equal results"`, `"a checked box is still checked, attribute and property"`.

## 3. Timer watcher (`src/content/timers.ts`)

- [x] 3.1 Implement `createTickTracker({ changes = 3, windowMs = 10_000 })` with `note(block, clock, now)`.
  - Req: 22
  - Test: `test/dark-patterns/timers.test.ts` → `"first value is not a tick"`, `"the same value repeated is not a tick"`, `"two changes are not enough"`, `"the third change reports once"`, `"it does not report twice"`, `"changes older than 10 s do not count"`.

- [x] 3.2 Implement `watchTimers(doc, costumeHost, onTimer, opts)`: one `MutationObserver` on `doc.body` with `{ subtree: true, childList: true, characterData: true }`, at most 200 records per callback, target blocks collected in a `Set`, `locate(flow, CLOCK)`, element chosen when the tracker fires, a `stop()` that disconnects.
  - Req: 21, 23, 24, 25
  - Test: `test/dark-patterns/timers.test.ts` → `"a ticking clock is reported once with kind timer"`, `"a static clock (17:30 repeated) is never reported"`, `"a split clock reports the element holding both spans"`, `"a page that replaces the clock element each tick is still reported"`, `"mutations inside the costume host are ignored"`, `"at most 200 records are processed per callback"`, `"observe is called with subtree, childList and characterData only"`, `"stop disconnects"`.

- [x] 3.3 Prove the watcher is read-only.
  - Req: 24, 27
  - Test: `test/dark-patterns/timers.test.ts` → `"outerHTML is unchanged by a watcher run"`.

## 4. Background

- [x] 4.1 In `src/background/router.ts`, add `"CURSE_UPDATE"` to `TYPES`, add it to the `tabOf` list that takes `sender.tab.id`, and add the `isCurse` guard.
  - Req: 35
  - Test: `test/dark-patterns/router.test.ts` → `"CURSE_UPDATE takes the tab from sender.tab.id, not from the body"`.

- [x] 4.2 Handle `CURSE_UPDATE`: drop it unless `haunt:<tabId>` is set; filter with `isCurse`, keep the first 30, cut each snippet to 60 characters, store under `cursesKey(tabId)`.
  - Req: 36, 37
  - Test: `test/dark-patterns/router.test.ts` → `"CURSE_UPDATE from a haunted tab is stored under curses:<tabId>"`, `"CURSE_UPDATE from a tab that is not haunted is dropped"`, `"entries with an unknown kind or a non-string snippet are dropped"`, `"snippets are cut to 60 characters and the list to 30"`, `"a non-array curses field is ignored"`.

- [x] 4.3 Return `curses` from `getState` (`[]` when none), add `curses: []` to the error answer in `register`, and remove `cursesKey` in `clearTab`.
  - Req: 38, 39
  - Test: `test/dark-patterns/router.test.ts` → `"getState returns the stored curses"`, `"getState returns [] when nothing is stored"`, `"every answer includes curses, including the error answer"`, `"UNHAUNT removes curses:<tabId>"`, `"tab close removes curses:<tabId>"`, `"navigation removes curses:<tabId>"`.

## 5. Badge art and CSS

- [x] 5.1 In `src/content/costume/art.ts`, add the 6×6 `BADGE_SKULL`, `BADGE_SKULL_LEGEND` (white and ink, web-safe) and `curseBadgeSvg()` (12×12 at 2px, `crispEdges`).
  - Req: 40
  - Test: `test/dark-patterns/markers.test.ts` → `"BADGE_SKULL is 6x6 with web-safe colours"`, `"curseBadgeSvg is 12x12 with pixelated crisp edges"`.

- [x] 5.2 In `src/content/costume/styles.ts`, add `.curse-badge`, `.curse-badge svg`, `.curse-badge:focus-visible` and `.curse-card .quote` from `design.md`, using the palette tokens (`P.curse`, `P.ink`, `P.star`).
  - Req: 40, 45, 59
  - Test: `test/dark-patterns/markers.test.ts` → `"CSS: 18px badge, #ff9900 ground, black 1px border, 2px hard shadow, bold 11px Comic Sans"`, `"CSS: focus ring is the costume ring"`, `"badge text contrast is at least 4.5:1"`.

## 6. Badges (`src/content/costume/curses.ts`)

- [x] 6.1 Export `textNear` from `src/content/costume/tombstones.ts` (no behaviour change).
  - Req: 41
  - Test: `bun run test` (the tombstone tests still pass).

- [x] 6.2 Implement `lineRects(el)` (a `Range` over the contents, zero-size rects dropped) and the first/last line helpers.
  - Req: 42
  - Test: `test/dark-patterns/markers.test.ts` → `"lineRects uses range rects, not the block box"` (stubbed `getClientRects`), `"empty list when the element is not rendered"`.

- [x] 6.3 Implement `curseSpot(first, last, w, viewportWidth, text, slots)`: (a) right of the last line box, (b) above the first line box, (c) gutter lane slot, else `null`.
  - Req: 41, 42
  - Test: `test/dark-patterns/markers.test.ts` → `"spot a: 4px right of the last line box, centred"`, `"spot b when a would leave the viewport"`, `"spot b when a would cross text"`, `"spot c: the lane slot at the same y, nearest edge"`, `"null when no spot fits"`, `"a spot never intersects a text rect"`, `"spots are whole pixels"`.

- [x] 6.4 Implement `mountCurses(markers, opts)`: one `<button class="curse-badge" data-kind>` per pattern with the skull and `CURSED!`, `aria-label` `<title>: <snippet>`, `IntersectionObserver` on the page element, scroll (capture, passive) and resize listeners with one `requestAnimationFrame` pass, measure width before placing, fade-in for late badges, `stop()`.
  - Req: 40, 43, 44, 45, 46, 47
  - Test: `test/dark-patterns/markers.test.ts` → `"one button per pattern in #markers with CURSED! and an aria-label"`, `"update removes badges whose pattern left the list and keeps the others"`, `"a badge for an element that is off screen is display:none"`, `"the observer only changes the badge, never the page element"`, `"scroll and resize cause one rAF pass"`, `"a badge with no spot is display:none"`, `"a late badge fades in 200ms linear"`, `"no animation when fade() is false"`, `"stop removes badges, disconnects the observer, cancels the frame and removes both listeners"`.

- [x] 6.5 Prove badges never touch the page.
  - Req: 27, 29
  - Test: `test/dark-patterns/markers.test.ts` → `"outerHTML is unchanged after mount, place and stop"`, `"clicking a badge dispatches no event on the page element"`.

## 7. Curse card (`src/content/costume/card.ts`)

- [x] 7.1 Add `openCurseCard(cards, curse, opener, { bounds, reduced })` built on the private `show()`: title from `KIND_INFO`, the snippet in quotation marks and the trick line via `textContent`, `#330066` title bar, `[x]` button, focus on `[x]`, one card at a time.
  - Req: 48, 49, 50, 51, 52
  - Test: `test/dark-patterns/card.test.ts` → `"title is Cursed: Fake scarcity for scarcity"`, `"title is Cursed: Countdown"`, `"title is Cursed: Ticking timer"`, `"title is Cursed: Confirmshaming"`, `"title is Cursed: Pre-checked opt-in"`, `"body quotes the snippet and has one trick line"`, `"a snippet with <img onerror> is text, not markup"`, `"title bar is not the vampire colour"`, `"opening a curse card closes an open ghost card"`.

- [x] 7.2 Verify focus, Esc and placement.
  - Req: 51, 52
  - Test: `test/dark-patterns/card.test.ts` → `"focus moves to the close button"`, `"Esc closes the card and returns focus to the badge"`, `"[x] closes the card"`, `"the card keeps 8px from both viewport edges at 1280 and 375 (stub geometry)"`, `"no animation under reduced motion"`.

- [x] 7.3 Enter and Space on a focused badge open the card (native `<button>` behaviour).
  - Req: 48
  - Test: `test/dark-patterns/markers.test.ts` → `"badge is a focusable button that calls onOpen on click"`.

## 8. Render integration (`src/content/costume/render.ts`)

- [x] 8.1 Factor the `setCounts` call in `refresh()` into `renderCounts()` and pass `curses: curses.length`.
  - Req: 53
  - Test: `test/dark-patterns/wiring.test.ts` → `"HUD curse count equals the number of curses"`, `"the count updates when a curse is added"`, `"ghost updates keep the curse count"`.

- [x] 8.2 Add `known`, `timers`, `curses`, `lastSent`, `commit()` and `rescan()`. A known element keeps its first kind and snippet; a disconnected element is dropped; `CURSE_UPDATE` is sent only when `JSON.stringify(curses)` changes.
  - Req: 32, 33, 34, 35
  - Test: `test/dark-patterns/wiring.test.ts` → `"renderCostume detects once and sends CURSE_UPDATE with the curses"`, `"a re-render of the same patterns sends nothing"`, `"a ticking snippet does not change the curse"`, `"a removed element's curse is dropped"`, `"a new element's curse is added"`.

- [x] 8.3 Mount the badges (`slots`, `fade`, `onOpen` → `openCurseCard`), call `badges.place()` from `relayout`, and extend the `mo` callback with a trailing 500 ms debounced `scheduleRescan` that runs at most once per 2 seconds.
  - Req: 33, 41, 43, 46
  - Test: `test/dark-patterns/wiring.test.ts` → `"a mutation triggers one rescan after 500 ms"`, `"rescans are at least 2 s apart"`, `"relayout re-places the badges"`.

- [x] 8.4 Start `watchTimers` after the layers exist; each timer pattern is added to `timers` and `commit()` runs.
  - Req: 21, 25, 32
  - Test: `test/dark-patterns/wiring.test.ts` → `"a ticking clock becomes a timer curse"`.

- [x] 8.5 Add the `onUnhaunt` cleanup: `stopTimers()`, `badges.stop()`, clear the debounce timer.
  - Req: 25, 47
  - Test: `test/dark-patterns/wiring.test.ts` → `"un-haunt stops the watcher, removes the badges and cancels the debounce"`, `"no CURSE_UPDATE is sent after un-haunt"`.

- [x] 8.6 Prove the integrated costume leaves the page alone.
  - Req: 27, 28, 30, 31
  - Test: `test/dark-patterns/wiring.test.ts` → `"outerHTML is identical after haunt and un-haunt"`, `"a pre-checked box stays checked through haunt, a badge click and un-haunt"`.

## 9. Popup

- [x] 9.1 Add `curseTile(doc)` to `src/popup/sprites.ts` (the existing `curse` sprite).
  - Req: 54
  - Test: `test/dark-patterns/popup.test.ts` → `"curseTile is an svg tile"`.

- [x] 9.2 In `src/popup/screens.ts`, add `curseRow` and the Curses list after the tombstone list; set the Curses tile count; read `state.curses ?? []`; update the list surface `aria-label`.
  - Req: 54, 56, 58
  - Test: `test/dark-patterns/popup.test.ts` → `"Curses tile shows the count"`, `"a row shows the kind name and the quoted snippet"`, `"the list follows the tombstone list"`, `"rows are in the order reported"`, `"a state without curses still renders"`, `"snippet text is set as text"`.

- [x] 9.3 Empty state `No curses. This page plays fair.`
  - Req: 55
  - Test: `test/dark-patterns/popup.test.ts` → `"empty list shows No curses. This page plays fair."`.

- [x] 9.4 In `src/popup/styles.css`, add `.curses-head`, `.no-curses`, `.curse-row` (copied from the tombstone rules) and `.curse-row .row-sub.quote` (wrapping).
  - Req: 54, 57
  - Test: `test/dark-patterns/popup.test.ts` → `"CSS: curse rows use the #6633cc focus ring"`, `"CSS: the quote wraps"`.

- [x] 9.5 Keyboard access.
  - Req: 57
  - Test: `test/dark-patterns/popup.test.ts` → `"curse rows have tabindex 0 and an aria-label of kind name and snippet"`.

## 10. Fixture

- [x] 10.1 Create `fixtures/dark-patterns.html` exactly as specified in `design.md` (the Lantern Moth Coffee shop: six curses, the innocent controls, the hidden decoys, the ticking clock script).
  - Req: 62, 63, 64
  - Test: `test/dark-patterns/fixture.test.ts` → `"detectDarkPatterns on the fixture returns exactly the six curses, in order"`, `"each curse has the expected kind, element id and snippet"`, `"the innocent controls are not curses"`, `"the hidden decoys are not curses"`.

- [x] 10.2 Check the fixture's layout contract.
  - Req: 64
  - Test: `test/dark-patterns/fixture.test.ts` → `"every cursed element has the gap class"`, `"the page loads no external resource"`.

## 11. Property-based test

- [x] 11.1 Write `test/dark-patterns/properties.test.ts` with the local `prng` (mulberry32), `int`, `pick`, `SEED` and `CASES = 300`, and the `forAll` wrapper that reports the seed and the case, copied from `test/tracker/properties.test.ts`. No new dependency. Write the generator (random phrase, random cuts, random inline wrapping, random case and whitespace) and the model's expected smallest element.
  - Req: 66
  - Test: `test/dark-patterns/properties.test.ts` → `"generator output is deterministic for a seed"`.

- [x] 11.2 Properties: found once on the smallest element; snippet ≤ 60 and equal to the collapsed element text from the match; tree unchanged.
  - Req: 10, 12, 66
  - Test: `test/dark-patterns/properties.test.ts` → `"a split scarcity phrase is found once on the smallest element"`, `"a split countdown phrase is found once on the smallest element"`, `"snippets are at most 60 characters"`, `"detection leaves the tree unchanged"`.

- [x] 11.3 Negative properties: cross-block split, look-alikes, and one pattern per element.
  - Req: 4, 11, 14, 66
  - Test: `test/dark-patterns/properties.test.ts` → `"a phrase split across blocks is never found"`, `"look-alike text split at random is never found"`, `"two kinds in one block give one pattern, the higher precedence"`.

## 12. Accessibility and motion

- [x] 12.1 Contrast and strobing.
  - Req: 59, 60
  - Test: `test/dark-patterns/markers.test.ts` → `"badge text meets 4.5:1 against its ground"`; `test/dark-patterns/card.test.ts` → `"card text meets 4.5:1"`, `"no badge or card animation has a period under 333ms"`.

- [x] 12.2 Reduced motion.
  - Req: 46, 61
  - Test: `test/dark-patterns/markers.test.ts` → `"reduced motion: late badges appear with no animation"`; `test/dark-patterns/card.test.ts` → `"reduced motion: the card has no open animation"`.

- [x] 12.3 Keyboard and focus ring.
  - Req: 45, 52, 57
  - Test: `test/dark-patterns/markers.test.ts` → `"badge shows the dotted #ffff66 focus ring with the black halo"`; `test/dark-patterns/popup.test.ts` → `"curse row focus ring is 2px solid #6633cc, offset 2px"`.

## 13. End-to-end tests (`e2e/dark-patterns.spec.ts`)

- [x] 13.1 Scaffold the spec with the helpers from `e2e/fixtures.ts`. For `width` in `[1280, 375]`: load `dark-patterns.html`, take `before` with the clock value normalised (`Cart reserved for \d\d:\d\d` → `Cart reserved for MM:SS`), haunt through the popup, poll up to 10 s for six `.curse-badge` elements in kind order `scarcity, scarcity, countdown, timer, prechecked, confirmshaming`.
  - Req: 62, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"six curses appear on the fake shop at 1280 and 375"`.

- [x] 13.2 Geometry: each badge is 18px tall, shown, labelled `Cursed: …`, sits at spot (a), (b) or (c) of its page element, overlaps no page text, and the page has no horizontal scroll at 375.
  - Req: 41, 42, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"badges sit beside their elements and never over text at 1280 and 375"`.

- [x] 13.3 Cards: click each badge; check title, quoted snippet (timer matches `/^“Cart reserved for \d\d:\d\d”$/`), trick line, focus inside, 8px from both edges (plus the 4px shadow); Esc closes and focus returns to the badge; Enter reopens.
  - Req: 48, 49, 50, 51, 52, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"each badge opens its card with title, quote and trick"`, `"Esc closes the card and focus returns to the badge"`, `"Enter on a focused badge opens the card"`, `"cards keep 8px from both viewport edges at 1280 and 375"`.

- [x] 13.4 Popup and HUD: the Curses tile shows 6; six rows with kind names and quoted snippets; the Curses heading follows `No tombstones. Every link is alive.` in document order; a row shows the `#6633cc` ring on Tab; `GET_STATE.curses` has length 6 and the session key `curses:<tabId>` holds the same; the HUD count is `6`.
  - Req: 53, 54, 56, 57, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"popup lists the six curses after tombstones"`, `"HUD curse count is 6"`, `"the session key holds the curses"`.

- [x] 13.5 Checkbox: `input[name=news]` is checked (property and attribute) after Haunt, after clicking its badge and after Un-haunt; `remember` is still checked and `restock` still unchecked.
  - Req: 28, 29, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"the pre-checked box stays checked"`.

- [x] 13.6 Un-haunt: `hg-crypt` is gone, `GET_STATE.curses` is `[]`, the session key is gone, and `outerHTML` (clock normalised) equals `before`.
  - Req: 30, 38, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"un-haunt leaves the page byte-identical and clears the curses"`.

- [x] 13.7 Clean page: on `clean.html` the popup shows `No curses. This page plays fair.`, the tile shows 0 and the HUD count is 0.
  - Req: 55, 56, 68
  - Test: `e2e/dark-patterns.spec.ts` → `"a clean page shows the empty curse line"`.

- [x] 13.8 Reduced motion: with `reducedMotion: "reduce"`, the badges and an open card have no running animations.
  - Req: 46, 61
  - Test: `e2e/dark-patterns.spec.ts` → `"under reduced motion badges and the card do not animate"`.

## 14. Docs and checks

- [x] 14.1 Update `README.md`: describe dark-pattern curses in "What it does", list `dark-patterns.html` in the fixtures table, and change the "still to come" sentence so it names only neighborhoods and Kiro hooks. Update `test/readme.test.ts` (the test `"does not claim dark patterns, neighborhoods or Kiro hooks work"`) so that the lines about dark patterns and curses are allowed to describe working behaviour, and neighborhoods and hooks still must say "still to come". Add the specs list entry (`dark-patterns`) to the "How Kiro was used" paragraph.
  - Req: 62, 68
  - Test: `test/readme.test.ts` (updated), `bun run test`.

- [x] 14.2 Run `bun run typecheck`, `bun run test`, `bun run test:e2e` and `bun run docker:test`; fix any failure before closing the spec.
  - Req: 65-68
  - Test: all four commands exit 0.

- [x] 14.3 Confirm no new permission or dependency: `test/manifest.test.ts` passes unchanged and `package.json` has no new entry.
  - Req: Overview and `tech.md` (no new permission, no new dependency)
  - Test: `test/manifest.test.ts` passes unchanged; `package.json` has no new entry.
