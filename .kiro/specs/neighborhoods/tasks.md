# Tasks: Neighborhoods and popup polish (R9)

Implementation checklist for the neighborhoods spec. Each task names the requirement numbers it satisfies (`requirements.md`) and the test that proves it. Tests live under `test/neighborhoods/` (Bun unit tests, `happy-dom`) and `e2e/` (Playwright), unless a task says it updates an existing test.

Do the tasks in order: each group builds on the one before. Run `bun run typecheck` and `bun run test` after every group.

## 1. Neighborhood data and resolver

- [x] 1.1 Create `src/data/neighborhoods.json` as in `design.md`: 16 neighborhoods (name, tagline, 4 suburbs) in the required order, and the ordered `rules` (all `tld` rules first).
  - Req: 1, 2, 3, 7, 8
  - Test: `test/neighborhoods/data.test.ts` → `"lists the 16 names in order"`, `"every tagline is one printable-ASCII line of 48 characters or fewer"`, `"every neighborhood has 4 distinct suburbs of 2 to 12 letters"`, `"SiliconValley has Heights, Area51 has Hangar, Heartland has Homestead"`, `"every rule has kind tld or word, a non-empty lowercase match and a known target"`, `"tld rules come before word rules"`, `"the required tld rules and word keywords are present"`.

- [x] 1.2 Create `src/data/neighborhood.ts` with `Neighborhood`, `fnv1a`, `normaliseHost` and `resolveNeighborhood` for the fixed addresses: `localhost`, `*.localhost`, IPv4 and IPv6 literals. No Chrome API, DOM, network, clock or random source.
  - Req: 4, 5, 6
  - Test: `test/neighborhoods/resolver.test.ts` → `"module imports with no chrome global"`, `"localhost is Heartland/Homestead/1998"`, `"app.localhost is Heartland/Homestead/1998"`, `"127.0.0.1 is Area51/Hangar/1998"`, `"[::1] and ::1 are Area51/Hangar/1998"`, `"the fixed addresses carry the neighborhood tagline"`, `"Example.COM., www.example.com and example.com give the same address"`.

- [x] 1.3 Implement the rules: `tld` rules on the last and second-to-last label, `word` rules on tokens of the labels before the last, the 3-letter whole-token limit, the `s` plural, and first match wins in file order.
  - Req: 7, 8, 9
  - Test: `test/neighborhoods/resolver.test.ts` → `"agency.gov is CapitolHill and school.edu is Athens"`, `"agency.gov.uk and school.edu.au match on the second-to-last label"`, `"ac.jp is Athens, not Tokyo (rule order)"`, `"shop.example.com, mybank.example.com and store.example.net are WallStreet"`, `"game.example.com and play.example.org are TimesSquare"`, `"news.example.com, blog.example.org and write.example.net are SoHo"`, `"music.example.com and band.example.org are SunsetStrip"`, `"code.example.com, dev.example.org and github.example.net are SiliconValley"`, `"pet.example.com, dogs.example.org and cat.example.net are Petsburgh"`, `"cat does not fire on education.example.com"`, `"the last label is not a word: example.shop gets no word match"`, `"hyphenated labels are split: my-music-box.example.com is SunsetStrip"`, `"a tld rule beats a word rule: shop.example.gov is CapitolHill"`.

- [x] 1.4 Implement the hash fallback and the address: neighborhood `fnv1a(host) mod 16`, suburb `fnv1a("suburb:" + host) mod 4`, number `1000 + ((fnv1a(host) >>> 8) mod 9000)`, address `name/suburb/number`.
  - Req: 10, 11
  - Test: `test/neighborhoods/resolver.test.ts` → `"a host with no rule gets the neighborhood at fnv1a mod 16"`, `"the suburb comes from the neighborhood's own list"`, `"the number is between 1000 and 9999"`, `"the address is name/suburb/number"`, `"a rule-matched host also gets a hashed suburb and number"`, `"known hosts keep their address (a table of 6 hosts, so a change of hash is noticed)"`, `"SiliconValley/Heights/2049 is a valid address shape"`.

- [x] 1.5 Make the resolver total and deterministic.
  - Req: 12
  - Test: `test/neighborhoods/resolver.test.ts` → `"the empty string resolves"`, `"a 5000-character host resolves"`, `"non-ASCII, spaces and slashes resolve"`, `"the same host gives equal results on two calls"`, `"never throws for a list of 20 odd inputs"`.

## 2. Neighborhood bar

- [x] 2.1 In `bands.ts`, remove `AREAS` and `neighborhoodFor`. `buildBands(doc, n: Neighborhood)` builds `.where` (`You are in: <b>`), `.tagline` and `.sign`, filling `b` and `.tagline` with `textContent`.
  - Req: 13, 17, 18
  - Test: `test/neighborhoods/bar.test.ts` → `"the bar reads You are in: <address>"`, `"the tagline follows the address"`, `"the order is where, tagline, sign"`, `"a hostile tagline or address is text, not markup"`, `"neighborhoodFor is no longer exported"`.

- [x] 2.2 In `styles.ts`, add the `.where`, `.tagline` and `.sign` rules and the `@media (max-width: 479px)` rule from `design.md`. Keep the existing bar rules.
  - Req: 14, 15, 16
  - Test: `test/neighborhoods/bar.test.ts` → `"CSS: the tagline is nowrap, overflow hidden, text-overflow ellipsis, min-width 0"`, `"CSS: the address and the sign do not shrink"`, `"CSS: the tagline is display none under 480px"`, `"CSS: the bar is still 24px, #330066, #ffffcc, Times New Roman 13px"`, `"CSS: the tagline adds no new colour or font"`, `"tagline text meets 4.5:1 against the bar"`.

- [x] 2.3 In `render.ts`, call `resolveNeighborhood(win.location.hostname)` once and pass it to `buildBands`.
  - Req: 18
  - Test: `test/neighborhoods/bar.test.ts` → `"renderCostume shows the address of the page host"`, `"it resolves the host once per render"`.

- [x] 2.4 Update the old placeholder test in `test/costume.test.ts` (`"neighborhoodFor is a stable Area/Vault/NNNN placeholder per host"`) and its import: remove the test and the `neighborhoodFor` import, and check the bar text through `buildBands(doc, resolveNeighborhood("example.org"))`. Update `test/costume/bands.test.ts` (and any other test that calls `buildBands` with a string) the same way.
  - Req: 13, 18
  - Test: `bun run typecheck`; `test/costume.test.ts` and `test/costume/bands.test.ts` pass.

## 3. Popup address line

- [x] 3.1 In `src/popup/screens.ts`, add `addressOf(url)` over `resolveNeighborhood(new URL(url).hostname)` and render `<p class="address muted">` directly after the `h1` on the haunted screen only.
  - Req: 19, 20
  - Test: `test/neighborhoods/popup.test.ts` → `"haunted screen shows the address under the title"`, `"the line is the h1's next sibling"`, `"the address equals resolveNeighborhood(host).address"`, `"idle screen has no address line"`, `"restricted screen has no address line"`, `"a file: URL has no address line"`, `"a null url has no address line"`, `"an unparseable url has no address line"`, `"the line is set as text"`.

- [x] 3.2 In `src/popup/styles.css`, add `.address` (13px, `var(--muted)`, `margin-top: -8px`, `overflow-wrap: anywhere`).
  - Req: 19
  - Test: `test/neighborhoods/popup.test.ts` → `"CSS: .address is 13px, muted, and may break anywhere"`, `"CSS: muted text meets 4.5:1 on the canvas"`.

## 4. Known vampire row and card footnote

- [x] 4.1 In `vampireRow`, make the sub line of a known vampire `On the Tracker Radar fingerprint list`. Keep the `Known` pill and the caught rows. Update `test/vampire/popup.test.ts` line 43 (`["Hotjar", "Known", "Known to fingerprint", "Exorcise"]`) to the new line.
  - Req: 41
  - Test: `test/neighborhoods/popup.test.ts` → `"a known vampire row has the pill Known and the line On the Tracker Radar fingerprint list"`, `"the word Known appears once in a known vampire row's text"`, `"a caught vampire row is unchanged"`, `"the card still says Known to fingerprint (Tracker Radar)"`, `"the lane label still says known to fingerprint"`; `test/vampire/popup.test.ts` updated and passing.

- [x] 4.2 In `openCard`, change the footnote to `Blocked on this tab until you un-haunt or leave the page.` Update `test/tracker/ghosts.test.ts` line 143 to the new string.
  - Req: 42
  - Test: `test/neighborhoods/footnote.test.ts` → `"the ghost card footnote is exactly Blocked on this tab until you un-haunt or leave the page."`, `"the vampire card has the same footnote"`, `"a card with no Exorcise button has no footnote"`, `"the old text appears nowhere in src/"` (reads the source files); `test/tracker/ghosts.test.ts` updated and passing.

## 5. Hem tints

- [x] 5.1 In `ghosts.ts`, add `assignTints(companies)`: base tint from `hemTint`, moved to the next tint until it differs from the two before. Keep `hemTint` and its export.
  - Req: 37, 38, 39, 40
  - Test: `test/neighborhoods/tints.test.ts` → `"the first company has its base tint"`, `"a company whose base tint equals the previous one takes the next tint"`, `"a company whose base tint equals the one two back also moves"`, `"it wraps from the last tint to the first"`, `"it moves more than one step when the next tint is also taken"`, `"no two adjacent companies share a tint, for 12 names"`, `"the same list gives the same tints"`, `"hemTint is unchanged: hash mod 6"`.

- [x] 5.2 Make `ghostSvg` take a tint. In `updateGhosts`, compute the tints over the sorted non-vampire companies (including those past the slots), build new ghosts with their tint, and redraw only the `.sprite` of an existing ghost when its tint changed (`data-tint`). Update `test/tracker/ghosts.test.ts` (line 87, `hemTint("Criteo")`) so it expects the tint from `assignTints`.
  - Req: 38, 39, 40
  - Test: `test/neighborhoods/tints.test.ts` → `"lane ghosts that are neighbours have different hem colours"`, `"a ghost keeps its element, focus and aria-label when its tint changes"`, `"a ghost past the slots still counts in the order"`, `"vampires are not part of the tint order"`; `test/tracker/ghosts.test.ts` updated and passing.

- [x] 5.3 In `screens.ts`, give each ghost row the tint from `assignTints(ghosts.map(g => g.company))`.
  - Req: 40
  - Test: `test/neighborhoods/tints.test.ts` → `"the popup ghost rows use the same tints as the lanes for the same list"`, `"adjacent popup rows have different hem colours"`.

## 6. Toolbar badge

- [x] 6.1 Create `src/background/badge.ts` with `BADGE_BG`, `BADGE_FG`, `badgeText(n)` and `createBadge(api)` (`show`, `clear`), every call with `tabId`.
  - Req: 21, 22, 25, 26
  - Test: `test/neighborhoods/badge.test.ts` → `"badgeText(0) is empty"`, `"badgeText(1) is 1 and badgeText(99) is 99"`, `"badgeText(100) is 99+"`, `"badgeText(1000) is 99+"`, `"a non-empty badge sets text, background #6633cc and text colour #ffffff for the tab"`, `"an empty badge sets only the text"`, `"every call passes tabId and none is global"`, `"a rejected setBadgeText is swallowed"`, `"a missing action API is swallowed"`.

- [x] 6.2 In `router.ts`, add `refreshBadge(tabId)` (companies + tombstones + curses, empty for a tab that is not haunted) and call it after the `session.set` of `TRACKER_UPDATE`, `TOMBSTONE_UPDATE` and `CURSE_UPDATE`.
  - Req: 21, 23, 25
  - Test: `test/neighborhoods/badge.test.ts` → `"TRACKER_UPDATE sets the badge to the company count"`, `"a vampire counts once, with the ghosts"`, `"TOMBSTONE_UPDATE adds the tombstones"`, `"CURSE_UPDATE adds the curses"`, `"the badge is the sum of all four kinds"`, `"over 99 reads 99+"`, `"an update that brings the count to 0 sets an empty badge"`, `"an update from a tab that is not haunted does not touch the badge"`, `"two tabs keep separate counts"`, `"the badge count equals the popup tiles' sum from getState"`.

- [x] 6.3 In `clearTab`, call `badge.clear(tabId)`, so `UNHAUNT`, `CLEAR_EXORCISE`, tab close and navigation or reload clear it.
  - Req: 24, 25
  - Test: `test/neighborhoods/badge.test.ts` → `"UNHAUNT clears the badge of that tab only"`, `"closing the tab clears its badge"`, `"a navigation that kills the content script clears the badge"`, `"a same-document change (the script still answers) keeps the badge"`, `"clearing a tab that is already gone does not throw"`.

- [x] 6.4 Confirm no new permission or manifest key.
  - Req: 27
  - Test: `test/manifest.test.ts` passes unchanged; `test/neighborhoods/badge.test.ts` → `"the badge calls need no permission beyond the manifest's"` (the manifest permissions list is unchanged).

## 7. Link-check permission: the popup

- [x] 7.1 In `settings.ts`, turning the switch on calls `api.tabs.create({ url: api.runtime.getURL("permissions.html") })`, puts the switch back to off, and shows `Finish on the page that just opened.` It no longer calls `permissions.request`. Remove `LINK_SUB.denied`, add `LINK_SUB.ask`. A failed `tabs.create` restores `LINK_SUB.off`.
  - Req: 28, 29
  - Test: `test/neighborhoods/permissions.test.ts` → `"switching on opens permissions.html in a new tab"`, `"the popup never calls permissions.request"`, `"the switch goes back to off and the sub line asks to finish on the new page"`, `"a failed tabs.create restores the off line"`.

- [x] 7.2 Switching off still calls `permissions.remove` from the popup and shows the off line. `createSettings` reads `permissions.contains` on each load. Add the `onAdded` and `onRemoved` listeners that re-read `contains`.
  - Req: 30, 31
  - Test: `test/neighborhoods/permissions.test.ts` → `"switching off removes the permission and shows the off line"`, `"the switch is on when contains answers true"`, `"the switch is off when contains answers false or rejects"`, `"each new popup reads contains again"`, `"onAdded for the link-check origins turns the switch on"`, `"onRemoved for the link-check origins turns it off"`, `"an onAdded for other permissions is ignored"`.

- [x] 7.3 Update `test/popup.test.ts` (the settings tests near line 149, including `"reflects an existing grant from permissions.contains"` and any test of `request` or `LINK_SUB.denied`) to the new flow.
  - Req: 28, 29, 31
  - Test: `bun run typecheck`; `test/popup.test.ts` passes.

## 8. Link-check permission: the page

- [x] 8.1 Create `src/popup/permissions.html`, `permissions.ts` (exports `renderPermissions(doc, api)`) and `permissions.css`, with the DOM, copy and styling in `design.md`. The explanation reads exactly as requirement 32.
  - Req: 32, 36
  - Test: `test/neighborhoods/permissions.test.ts` → `"the page has the heading, the one-sentence explanation and one Allow link checks button"`, `"the explanation text is exact"`, `"the button is a pill with the popup class"`, `"CSS: canvas #eef0f4, surface white with an 18px radius"`, `"CSS: the body is not fixed at 360px"`, `"CSS: the focus ring is 2px solid #6633cc, offset 2px"`, `"the page has no animation and no remote resource"`.

- [x] 8.2 Behaviour: the click handler calls `permissions.request` with the link-check origins before any `await`; the result goes to a `role="status"` line; a grant disables the button; a refusal keeps it enabled; a prior grant shows the already-on line.
  - Req: 33, 34
  - Test: `test/neighborhoods/permissions.test.ts` → `"clicking calls permissions.request with LINK_CHECK_ORIGINS in the same tick"`, `"granted shows Link checks are on. You can close this tab. and disables the button"`, `"refused shows Chrome didn't allow it. Link checks stay off. and keeps the button enabled"`, `"a rejected request counts as refused"`, `"a second click after a refusal asks again"`, `"already granted shows Link checks are already on. with the button disabled"`, `"the result line has role status"`, `"contains rejecting counts as not granted"`.

- [x] 8.3 In `vite.config.ts`, add `permissions` as a second HTML input. Check the build output.
  - Req: 35
  - Test: `test/neighborhoods/permissions.test.ts` → `"vite config has popup and permissions inputs"`; `test/neighborhoods/build.test.ts` → `"dist/permissions.html and permissions.js exist after a build"`, `"permissions.html links a CSS file that exists in dist/"`, `"dist/manifest.json has no host_permissions and no web_accessible_resources"` (the build step is run in the test with `bun run build`, or skipped with a clear message when `dist/` is missing, as `test/manifest.test.ts` does).

- [x] 8.4 Check the manifest is untouched.
  - Req: 35
  - Test: `test/manifest.test.ts` passes unchanged.

## 9. Property-based tests

- [x] 9.1 Write `test/neighborhoods/properties.test.ts` with the local `prng` (mulberry32), `int`, `pick`, `SEED` and `CASES = 300`, and the `forAll` wrapper that reports the seed and the case, copied from `test/tracker/properties.test.ts`. No new dependency. Add a host generator (random labels from letters, digits, hyphens, mixed case, optional `www.`, optional trailing dot, random TLD, sometimes a keyword).
  - Req: 45
  - Test: `test/neighborhoods/properties.test.ts` → `"the generator is deterministic for a seed"`.

- [x] 9.2 Resolver properties.
  - Req: 10, 11, 12, 45
  - Test: `test/neighborhoods/properties.test.ts` → `"resolveNeighborhood is total for random strings"`, `"it is deterministic"`, `"the number is an integer from 1000 to 9999 unless the address is fixed"`, `"the suburb is in the neighborhood's list"`, `"address equals name/suburb/number"`, `"case, www. and a trailing dot do not change the result"`, `"the name is one of the 16"`.

- [x] 9.3 Tint properties.
  - Req: 38, 39, 40, 45
  - Test: `test/neighborhoods/properties.test.ts` → `"assignTints never repeats a tint within three consecutive companies"`, `"assignTints gives each company a tint from HEM_TINTS"`, `"assignTints equals hemTint for a company whose base tint is free"`, `"assignTints is deterministic"`.

## 10. Accessibility and motion

- [x] 10.1 Contrast and keyboard.
  - Req: 16, 22, 36
  - Test: `test/neighborhoods/bar.test.ts` → `"tagline text meets 4.5:1 against the bar"` (task 2.2); `test/neighborhoods/badge.test.ts` → `"white on #6633cc is at least 4.5:1"`; `test/neighborhoods/permissions.test.ts` → `"the Allow button is reachable by Tab and has a visible focus ring"`.

- [x] 10.2 Reduced motion and no new strobe.
  - Req: 36
  - Test: `test/neighborhoods/permissions.test.ts` → `"the page has no animation or transition"`; `test/neighborhoods/tints.test.ts` → `"a re-tint does not start an animation"`.

## 11. End-to-end tests (`e2e/neighborhoods.spec.ts`)

- [x] 11.1 Scaffold the spec with the helpers from `e2e/fixtures.ts`, and run each test for `width` in `[1280, 375]`. Also add a helper that reads `chrome.action.getBadgeText`, `getBadgeBackgroundColor` and `getBadgeTextColor` for a tab through the service worker (`sw.evaluate`).
  - Req: 46
  - Test: `e2e/neighborhoods.spec.ts` → `"helper reads the badge text of the active tab"`.

- [ ] 11.2 Bar: haunt `clean.html` on `127.0.0.1` and on `taboola.com` (mapped by the host-resolver flag). Check the bar text `You are in: Area51/Hangar/1998` for the first and `You are in: ${resolveNeighborhood("taboola.com").address}` for the second (the spec imports the resolver). At 1280 the tagline is shown, equals the neighborhood tagline, and has `text-overflow: ellipsis`. At 375 it is `display: none`, the bar is 24px tall and has no horizontal overflow. At 500 the tagline does not wrap (the bar stays 24px).
  - Req: 6, 13, 14, 15, 16, 18, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"the bar shows the address and the tagline at 1280"`, `"the tagline is hidden and the bar fits at 375"`, `"the tagline never wraps at 500"`, `"a fixture on 127.0.0.1 is Area51/Hangar/1998"`.

- [x] 11.3 Popup address line: the popup of a haunted `127.0.0.1` tab shows `Area51/Hangar/1998` directly under the title, muted, and the idle popup shows none.
  - Req: 19, 20, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"the popup shows the address under the site title when haunted"`, `"the idle popup shows no address"`.

- [x] 11.4 Badge: on `trackers.html` (needs the host-resolver flag) the badge text equals the sum of the popup tiles, its background is `#6633cc` and its text colour is white. On `dark-patterns.html` the curses count appears in the badge (6 plus any tracker count). Un-haunt clears it; reload clears it; a second tab keeps its own value; closing the tab leaves no error. The `99+` text is proved by the unit tests (task 6.1), because a real page with more than 99 findings is not worth a fixture.
  - Req: 21, 22, 23, 24, 25, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"the badge counts ghosts, vampires, tombstones and curses of the haunted tab"`, `"the badge colours are #6633cc and white"`, `"the badge is empty at 0"`, `"un-haunt clears the badge"`, `"a reload clears the badge"`, `"another tab's badge is not affected"`, `"closing a haunted tab raises no error"`.

- [x] 11.5 Permission flow: open the popup as a tab, turn the switch on, and check that a new tab at `permissions.html` opened, the popup did not call `request`, and the switch is off with `Finish on the page that just opened.` On the page, stub `chrome.permissions.request` with `page.addInitScript` (answers true, then false in a second run), click `Allow link checks`, and check the result line and the button state. Open the popup again with the real permission state and check the switch matches `chrome.permissions.contains` (read through the service worker). Check the page's look at 1280 and 375: `#eef0f4` canvas, a white surface with an 18px radius, one near-black button, no horizontal scroll.
  - Req: 28, 29, 31, 32, 33, 34, 35, 36, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"switching on opens permissions.html and leaves the switch off"`, `"the page asks for the link-check origins from the click"`, `"a grant shows the on line and disables the button"`, `"a refusal shows the off line and keeps the button"`, `"the popup switch matches permissions.contains when it opens"`, `"permissions.html looks like the popup design at 1280 and 375"`, `"switching off removes the permission from the popup"`.

- [x] 11.6 Hem tints: on `trackers.html` the ghost sprites in the lanes (1280 only, where a gutter exists) have different hem colours for neighbours, read from the sprite SVG, and the popup ghost rows show the same colours. At 375 (no lane) the popup rows still differ between neighbours.
  - Req: 38, 39, 40, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"neighbouring lane ghosts have different hem colours"`, `"popup ghost rows use the lane colours"`, `"adjacent popup rows differ at 375"`.

- [x] 11.7 Vampire row and footnote: on `vampires.html` and `trackers.html`, a known vampire row (Hotjar) reads `On the Tracker Radar fingerprint list` with a `Known` pill, and a caught row is unchanged. The ghost card footnote reads `Blocked on this tab until you un-haunt or leave the page.` After Exorcise, the session rules for the tab (read with `chrome.declarativeNetRequest.getSessionRules` in the service worker) are present while haunted, and gone after Un-haunt, after a reload, after navigating to `clean.html`, and after closing the tab.
  - Req: 41, 42, 43, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"a known vampire row says On the Tracker Radar fingerprint list once"`, `"the ghost card footnote is exact"`, `"the block lasts while the page is haunted"`, `"the block ends on un-haunt"`, `"the block ends on reload"`, `"the block ends on navigation"`, `"the block ends when the tab closes"`.

- [x] 11.8 Non-destructive: after haunt and un-haunt, `outerHTML` is byte-identical on `index.html` and the console has no errors.
  - Req: Overview, 46
  - Test: `e2e/neighborhoods.spec.ts` → `"un-haunt leaves the page byte-identical"`.

## 12. Docs

- [x] 12.1 Update `design/DESIGN.md`: the neighborhood bar (address, tagline, ellipsis, hidden under 480px), the popup address line under the site title, the `permissions.html` page (canvas, surface, pill, copy), the toolbar badge (colours, `99+`), the hem tint rule, the known vampire sub line and the new footnote.
  - Req: 47
  - Test: `test/neighborhoods/docs.test.ts` → `"DESIGN.md names the neighborhood bar address and tagline"`, `"DESIGN.md names the popup address line"`, `"DESIGN.md names permissions.html"`, `"DESIGN.md contains the new footnote and no longer contains the old one"`, `"DESIGN.md names the badge colour #6633cc"`.

- [x] 12.2 Update `README.md`: describe neighborhoods and the toolbar badge in "What it does", change the "still to come" sentence so it names only Kiro hooks, mention `permissions.html` where the optional link check is described, correct the Exorcise lifetime sentence if needed, and add `neighborhoods` to the specs list in "How Kiro was used". Update `test/readme.test.ts` so neighborhoods are allowed to describe working behaviour and Kiro hooks must still say "still to come".
  - Req: 47
  - Test: `test/readme.test.ts` (updated), `bun run test`.

## 13. Checks

- [x] 13.1 Run `bun run typecheck`, `bun run test`, `bun run test:e2e` and `bun run docker:test`. Fix any failure before closing the spec.
  - Req: 44, 45, 46
  - Test: all four commands exit 0.

- [x] 13.2 Confirm no new permission or dependency.
  - Req: 27, 35
  - Test: `test/manifest.test.ts` passes unchanged; `package.json` has no new entry.

- [x] 13.3 Check the tracker data licence notice is intact (no data change).
  - Req: Overview
  - Test: `src/data/ATTRIBUTION.md` and `src/data/LICENSE-tracker-radar.txt` are unchanged; `src/data/neighborhoods.json` holds only our own text.

- [ ] 13.4 Manual check in a real Chrome (the e2e run cannot click Chrome's permission dialog): load `dist/`, haunt a page, switch on "Check links to other sites", click `Allow link checks` on the new tab, accept the dialog, reopen the popup and confirm the switch is on. Switch it off and confirm Chrome no longer lists the site access. Record the result in the pull request.
  - Req: 28, 29, 30, 31, 33
  - Test: manual; the steps and the Chrome version are written in the pull request.
