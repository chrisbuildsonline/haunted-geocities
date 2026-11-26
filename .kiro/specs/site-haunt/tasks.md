# Tasks: Site Haunt (R11)

Implementation checklist for the site-haunt spec. Each task names the requirement numbers it satisfies (`requirements.md`) and the test that proves it. Unit tests live in `test/site-haunt.test.ts` and `test/popup.test.ts` (Bun), and the e2e tests in `e2e/site-haunt.spec.ts` (Playwright).

Do the tasks in order: each group builds on the one before. Run `bun run typecheck` and `bun run test` after every group. Task 1.1 is done with this spec. Everything else changes files outside `.kiro/` and is still to do.

## 1. Spec

- [x] 1.1 Write `requirements.md`, `design.md` and `tasks.md` in `.kiro/specs/site-haunt/`.

## 2. Site module and types

- [x] 2.1 Create `src/background/site-haunt.ts` with `siteOf`, `onSite` and `siteOrigins`. It shall import nothing from `chrome`.
  - Req: 1, 2, 3, 4, 5, 6
  - Test: `test/site-haunt.test.ts` → `"siteOf lower-cases and strips one www"`, `"siteOf is null for non-http URLs and garbage"`, `"onSite accepts the site and its subdomains"`, `"onSite rejects evilnps.gov and nps.gov.evil.com"`, `"onSite is exact for an IP and for localhost"`, `"siteOrigins gives four patterns, two for an IP or a dotless host"`.

- [x] 2.2 In `src/data/types.ts`, add `siteKey`, `QUIET_FLAG`, `FOLLOW_SITE` in `PopupRequest` and `site: string | null` in `TabState`. Add `site: null` to every `TabState` literal in `src/` and `test/`.
  - Req: 35
  - Test: `bun run typecheck` passes. `test/site-haunt.test.ts` → `"siteKey is site:<id>"`.

- [x] 2.3 Extend `test/chrome-mock.ts` with `permissions.contains`, `onAdded` and `onRemoved` (with `emit` helpers), `tabs.query({})`, and a `contentReply` that can reject `ping`.
  - Req: 44
  - Test: used by every test in groups 3 and 4. The existing tests still pass.

## 3. Background

- [x] 3.1 `getState` returns `site`: the entry while the tab is haunted, else `null`. The error fallback in `register` sets `site: null`.
  - Req: 35
  - Test: `test/site-haunt.test.ts` → `"state.site is the entry while haunted"`, `"state.site is null without a haunt"`, `"the error fallback has site null"`.

- [x] 3.2 Add `followSite` and the `FOLLOW_SITE` case in `handle`. Take the site from the tab's own URL, refuse a content-script sender.
  - Req: 14, 15, 17, 42
  - Test: `test/site-haunt.test.ts` → `"FOLLOW_SITE stores the site of a haunted tab"`, `"FOLLOW_SITE on an un-haunted tab stores nothing"`, `"FOLLOW_SITE ignores a site in the message body"`, `"FOLLOW_SITE with permissions.contains false stores nothing"`, `"FOLLOW_SITE from a content script is ignored"`.

- [x] 3.3 Add the `permissions.onAdded` listener.
  - Req: 16
  - Test: `test/site-haunt.test.ts` → `"onAdded with every site origin stores the entry"`, `"onAdded with a partial grant stores nothing"`, `"onAdded skips a tab that has an entry"`, `"onAdded skips a tab that is not haunted"`.

- [x] 3.4 Add `dropSite`, and call it from `unhaunt` and the `tabs.onRemoved` handler.
  - Req: 29, 31, 32, 33, 34, 37, 40
  - Test: `test/site-haunt.test.ts` → `"un-haunt removes the entry and the site origins"`, `"tab close removes the entry and the site origins"`, `"a second tab on the same site keeps the origins"`, `"link-check origins granted: no remove"`, `"a rejecting remove is ignored"`, `"no entry: no permissions call"`, `"nothing is written to storage.local"`.

- [x] 3.5 Add `rehaunt` with the in-flight set, `setQuiet`, and the `onUpdated` rewrite: keep the haunt for a new document on the site, stop otherwise, retry at `complete`.
  - Req: 18, 19, 20, 21, 22, 23, 24, 27, 28
  - Test: `test/site-haunt.test.ts` → `"loading on the site keeps the haunt and injects quietly"`, `"the quiet func runs before content.js"`, `"per-page reports are cleared and the nonce is new"`, `"loading off the site stops and drops the site"`, `"loading with no entry stops, as today"`, `"loading with the origins gone stops"`, `"ping answered: nothing happens"`, `"complete retries a missed injection"`, `"loading then complete injects once"`, `"a reload stays haunted"`, `"the Haunt button injection is not quiet"`.

- [x] 3.6 Add the `permissions.onRemoved` listener.
  - Req: 29, 30
  - Test: `test/site-haunt.test.ts` → `"onRemoved drops an entry whose origins are gone and keeps the haunt"`, `"onRemoved keeps an entry whose origins remain"`, `"the next new document after onRemoved clears the haunt"`.

- [x] 3.7 Run `bun run typecheck`, `bun run test` and `bun run lint:manifest`. The shipping manifest shall be unchanged.
  - Req: 39, 41
  - Test: all three exit 0. `git diff --stat src/manifest.ts` shows only the e2e list (task 6.1).

## 4. Content script

- [x] 4.1 In `src/content/costume/render.ts`, give `renderCostume` a second argument `{ quiet }` that skips the haunt moment and arrives settled.
  - Req: 26
  - Test: `test/costume.test.ts` (or the file that tests `renderCostume`) → `"quiet renders no haunt moment and no caption"`, `"quiet arrives settled"`, `"without quiet the haunt moment runs"`.

- [x] 4.2 In `src/content/index.ts`, read and delete `QUIET_FLAG`, then call `renderCostume(document, { quiet: true })` when it was set.
  - Req: 25, 28
  - Test: `test/site-haunt.test.ts` → `"content.js with the flag renders quietly and deletes the flag"`, `"content.js without the flag is loud"`.

## 5. Popup

- [x] 5.1 In `src/popup/app.ts`, call `permissions.request` first in the Haunt click, send `HAUNT` at once, send `FOLLOW_SITE` after a `true`, and stay busy until both answers have arrived. `ask` accepts `FOLLOW_SITE`. `NO_TAB` sets `site: null`.
  - Req: 7, 8, 9, 10, 11, 12, 13
  - Test: `test/popup.test.ts` → `"Haunt requests the site origins before any await"`, `"HAUNT is sent without waiting for the permission answer"`, `"a granted request sends FOLLOW_SITE after HAUNT"`, `"a declined request sends no FOLLOW_SITE"`, `"a rejected request sends no FOLLOW_SITE"`, `"a failed haunt sends no FOLLOW_SITE"`, `"a restricted tab makes no request"`, `"the button is aria-busy until both answers arrive"`, `"the whoosh still plays once"`.

- [x] 5.2 In `src/popup/screens.ts`, show `Haunting all of SITE` under the address when `state.site` is set, and nothing extra when it is `null`.
  - Req: 36, 37, 38
  - Test: `test/popup.test.ts` → `"the haunted screen shows Haunting all of nps.gov"`, `"no site line when site is null"`, `"the idle screen after Un-haunt has no site line"`.

## 6. e2e (`e2e/site-haunt.spec.ts`)

- [x] 6.1 In `src/manifest.ts`, add `https://127.0.0.1/*` and `https://localhost/*` to the e2e `host_permissions` only, and update `test/manifest.test.ts` for the e2e list. Add the two fixture links.
  - Req: 6, 39, 46
  - Test: `test/manifest.test.ts` → the shipping-manifest test still shows no `host_permissions`. `bun run lint:manifest` exits 0.

- [x] 6.2 Haunt, click an internal link: the next page is haunted with no haunt moment, and the popup shows `Haunting all of 127.0.0.1`.
  - Req: 19, 26, 36, 46
  - Test: `e2e/site-haunt.spec.ts` → `"the next page of the site is haunted without the haunt moment"`.

- [x] 6.3 Haunt, click a link to `localhost:4321`: the page is clean, and the popup shows the idle screen.
  - Req: 20, 29, 46
  - Test: `e2e/site-haunt.spec.ts` → `"a link to another site gives a clean page"`.

- [x] 6.4 Haunt, reload: the page is haunted again.
  - Req: 22, 46
  - Test: `e2e/site-haunt.spec.ts` → `"a reload stays haunted"`.

- [x] 6.5 Stub `permissions.request` to resolve `false` in the popup page: the first page haunts, the next page is clean, and no site line shows.
  - Req: 12, 46
  - Test: `e2e/site-haunt.spec.ts` → `"a declined permission keeps the one-page haunt"`.

- [x] 6.6 Run `bun run test:e2e`.
  - Req: 47
  - Test: exits 0, existing specs unchanged.

## 7. Docs and baselines

- [x] 7.1 In `README.md`, update the "What it does" haunt line and the "Permissions" section: the optional `http://*/*` and `https://*/*` are now also asked for the one site, at the Haunt click, and handed back when the site haunt ends. Add the privacy line (criterion 40) and mention the spec in "How Kiro was used".
  - Req: 39, 40, 41
  - Test: `test/project.test.ts` still passes, and `grep -n "Haunting all of\|site" README.md` shows the new lines.

- [x] 7.2 In `docs/devpost.md`, raise the spec count from 10 to 11 wherever it is stated, and add one line about site haunt. Update the README spec count the same way.
  - Req: 47
  - Test: `grep -n "specs" README.md docs/devpost.md` shows 11 in both, and any test that pins the count passes.

- [x] 7.3 Regenerate the popup's haunted-screen baselines in Docker with `bun run visual:baselines`, and review each changed PNG before committing it.
  - Req: 36, 47
  - Test: `bun run test:visual` exits 0. `git status` shows changes only to the popup's haunted-screen PNGs under `e2e-visual/__screenshots__/`.

- [x] 7.4 Run `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run lint:manifest` and `bun run docker:test`.
  - Req: 47
  - Test: all five exit 0.

## 8. Two actions (F26) — replaced by group 9

Superseded by owner decision F27 (group 9): the popup has one button, `Haunt page`. Requirements 7 to 13, 45, 46 and 48 were rewritten, and criteria 49 to 63 are new. The ticks below record what was built for F26; do not redo these tasks, and do not read their test names as current. Group 9 changes what they built.

- [x] 8.1 Write the popup unit tests first, in `test/popup.test.ts`, and see them fail.
  - Req: 7, 8, 9, 10, 11, 12, 13, 45
  - Test: `"the page button never calls permissions.request"`, `"the site button requests the origins before any await"`, `"the site button sends HAUNT at once"`, `"granted sends FOLLOW_SITE after HAUNT"`, `"declined gives one page and no FOLLOW_SITE"`, `"rejected gives one page and no FOLLOW_SITE"`, `"a failed haunt sends no FOLLOW_SITE"`, `"the hint names the site in lower case and is linked by aria-describedby"`, `"no site button for a file:// tab"`, `"no site button for a restricted tab"`, `"only one .primary button"`, `"both buttons are disabled and the clicked one is aria-busy"`. The tests of 5.1 that click the primary button and expect a request are rewritten to click `.site-haunt`.

- [x] 8.2 In `src/popup/screens.ts`, add the `Haunt this whole site` button (`btn site-haunt`) and its hint to the idle Haunt group box, with an `onSite` callback in `ScreenProps`. In `src/popup/app.ts`, give `act` the `wholeSite` flag: only the site path calls `permissions.request`, before any `await`. Both buttons are disabled in flight and the clicked one is `aria-busy`. Add the `.site-hint` rule to the popup stylesheet with no new colour.
  - Req: 7, 8, 9, 10, 11, 12, 13
  - Test: the tests of 8.1 pass. `bun run typecheck` and `bun run test` exit 0.

- [x] 8.3 In `e2e/site-haunt.spec.ts`, add a request spy and the three paths.
  - Req: 7, 11, 12, 19, 26, 46
  - Test: `"the page button never requests the permission"`, `"the site button follows the next internal link with no haunt moment"`, `"a denied permission gives one page"`. The existing specs there use the site button.

- [x] 8.4 Update `README.md`, `docs/devpost.md` and `docs/demo-script.md`: the two buttons, the hint, and that only the site button asks. The demo shows both buttons, the Allow path and the Deny path.
  - Req: 48
  - Test: `grep -n "Haunt this whole site" README.md docs/devpost.md docs/demo-script.md` finds all three. `test/project.test.ts` still passes.

- [x] 8.5 Regenerate the popup baselines in Docker with `bun run visual:baselines` (the idle screens gain the second button), and review each changed PNG before committing it.
  - Req: 47
  - Test: `bun run test:visual` exits 0. `git status` shows changes only to popup PNGs under `e2e-visual/__screenshots__/`.

- [x] 8.6 Run `bun run typecheck` and `bun run test`. Run the host e2e for the popup, site-haunt, haunt and navigation specs. Run `bun run docker:test` once.
  - Req: 47
  - Test: all exit 0.

## 9. One button and the page-change cover (F27)

Owner decision F27: one `Haunt page` button that does the whole-site haunt, and a cover so the original page never flashes on follow-up pages. Do the tasks in order. Write each test task first and see it fail before the code that follows it.

- [ ] 9.1 Add a "Page-change cover" section to `design/DESIGN.md`: the `hg-cover` layer above everything (z-index max, removed before the costume is seen), the 1998 loading screen (dark crypt background, small bobbing pixel ghost, `Loading crypt…` in Comic Sans MS, Win95 sunken progress bar with moving blue blocks), web-safe colours only, original sprite, 200ms fade, reduced-motion behaviour, and no focusable content.
  - Req: 55, 56, 57
  - Test: `test/design.test.ts` (or the file that checks `DESIGN.md` tokens) still passes. Every colour in the section is in the 216 web-safe set.

- [ ] 9.2 Popup unit tests first in `test/popup.test.ts`, seen failing. Then the one-button popup: in `src/popup/screens.ts` remove the `.site-haunt` button and `onSite`, rename the primary button's label to `Haunt page`, and add the note `Chrome may ask once to let the haunt follow you around SITE.` (`.site-note`, `aria-describedby`) for `http(s)` pages only. In `src/popup/app.ts` make `act(current)` ask for the site's origins in the click, before any `await`, for every idle click on a tab with a site. Rename the `.site-hint` rule in the popup stylesheet. Rewrite the F26 popup tests that clicked `.site-haunt`.
  - Req: 7, 8, 9, 10, 11, 12, 13, 45
  - Test: `"one .primary button and no .site-haunt"`, `"the idle button reads Haunt page"`, `"the note names the site in lower case and is linked by aria-describedby"`, `"no note for a file:// tab"`, `"no note and no request for a restricted tab"`, `"the click requests the site origins before any await"`, `"HAUNT is sent without waiting for the permission answer"`, `"granted sends FOLLOW_SITE after HAUNT"`, `"declined gives one page and no FOLLOW_SITE"`, `"rejected gives one page and no FOLLOW_SITE"`, `"a throwing request gives one page"`, `"a failed haunt sends no FOLLOW_SITE and hands the origins back"`, `"the button is disabled and aria-busy until both answers arrive"`, `"the whoosh plays once"`.

- [ ] 9.3 Cover unit tests first in `test/cover.test.ts`, seen failing. Then `src/cover/index.ts` (the `hg-cover` element, the marker, `COVER_CHECK`, the hook on the isolated world's global, the 3000ms cap) and a `cover` entry in `vite.config.ts` that builds `cover.js` as an IIFE like `content.js`. Add `COVER_MARKER`, `COVER_DONE` and `COVER_CHECK` to `src/data/types.ts`. In `src/content/index.ts` call the hook after a quiet render, and in `leaveCostume` remove the marker and call the hook with `true`.
  - Req: 51, 52, 53, 55, 56, 57, 58, 59, 61, 62, 63
  - Test: `test/cover.test.ts` → `"marker present shows the cover at once"`, `"a false answer removes the cover and the marker"`, `"no marker and a true answer shows the cover"`, `"no marker and a false answer never shows it"`, `"a rejected check counts as false"`, `"the removal hook fades over 200ms and removes the element"`, `"the hook with true removes at once"`, `"3000ms removes the cover"`, `"reduced motion: no animation and no fade"`, `"no focusable content, no inert, no focus change"`, `"role=status says Loading crypt…"`, `"an unhaunt message removes it and sends no answer"`, `"the cover adds only hg-cover to the page"`. `bun run build` writes `dist/cover.js` with no `import`, and `bun run lint:manifest` exits 0.

- [ ] 9.4 Background unit tests first in `test/site-haunt.test.ts`, seen failing, with the mock gaining `scripting.registerContentScripts`, `getRegisteredContentScripts` and `unregisterContentScripts`. Then the router changes: `registerCover`, `unregisterCover`, `setMarker`, the calls in `followSite`, the `onAdded` path, `rehaunt`, `dropSite` and `permissions.onRemoved`, the `onStartup` clean-up, and the `COVER_CHECK` handler. Move them to `src/background/cover-script.ts` if `router.ts` passes 300 lines.
  - Req: 49, 50, 52, 54, 60, 63
  - Test: `test/site-haunt.test.ts` → `"FOLLOW_SITE registers cover-SITE with the exact options"`, `"onAdded registers it too"`, `"a second follow registers once"`, `"a denied request registers nothing"`, `"the marker is set when the entry is stored"`, `"the marker is set before each quiet re-haunt"`, `"un-haunt unregisters the script"`, `"a tab on the same site keeps the script until the last one drops"`, `"link-check origins granted: the script still goes"`, `"onRemoved unregisters it"`, `"onStartup unregisters every cover- script"`, `"a failing register or unregister does not throw"`, `"COVER_CHECK is true for a haunted tab on its site"`, `"COVER_CHECK is false for an un-haunted tab, a tab off the site and an extension page"`, `"COVER_CHECK ignores a tab id in the body"`.

- [ ] 9.5 e2e in `e2e/site-haunt.spec.ts`: replace the F26 tests that used the two buttons, and add the cover tests of design.md. Probe the cover with `addInitScript` at `DOMContentLoaded` and in the first `requestAnimationFrame`.
  - Req: 7, 11, 12, 46, 59, 60, 63
  - Test: `"one button only"`, `"the next internal link is covered at DOMContentLoaded and before first paint, then uncovered and haunted with no intro"`, `"Deny gives one page and no registration"`, `"an un-haunted tab on the same site is never covered"`, `"a copied sessionStorage in a new tab is uncovered"`, `"un-haunt removes the registration"`, `"leaving the site removes the registration"`, `"a reload stays haunted behind the cover"`.

- [ ] 9.6 Update `README.md`, `docs/devpost.md` and `docs/demo-script.md`: the one `Haunt page` button, the note, the cover on the next page, and the Allow and Deny paths. Remove every mention of `Haunt this whole site` and the second button, and keep the spec and hook counts as they are.
  - Req: 48
  - Test: `grep -rn "Haunt this whole site" README.md docs/devpost.md docs/demo-script.md` finds nothing. `test/project.test.ts` still passes.

- [ ] 9.7 Regenerate the popup baselines in Docker with `bun run visual:baselines` and review each changed PNG. Then run `bun run typecheck`, `bun run test`, the affected e2e specs (popup, site-haunt, haunt, navigation), `bun run docker:test` once, and `bun run build`.
  - Req: 47
  - Test: `bun run test:visual` exits 0 and `git status` shows changes only to popup PNGs under `e2e-visual/__screenshots__/`. All the other commands exit 0, and `dist/cover.js` exists.
