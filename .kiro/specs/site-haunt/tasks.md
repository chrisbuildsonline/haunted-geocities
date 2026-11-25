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

## 8. Two actions (F26)

Owner decision, jury run 154: the whole-site haunt is a separate choice, so the default click never prompts. Requirements 7 to 13 and 48 changed. Tasks 5.1 and 6.x stay ticked as they were; group 8 changes what they built.

- [ ] 8.1 Write the popup unit tests first, in `test/popup.test.ts`, and see them fail.
  - Req: 7, 8, 9, 10, 11, 12, 13, 45
  - Test: `"the page button never calls permissions.request"`, `"the site button requests the origins before any await"`, `"the site button sends HAUNT at once"`, `"granted sends FOLLOW_SITE after HAUNT"`, `"declined gives one page and no FOLLOW_SITE"`, `"rejected gives one page and no FOLLOW_SITE"`, `"a failed haunt sends no FOLLOW_SITE"`, `"the hint names the site in lower case and is linked by aria-describedby"`, `"no site button for a file:// tab"`, `"no site button for a restricted tab"`, `"only one .primary button"`, `"both buttons are disabled and the clicked one is aria-busy"`. The tests of 5.1 that click the primary button and expect a request are rewritten to click `.site-haunt`.

- [ ] 8.2 In `src/popup/screens.ts`, add the `Haunt this whole site` button (`btn site-haunt`) and its hint to the idle Haunt group box, with an `onSite` callback in `ScreenProps`. In `src/popup/app.ts`, give `act` the `wholeSite` flag: only the site path calls `permissions.request`, before any `await`. Both buttons are disabled in flight and the clicked one is `aria-busy`. Add the `.site-hint` rule to the popup stylesheet with no new colour.
  - Req: 7, 8, 9, 10, 11, 12, 13
  - Test: the tests of 8.1 pass. `bun run typecheck` and `bun run test` exit 0.

- [ ] 8.3 In `e2e/site-haunt.spec.ts`, add a request spy and the three paths.
  - Req: 7, 11, 12, 19, 26, 46
  - Test: `"the page button never requests the permission"`, `"the site button follows the next internal link with no haunt moment"`, `"a denied permission gives one page"`. The existing specs there use the site button.

- [ ] 8.4 Update `README.md`, `docs/devpost.md` and `docs/demo-script.md`: the two buttons, the hint, and that only the site button asks. The demo shows both buttons, the Allow path and the Deny path.
  - Req: 48
  - Test: `grep -n "Haunt this whole site" README.md docs/devpost.md docs/demo-script.md` finds all three. `test/project.test.ts` still passes.

- [ ] 8.5 Regenerate the popup baselines in Docker with `bun run visual:baselines` (the idle screens gain the second button), and review each changed PNG before committing it.
  - Req: 47
  - Test: `bun run test:visual` exits 0. `git status` shows changes only to popup PNGs under `e2e-visual/__screenshots__/`.

- [ ] 8.6 Run `bun run typecheck` and `bun run test`. Run the host e2e for the popup, site-haunt, haunt and navigation specs. Run `bun run docker:test` once.
  - Req: 47
  - Test: all exit 0.
