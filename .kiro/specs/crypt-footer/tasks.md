# Tasks: Crypt Footer (F28)

Implementation checklist for the crypt-footer spec. Each task names the requirement numbers it satisfies (`requirements.md`) and the test that proves it. Unit tests live in `test/costume/footer.test.ts`, `test/costume/secrets.test.ts` and `test/cover.test.ts` (Bun), and the e2e tests in `e2e/` (Playwright).

Do the tasks in order. Tests come first (group 1) and shall fail for the right reason before the code in groups 2 to 4 is written. Run `bun run typecheck` and `bun run test` after every group of code. Only task files under `.kiro/specs/crypt-footer/` are written by the spec itself. Everything else changes files outside `.kiro/`.

## 1. Unit tests first

- [ ] 1.1 Write `test/costume/footer.test.ts` (happy-dom, helpers from `test/costume/helpers.ts`). Run it and see each test fail on its assertion.
  - Req: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 25, 26, 28, 29, 30, 60
  - Test: `"the host is static and the last child of <html>"`, `"the crypt root is fixed and holds the fixed layers"`, `"the footer is a sibling of the crypt root and holds graveyard, HUD, badges, sign-off in order"`, `"no footer part is fixed, sticky or absolute"`, `"the graveyard lists every company in lane mode and in full-overlay mode"`, `"the graveyard has no horizontal scroll and wraps"`, `"the empty graveyard says No graves yet"`, `"four badges, none focusable, none a link"`, `"the sign-off follows the hit counter"`, `"the page sheet has no padding-bottom and no scroll-padding-bottom"`, `"the page sheet keeps the top padding and the lift variable"`, `"the tint and frame end at the footer's top"`, `"Hide keeps the footer's height"`, `"#show-tab is shown without Hide"`, `"#show-tab counts the companies still haunting and ticks on Exorcise"`, `"#show-tab label reads Jump to the graveyard: 1 tracker"`, `"#show-tab click shows a hidden costume, scrolls to the graveyard and focuses it"`, `"card bounds bottom is innerHeight"`, `"no right-lane slot meets #show-tab"`, `"playHaunt finds #hud and #graveyard through the shadow root"`, `"the moment slides only boxes inside the viewport"`, `"un-haunt leaves the page's DOM identical and removes the footer"`.

- [ ] 1.2 Write `test/costume/secrets.test.ts` with fake timers, an injected `now`, and a recorded `outerHTML` of the page. Run it and see it fail.
  - Req: 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 61
  - Test: `"the Konami code starts a 3 s frenzy and the marquee reads !!! FULL HAUNT !!!"`, `"the frenzy ends and restores the marquee line"`, `"a wrong order does nothing"`, `"the frenzy is clamped to 334 ms"`, `"13 clicks on the hit counter show the skeleton for 5 s"`, `"12 clicks do nothing"`, `"a gap over 3 s restarts the count"`, `"the skeleton moves no other box"`, `"boo flees and returns, 2 s later"`, `"BOO in capitals works, Ctrl+b does not"`, `"a second boo is ignored while one runs"`, `"a sprite added later does not flee"`, `"typing in an input fires nothing and clears the buffers"`, `"typing in a textarea and a contenteditable fires nothing"`, `"every secret under reduced motion"`, `"lookOf: 00:00 and 00:59 are witching, 01:00 is not"`, `"lookOf: Oct 31 is halloween, and wins at 00:30"`, `"now() is read once per costume"`, `"the page's DOM is byte for byte the same after each secret and after un-haunt"`, `"no listener and no timer outlives un-haunt"`.

- [ ] 1.3 In `test/cover.test.ts`, add the message pool tests. Run it and see them fail.
  - Req: 31, 32, 33, 34, 35, 36, 37, 62
  - Test: `"the pool has 12 distinct lines, the first is Loading crypt…"`, `"pickLine never returns last, for every last and random at 0, 0.5, 0.999999 and 1"`, `"pickLine accepts null, -1, NaN, 12 and 1.5 as no last"`, `"parseMarker reads -1 and 0 to 11 and nothing else"`, `"the shown line is from the pool and its index is written to the marker"`, `"a second page in the same tab never repeats the line"`, `"a marker with a bad value does not cover by itself"`, `"a storage error still shows a line"`, `"the line is in the role=status element"`.

- [ ] 1.4 Update the existing unit tests that name the fixed strip, so they describe the footer and fail now: `test/costume/body-padding.test.ts` (no bottom padding), `graveyard.test.ts` (never hidden, wraps), `hide-show.test.ts` (tab always shown, focus goes to the graveyard), `render.test.ts`, `stylesheet.test.ts`, `tokens.test.ts` (no `graveyardGap`), `haunt-moment.test.ts`, `unhaunt.test.ts`, and any test that reads `--hg-hud-h`.
  - Req: 15, 16, 19, 20, 28, 60
  - Test: each file's changed tests fail before groups 2 and 3 and pass after. `git diff --stat test/` lists only these files.

## 2. Cover label

- [ ] 2.1 In `src/cover/cover.ts`, add `COVER_LINES`, `pickLine` and `parseMarker`.
  - Req: 31, 33, 36
  - Test: `test/cover.test.ts` → `"the pool has 12 distinct lines…"`, `"pickLine never returns last…"`, `"pickLine accepts null…"`, `"parseMarker reads -1 and 0 to 11 and nothing else"`.

- [ ] 2.2 In `startCover`, add a `random` dep, read the marker with `parseMarker`, pick a line, show it in the `role="status"` element and write its index to the marker in a `try`.
  - Req: 32, 34, 36, 37
  - Test: `test/cover.test.ts` → the five remaining tests of 1.3.

- [ ] 2.3 In the background's `setMarker`, write `"-1"` only when the key is absent.
  - Req: 35
  - Test: `test/site-haunt.test.ts` → `"setMarker writes -1 when the key is absent"`, `"setMarker keeps an existing index"`.

- [ ] 2.4 Change the assertions in `test/site-haunt.test.ts` that expect the marker to equal `"1"` to accept `"-1"` or an index, and keep the criteria they test.
  - Req: 34, 35 (supersedes `site-haunt` 62)
  - Test: `bun run test` passes with no skipped test.

## 3. Footer

- [ ] 3.1 In `src/content/overlay.ts`, make the host `position: static` with `display: block`, and remove `inset`, `pointer-events` and `z-index`.
  - Req: 1
  - Test: `test/costume/footer.test.ts` → `"the host is static and the last child of <html>"`. `test/overlay.test.ts` (if it asserts `fixed`) is updated.

- [ ] 3.2 Create `src/content/costume/footer.ts` (`buildFooter`, `setVisitor`, the badges and the sign-off). In `styles.ts`, give `#crypt-root` the fixed rule and the `z-index`, add `#crypt-footer`, `.badges`, `.badge` and `.signoff`, delete the fixed rules of `#hud` and `#graveyard`, and make `.stones` a wrapping flex row with no `overflow-x`.
  - Req: 2, 3, 4, 5, 9, 11, 12, 14, 56, 57, 58
  - Test: `test/costume/footer.test.ts` → the structure, badges and sign-off tests. `test/costume/tokens.test.ts` → every new colour is web-safe.

- [ ] 3.3 In `graveyard.ts`, remove the hidden state, add `tabindex="-1"`, the title `Graveyard of trackers` and the new empty text. Update the header comment. In `render.ts`, call `updateDocked` with every company in both modes.
  - Req: 6, 7, 8, 10, 27
  - Test: `test/costume/footer.test.ts` → the graveyard tests. `test/costume/graveyard.test.ts` → `"never hidden"`.

- [ ] 3.4 In `hud.ts`, add `buildTab` and `setTabCount`. In `render.ts`, build `#show-tab` once, never hidden, update it from `renderCounts`, and give it the click behaviour (show, scroll, focus). Update the Hide handler so focus goes to the tab.
  - Req: 13, 19, 20, 21, 22, 23, 24
  - Test: `test/costume/footer.test.ts` → the `#show-tab` tests. `test/costume/hide-show.test.ts`.

- [ ] 3.5 In `body-padding.ts`, change `update` to `update(lift)` and remove the bottom padding and scroll padding. In `column-layers.ts`, stop `documentHeight` at the footer's top and lower the pseudo layers one z-index. In `render.ts`, remove `pad()` and `--hg-hud-h`, add a `ResizeObserver` on the footer that calls `relayout`, and remove `LAYOUT.graveyardGap`.
  - Req: 15, 16, 17, 18
  - Test: `test/costume/body-padding.test.ts`, `test/costume/column-layers.test.ts`, `test/costume/footer.test.ts` → `"the tint and frame end at the footer's top"`.

- [ ] 3.6 In `render.ts`, set card, tombstone and curse bounds to `{ top: bands bottom, bottom: win.innerHeight }`, pass the same to `planSlots`, and add `clearOf` in `ghosts.ts` to drop right-lane slots that meet `#show-tab`.
  - Req: 25, 26
  - Test: `test/costume/footer.test.ts` → `"card bounds bottom is innerHeight"`, `"no right-lane slot meets #show-tab"`. `test/costume/card.test.ts` still passes.

- [ ] 3.7 In `haunt-moment.ts`, add `crypt(croot, id)` through `getRootNode()`, use it for `#hud` and `#graveyard`, and keep in `bottomBoxes` only boxes whose top is inside the viewport.
  - Req: 28, 29
  - Test: `test/costume/footer.test.ts` → `"playHaunt finds #hud and #graveyard through the shadow root"`, `"the moment slides only boxes inside the viewport"`. `test/costume/haunt-moment.test.ts`.

- [ ] 3.8 In `design/DESIGN.md`, update the layer table (host and footer, pseudo layers at `2147483645`) to match the code.
  - Req: 2, 17
  - Test: `test/costume/tokens.test.ts` (if it reads `design/DESIGN.md`) and `grep -n 2147483646 design/DESIGN.md` agree with `column-layers.ts`.

- [ ] 3.9 Wire the footer in `render.ts` (`buildFooter`, `setState` for the three classes on both nodes, `setVisitor` in `refresh`) and make Un-haunt remove it with the host.
  - Req: 13, 14, 30
  - Test: `test/costume/footer.test.ts` → `"Hide keeps the footer's height"`, `"un-haunt leaves the page's DOM identical and removes the footer"`. `test/costume/unhaunt.test.ts`.

- [ ] 3.10 Run `bun run typecheck`, `bun run test` and `bun run lint:manifest`. Groups 1.1, 1.3 and 1.4 shall be green.
  - Req: 59, 66
  - Test: all three exit 0.

## 4. Secrets

- [ ] 4.1 Create `src/content/costume/secrets.ts` with the key listener, `isTyping`, the buffers and their 2000ms clear, the Konami frenzy, the skeleton and the `boo` flight. Add the skeleton's four-frame pixel art to `art.ts` and its styles to `styles.ts`.
  - Req: 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 53, 54, 55, 56
  - Test: `test/costume/secrets.test.ts` → every test of 1.2 except the two `lookOf` tests and `"now() is read once per costume"`.

- [ ] 4.2 Add `lookOf`, the `now` option of `renderCostume` and the classes `witching` and `halloween`, with the marquee opening line and the `#ff6600` on `#330066` bands in `styles.ts`. Add `override(text)` to the marquee in `render.ts`.
  - Req: 49, 50, 51, 52, 56
  - Test: `test/costume/secrets.test.ts` → `"lookOf: …"` and `"now() is read once per costume"`. `test/costume/tokens.test.ts` → the pair has 4.5:1.

- [ ] 4.3 Call `startSecrets` from `renderCostume` and put its `stop` in `onUnhaunt`.
  - Req: 38, 55
  - Test: `test/costume/secrets.test.ts` → `"no listener and no timer outlives un-haunt"`, `"the page's DOM is byte for byte the same…"`.

- [ ] 4.4 Run `bun run typecheck` and `bun run test`.
  - Req: 61, 66
  - Test: both exit 0.

## 5. e2e updates

- [ ] 5.1 `e2e/graveyard.spec.ts`: the graveyard is in the footer in lane mode and in full-overlay mode, lists every company, wraps, has no sideways scroll, and a card from it stays in the viewport and returns focus.
  - Req: 6, 7, 8, 25
  - Test: the updated and new tests in that file.

- [ ] 5.2 `e2e/layout-375.spec.ts`: no horizontal scroll with the footer, the HUD keeps two rows at 375, and the footer is below the last page element.
  - Req: 4, 18
  - Test: the updated tests in that file.

- [ ] 5.3 `e2e/photo-page.spec.ts` and `e2e/hero-haunt.spec.ts`: tags in the footer graveyard keep their lines at 375 and 1280, and the page's end is reachable with no padding.
  - Req: 9, 15, 18
  - Test: the updated tests in those files.

- [ ] 5.4 `e2e/costume.spec.ts`, `haunt.spec.ts`, `haunt-parade.spec.ts`, `exorcise-moment.spec.ts`, `tracker.spec.ts`: change selectors that assumed `#hud` and `#graveyard` are fixed or unique, and the padding assertions (no bottom padding).
  - Req: 8, 15, 27, 28
  - Test: the updated tests in those files.

- [ ] 5.5 Add `e2e/crypt-footer.spec.ts`: the footer scrolls with the page, covers no text, `#show-tab` is the only fixed element at the bottom, its click scrolls to and focuses the graveyard, and the secrets run in a real page (Konami, 13 clicks, `boo`, a date through the e2e hook) and are silent in a field.
  - Req: 3, 19, 22, 23, 38, 40, 63
  - Test: `bun run test:e2e -- e2e/crypt-footer.spec.ts` exits 0.

- [ ] 5.6 `e2e/site-haunt.spec.ts` and `e2e/readme.shots.ts`: the marker may hold `-1` or an index, and the screenshot script reads the footer.
  - Req: 34, 35, 63
  - Test: `bun run test:e2e -- e2e/site-haunt.spec.ts` exits 0.

- [ ] 5.7 Run the affected specs: `graveyard`, `layout-375`, `photo-page`, `hero-haunt`, `costume`, `haunt`, `haunt-parade`, `exorcise-moment`, `tracker`, `site-haunt`, `non-destructive`, `crypt-footer`.
  - Req: 63, 66
  - Test: `bun run test:e2e -- <those files>` exits 0.

## 6. Visual baselines

- [ ] 6.1 Run `bun run visual:baselines` (Docker). Look at every changed PNG in `e2e-visual/__screenshots__/` at 1280 and 375: the footer in flow, the graveyard rows, the HUD, the badges, the sign-off, the ghost icon.
  - Req: 4, 5, 11, 12, 19, 64
  - Test: `bun run test:visual` passes in Docker. The list of changed PNGs is checked one by one, and a PNG that changed without a reason is a bug.

## 7. Real-site run

- [ ] 7.1 Run `bun run docs:realsite`. Check `docs/real-site-haunt.gif`, `docs/real-site-caption-nps.png` and `docs/real-site-caption-cdc.png` at 1280 and 375: the caption is `Trackers found: N` with the right count, the footer is at the page's end, the ghost icon is the only fixed thing at the bottom, nothing covers the text. Update `docs/real-site.json` and the dates in the README.
  - Req: 18, 19, 64
  - Test: the two stills opened and read by eye at both widths. The run's JSON matches the caption.

## 8. Docs

- [ ] 8.1 README: change the sections that say the HUD or the graveyard stands above the HUD, add a short `Secrets` section (Konami code, 13 clicks on the hit counter, typing `boo`, the witching hour and Oct 31, none while typing in a field, none touch the page), and note the 12 loading lines.
  - Req: 65
  - Test: `grep -n "Secrets" README.md` finds the section, and the README names no behaviour the code lacks.

- [ ] 8.2 `docs/devpost.md` and `docs/demo-script.md`: describe the footer, the ghost icon and the secrets, and add the secrets to the demo, with times.
  - Req: 65
  - Test: both files mention the footer and the ghost icon, and the demo's times add up.

## 9. Final checks

- [ ] 9.1 `bun run typecheck`.
  - Req: 66
  - Test: exits 0.

- [ ] 9.2 `bun run test`.
  - Req: 60, 61, 62, 66
  - Test: exits 0, `footer`, `secrets` and `cover` tests all run.

- [ ] 9.3 The affected e2e specs of 5.7 and `bun run lint:manifest`.
  - Req: 59, 63, 66
  - Test: both exit 0.

- [ ] 9.4 `bun run docker:test`, once.
  - Req: 64, 66
  - Test: exits 0.

- [ ] 9.5 `bun run build`.
  - Req: 59, 66
  - Test: exits 0 and `dist/` holds `cover.js` and `content.js`.
