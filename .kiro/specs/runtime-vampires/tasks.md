# Tasks: Runtime Vampires (R6)

Implementation checklist for the runtime vampires spec. Each task references the requirement numbers it satisfies and names the test that proves it.

Tests live under `test/vampire/` (Bun unit tests) and `e2e/` (Playwright end-to-end tests).

## 1. Types

- [ ] 1.1 Add `VampireInfo` interface to `src/data/types.ts`: `{ caught: ("canvas" | "audio" | "fonts")[]; knownOnly: boolean }`.
  - Req: 20
  - Test: `test/vampire/merge.test.ts` → `"VampireInfo type is exported and importable"`.

- [ ] 1.2 Add optional `vampire?: VampireInfo` field to `CompanyHit`.
  - Req: 20
  - Test: `test/vampire/merge.test.ts` → `"CompanyHit has optional vampire field"`.

## 2. MAIN-World Hook Script

- [ ] 2.1 Create `src/content/hooks.ts` exporting `installHooks(nonce: string)`. The function is injected via `executeScript({ func, args })`, receiving the nonce as its first parameter. Save original property descriptors for `toDataURL`, `toBlob`, `getImageData`, `startRendering`, `measureText`, plus `fillText`, `strokeText` (tracking wrappers), and the `font` property setter. Keep all state (descriptors, tracking sets, listeners) in the closure — do not set any property on `window`.
  - Req: 1, 3, 5, 11, 4a
  - Test: `test/vampire/hooks.test.ts` → `"hooks save original descriptors before installing wrappers"`, `"hooks set nothing on window"`.

- [ ] 2.2 Implement `makeWrapper(origFn, api, shouldReport)` that returns a function calling the original with `this` and `args`, returning its result, rethrowing its exceptions, dispatching a CustomEvent when `shouldReport()` is true, and preserving `name`, `length`, and `toString` (native-looking).
  - Req: 6, 7, 12, 16
  - Test: `test/vampire/hooks.test.ts` → `"wrapper returns same result"`, `"wrapper rethrows same exception"`, `"wrapper preserves name/length/toString"`, `"wrapper.toString looks native"`.

- [ ] 2.3 Implement `extractScriptUrl(stack)` that returns the first `http(s)` URL in `new Error().stack` that is not the hook script's own URL.
  - Req: 13
  - Test: `test/vampire/hooks.test.ts` → `"extractScriptUrl finds first non-hook http(s) URL"`.

- [ ] 2.4 Implement `dispatch(api)` that calls `extractScriptUrl` and dispatches `window.dispatchEvent(new CustomEvent(nonce, { detail: { api, scriptUrl } }))`. Skip if no script URL found.
  - Req: 16
  - Test: `test/vampire/hooks.test.ts` → `"dispatch fires CustomEvent with nonce type and { api, scriptUrl } detail"`.

- [ ] 2.5 Install wrappers for `toDataURL` and `toBlob` (always report `canvas`). Install `startRendering` wrapper (always report `audio`).
  - Req: 5, 10
  - Test: `test/vampire/hooks.test.ts` → `"toDataURL wrapper reports canvas"`, `"toBlob wrapper reports canvas"`, `"startRendering wrapper reports audio"`.

- [ ] 2.6 Implement the canvas-text heuristic: install tracking wrappers on `fillText` and `strokeText` that add `this` to a `WeakSet` (no CustomEvent). The `getImageData` wrapper reports `canvas` only when `textContexts.has(this)`.
  - Req: 8
  - Test: `test/vampire/hooks.test.ts` → `"getImageData reports canvas only after fillText/strokeText"`.

- [ ] 2.7 Implement the font-probing heuristic: wrap the `font` property setter to track distinct font-family strings in a per-context `WeakMap`, accumulating in a global `Set`. The `measureText` wrapper reports `fonts` only when the global set size is ≥ 20.
  - Req: 9
  - Test: `test/vampire/hooks.test.ts` → `"measureText reports fonts after 20 distinct font families"`, `"measureText does not report under 20 fonts"`.

- [ ] 2.8 Implement idempotency: before installing wrappers, dispatch a synchronous `CustomEvent` with type `<nonce>:ping` and `detail: { installed: false }`. If an already-installed closure is present, its `<nonce>:ping` listener sets `detail.installed = true` and the new invocation returns without installing. Install the `<nonce>:ping` listener inside the closure after the check passes.
  - Req: 2, 4b
  - Test: `test/vampire/hooks.test.ts` → `"hooks are idempotent: <nonce>:ping prevents double-install"`.

- [ ] 2.9 Implement restore: install a `<nonce>:restore` event listener inside the closure. On receipt, restore all original descriptors via `Object.defineProperty`, remove both the `<nonce>:ping` and `<nonce>:restore` listeners, and null internal state. No property is set on or deleted from `window` (because the hooks never set any).
  - Req: 41, 42, 4a
  - Test: `test/vampire/hooks.test.ts` → `"restore via <nonce>:restore puts back exact original descriptors (identity-equal)"`, `"restore removes ping and restore listeners"`, `"no window properties set or deleted by hooks"`.

## 3. Hook Restore (no separate bundle)

- [ ] 3.1 No separate `hooks-restore.ts` or `hooks-restore.js` file is created. Restore is triggered by the background dispatching `<nonce>:restore` via `executeScript({ func, args })` (see task 4.2). The `<nonce>:restore` listener is installed inside `installHooks` (see task 2.9).
  - Req: 41, 4a
  - Test: `test/vampire/hooks.test.ts` → `"restore via <nonce>:restore restores originals and removes listeners"`.

## 4. Background Integration

- [ ] 4.1 Modify `src/background/router.ts` `haunt()` to: (a) inject `content.js` (existing), (b) generate or reuse a nonce stored in `chrome.storage.session` under `nonce:${tabId}`, (c) send the nonce to the tab via `chrome.tabs.sendMessage(tabId, { type: "vampires", nonce })`, and (d) inject the hook via `chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: installHooks, args: [nonce] })`. Import `installHooks` from `src/content/hooks`.
  - Req: 1, 3, 4c
  - Test: `test/vampire/background.test.ts` → `"haunt injects installHooks in MAIN world with nonce"`, `"haunt sends { type: vampires, nonce } to tab"`, `"haunt reuses existing nonce for same tab"`.

- [ ] 4.2 Modify `src/background/router.ts` `unhaunt()` to dispatch `<nonce>:restore` in the MAIN world before sending the `unhaunt` message: `chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: (n: string) => window.dispatchEvent(new CustomEvent(\`${n}:restore\`)), args: [nonce] })`. Read the nonce from `chrome.storage.session`. Remove the nonce from session storage after.
  - Req: 41
  - Test: `test/vampire/background.test.ts` → `"unhaunt dispatches <nonce>:restore before sending unhaunt message"`, `"unhaunt removes nonce from session"`.

- [ ] 4.3 Verify no new permissions are required. The `activeTab` grant covers `executeScript` with `world: "MAIN"` on the active tab.
  - Req: 4
  - Test: `test/vampire/background.test.ts` → `"no new permissions in manifest"`.

## 5. Isolated-World Bridge

- [ ] 5.1 Create `src/content/hooks-bridge.ts` with `createVampireBridge()` returning `{ start(nonce, siteHost, onVampire), stop() }`. `start` adds a `window.addEventListener(nonce, handler)`.
  - Req: 17
  - Test: `test/vampire/attribution.test.ts` → `"bridge listens for CustomEvent with nonce type"`.

- [ ] 5.2 The handler validates `detail`: must be an object with `api` ∈ `"canvas" | "audio" | "fonts"` and `scriptUrl` as a string. Invalid payloads are discarded.
  - Req: 17
  - Test: `test/vampire/attribution.test.ts` → `"invalid payloads are discarded"`.

- [ ] 5.3 The handler deduplicates `(scriptUrl, api)` pairs in a `Set`. Subsequent reports for the same pair are ignored.
  - Req: 18
  - Test: `test/vampire/attribution.test.ts` → `"duplicate (scriptUrl, api) reports are ignored"`.

- [ ] 5.4 `stop()` removes the event listener.
  - Req: 43
  - Test: `test/vampire/attribution.test.ts` → `"stop removes the listener"`.

## 6. Attribution

- [ ] 6.1 In the bridge handler, extract the hostname from `scriptUrl`. Check first-party: if the hostname is the page's own host or a subdomain, ignore the report.
  - Req: 14
  - Test: `test/vampire/attribution.test.ts` → `"first-party caller is ignored"`.

- [ ] 6.2 If not first-party, call `matchTracker(host, data, siteHost)`. If it returns a company name, call `onVampire(company, api)`. If it returns null (unlisted third-party), call `onVampire(host, api)` (vampire named by host).
  - Req: 14
  - Test: `test/vampire/attribution.test.ts` → `"known tracker host resolves to company"`, `"unlisted third-party host becomes vampire named by host"`.

- [ ] 6.3 Verify that a spoofed CustomEvent can only change the costume. The Exorcise domain whitelist in `router.ts` (`ownedDomains`) validates against `trackers.json` and is unchanged.
  - Req: 19, 47
  - Test: `test/vampire/attribution.test.ts` → `"spoofed report for unlisted host cannot cause DNR block"`.

## 7. Vampire Merge

- [ ] 7.1 Create `mergeVampire(companies, company, api)` that extends an existing `CompanyHit` with the caught API (deduplicated), or creates a new `CompanyHit` for an unlisted host with `count: 0`, `domains: [host]`, `categories: []`, `fingerprinting: 0`, `vampire: { caught: [api], knownOnly: false }`.
  - Req: 23
  - Test: `test/vampire/merge.test.ts` → `"caught report extends existing company vampire.caught (deduplicated)"`, `"caught report for unlisted host creates new CompanyHit with count 0"`.

- [ ] 7.2 Create `markKnownVampires(companies)` that sets `vampire: { caught: [], knownOnly: true }` on companies with `fingerprinting >= 2` and no caught APIs. A company that is both caught and has `fingerprinting >= 2` keeps `knownOnly: false`.
  - Req: 21, 22
  - Test: `test/vampire/merge.test.ts` → `"known vampire (fingerprinting ≥ 2, not caught) gets knownOnly: true"`, `"caught vampire with fingerprinting ≥ 2 keeps knownOnly: false"`.

## 8. Vampire Sprite and Art

- [ ] 8.1 Add the `VAMPIRE` sprite (16×18 art grid) and `vampireLegend` to `src/content/costume/art.ts`. Cape with `#660000` lining, `#ff0033` eyes, body `#ffffff`.
  - Req: 25
  - Test: `test/vampire/sprite.test.ts` → `"vampire sprite is 16×18 with correct palette colours"`.

- [ ] 8.2 Create `src/content/costume/vampires.ts` with `vampireSvg(company)` and `updateVampires(lanes, vampires, slots, opts)` that places vampire sprites in `#lanes` after ghosts, using the existing `planSlots` logic.
  - Req: 24
  - Test: `test/vampire/sprite.test.ts` → `"vampires placed after ghosts in lanes"`, `"vampires use planSlots text-rect checks"`.

- [ ] 8.3 The vampire glow is `filter: drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999)`.
  - Req: 26
  - Test: `test/vampire/sprite.test.ts` → `"vampire glow filter matches DESIGN.md"`.

- [ ] 8.4 The vampire label follows the ghost label style (Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis), showing the company or host name.
  - Req: 27
  - Test: `test/vampire/sprite.test.ts` → `"vampire label shows company/host name with correct style"`.

- [ ] 8.5 A "known" vampire renders with 60% opacity and no glow filter. Add CSS class `.vampire.known`.
  - Req: 28
  - Test: `test/vampire/sprite.test.ts` → `"known vampire has opacity 0.6 and no glow"`.

- [ ] 8.6 Add CSS for `.vampire` to `src/content/costume/styles.ts`: glow filter, label, drift animation (`hg-vampire-bob` ±2px/3000ms), known state.
  - Req: 26, 35
  - Test: `test/vampire/sprite.test.ts` → `"vampire CSS has glow, label, drift, known styles"`.

## 9. Vampire Card

- [ ] 9.1 Extend `openCard` in `src/content/costume/card.ts` (or add `openVampireCard`) to handle vampire hits. Title bar `#660000`, titled `Vampire identified`, with the same `[x]` close button.
  - Req: 29, 30
  - Test: `test/vampire/card.test.ts` → `"vampire card title bar is #660000 titled Vampire identified"`.

- [ ] 9.2 Card body shows the script host (wraps at `/`). For caught: `Caught doing:` + list of APIs, and `Caught since you haunted this page`. For known: `Known to fingerprint` (no caught line).
  - Req: 31, 32, 33
  - Test: `test/vampire/card.test.ts` → `"caught card shows Caught doing and honest line"`, `"known card shows Known to fingerprint"`.

- [ ] 9.3 If the vampire's company is a known tracker (in `trackers.json`), show `[Exorcise <company>]` button. If unlisted, no Exorcise button.
  - Req: 31, 39
  - Test: `test/vampire/card.test.ts` → `"known tracker vampire card has Exorcise button"`, `"unlisted host vampire card has no Exorcise button"`.

- [ ] 9.4 Esc closes the card and returns focus to the opener. Only one card open at a time.
  - Req: 49
  - Test: `test/vampire/card.test.ts` → `"Esc closes vampire card and returns focus"`.

## 10. Haunt-Moment, HUD, and Popup

- [ ] 10.1 Modify `src/content/costume/haunt-moment.ts` `playHaunt()` to add a vampire phase at 1800ms: `.vampire` elements fade in (`opacity: 0 → 1`, `translateY(8px) → 0`) over 300ms, then a single glow swell on `.vampire:not(.known) .sprite` (drop-shadow 0 → 6px). One swell, no pulsing.
  - Req: 34
  - Test: `test/vampire/haunt-moment.test.ts` → `"vampires fade in at 1800ms with single glow swell"`.

- [ ] 10.2 Under reduced motion, vampires appear at full opacity at 300ms with the cross-fade, no glow swell, no drift.
  - Req: 53, 54
  - Test: `test/vampire/reduced-motion.test.ts` → `"reduced motion: vampires appear instantly, no swell or drift"`.

- [ ] 10.3 Modify `renderCostume()` to pass the vampire count to `setCounts`: `vampires: companies.filter(c => c.vampire).length`.
  - Req: 36, 37
  - Test: `test/vampire/hud.test.ts` → `"HUD vampire count reflects number of vampire companies"`.

- [ ] 10.4 Modify `src/popup/screens.ts` haunted screen to list vampires after ghosts. Each row: 32px icon tile (vampire sprite), company/host name (15px ink), short line (13px muted: caught APIs or `Known to fingerprint`), and a pill: `Caught` (`#f1ecfb`/`#6633cc`) or `Known` (`#e3e6ec`/`#5b6170`).
  - Req: 38
  - Test: `test/vampire/popup.test.ts` → `"vampire row has icon, name, sub-line, Caught/Known pill"`.

- [ ] 10.5 When the vampire is a known tracker company, the row shows an `[Exorcise]` secondary button. When unlisted, no Exorcise button.
  - Req: 39
  - Test: `test/vampire/popup.test.ts` → `"known tracker vampire row has Exorcise button"`, `"unlisted vampire row has no Exorcise button"`.

- [ ] 10.6 When no vampires are found, the list shows `No vampires. Your blood is safe.`
  - Req: 40
  - Test: `test/vampire/popup.test.ts` → `"empty vampire list shows correct message"`.

## 11. Render Integration

- [ ] 11.1 Modify `src/content/costume/render.ts` to create a `VampireBridge`, start it with the nonce received from the `{ type: "vampires", nonce }` message (not from session storage, which the content script cannot read), and wire `onVampire` to merge vampire info and update sprites + HUD + popup.
  - Req: 17, 23, 36, 4c
  - Test: `test/vampire/integration.test.ts` → `"renderCostume starts vampire bridge on receiving { type: vampires, nonce } message"`.

- [ ] 11.2 After each scanner update, call `markKnownVampires` to flag companies with `fingerprinting >= 2` as known vampires.
  - Req: 21, 37
  - Test: `test/vampire/integration.test.ts` → `"scanner update marks known vampires"`.

- [ ] 11.3 On un-haunt, stop the vampire bridge (removes the CustomEvent listener). The background dispatches `<nonce>:restore` to restore prototypes (see task 4.2).
  - Req: 41, 43
  - Test: `test/vampire/integration.test.ts` → `"onUnhaunt stops vampire bridge"`.

- [ ] 11.4 Vampires are placed in `#lanes` after ghosts, sorted by company name. Known vampires render at 60% opacity with no glow.
  - Req: 24, 28
  - Test: `test/vampire/integration.test.ts` → `"vampires placed after ghosts, known at 60% opacity"`.

## 12. Non-Destructive DOM and Accessibility

- [ ] 12.1 Verify the hooks never modify, add, or remove any page DOM node, form element, or script tag.
  - Req: 44
  - Test: `test/vampire/non-destructive.test.ts` → `"no page DOM nodes modified outside shadow host"`.

- [ ] 12.2 Verify every wrapper returns the same result and throws the same exceptions as the original.
  - Req: 45
  - Test: `test/vampire/hooks.test.ts` → `"wrapper returns same result as original"`, `"wrapper rethrows same exception"`.

- [ ] 12.3 After un-haunt, `document.documentElement.outerHTML` is byte-identical. No wrapper, listener, or data structure remains.
  - Req: 43
  - Test: `test/vampire/non-destructive.test.ts` → `"outerHTML byte-identical after unhaunt"`.

- [ ] 12.4 All vampire sprites are keyboard reachable with visible focus indicators (costume focus ring).
  - Req: 48
  - Test: `test/vampire/accessibility.test.ts` → `"vampire sprites are focusable with focus ring"`.

- [ ] 12.5 Vampire card buttons are keyboard reachable; Esc closes the card.
  - Req: 49
  - Test: `test/vampire/accessibility.test.ts` → `"vampire card buttons keyboard reachable, Esc closes"`.

- [ ] 12.6 Popup vampire rows and pills are keyboard reachable with the popup focus ring.
  - Req: 50
  - Test: `test/vampire/accessibility.test.ts` → `"popup vampire rows keyboard reachable with #6633cc focus ring"`.

- [ ] 12.7 HUD and overlay text meets 4.5:1 contrast. No flashing/strobing faster than 3 Hz in vampire elements.
  - Req: 51, 52
  - Test: `test/vampire/accessibility.test.ts` → `"vampire text meets 4.5:1 contrast"`, `"no vampire animation period under 333ms"`.

## 13. Fixture and E2E Tests

- [ ] 13.1 Create `fixtures/vampires.html` with a sign-up form (email field + submit button). Include two scripts served from hosts mapped by `--host-resolver-rules`: one tracker host from `trackers.json` with `fingerprinting: 0`, one unlisted host (not in `trackers.json`). Both scripts fingerprint canvas (fillText + getImageData + toDataURL), audio (OfflineAudioContext + startRendering), and fonts (20+ distinct font families via ctx.font + measureText) when the email field gets focus.
  - Req: 58
  - Test: `e2e/vampires.spec.ts` → `"fixture page has sign-up form with fingerprinting scripts"`.

- [ ] 13.2 Create `e2e/vampires.spec.ts` that launches Chromium with `--host-resolver-rules` mapping the tracker and unlisted hosts to `127.0.0.1`. Haunt the fixture page, focus the email field, and assert caught vampires appear in `#lanes` inside the shadow root.
  - Req: 24, 59
  - Test: `e2e/vampires.spec.ts` → `"caught vampires appear after haunt and focus"`.

- [ ] 13.3 Assert the vampire card opens with `Caught doing: canvas, audio, fonts` and the honest line `Caught since you haunted this page`.
  - Req: 31, 32, 59
  - Test: `e2e/vampires.spec.ts` → `"vampire card shows caught APIs and honest line"`.

- [ ] 13.4 Assert that `toDataURL()` returns the same data URL as before haunting (captured before haunt, compared after haunt).
  - Req: 6, 45, 59
  - Test: `e2e/vampires.spec.ts` → `"toDataURL returns same result before and after haunting"`.

- [ ] 13.5 Un-haunt. Assert that `HTMLCanvasElement.prototype.toDataURL` is identity-equal to the original (captured before haunt), and `getImageData`, `measureText`, `startRendering` are also restored.
  - Req: 42, 59
  - Test: `e2e/vampires.spec.ts` → `"prototypes restored after unhaunt (identity-equal)"`.

- [ ] 13.6 Assert `document.documentElement.outerHTML` is byte-identical after un-haunt.
  - Req: 43, 59
  - Test: `e2e/vampires.spec.ts` → `"outerHTML byte-identical after unhaunt"`.
