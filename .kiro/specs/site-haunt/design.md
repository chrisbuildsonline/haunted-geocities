# Design: Site Haunt

## Context

A haunt now ends with the document. This spec lets the background carry it across the pages of one site. The user chooses that with the one **Haunt page** button (F27, replacing the two buttons of F26), which asks for access to that site inside its click. The background keeps a per-tab site entry and re-injects the costume, quietly, on each new page of the site. A dynamic content script, `cover.js`, covers each new page with a loading screen until the costume is in, so the original page never flashes.

Steering references: `non-destructive-dom.md`, `product.md` and `tech.md` (permissions model, `storage.session`, MV3 worker), `accessibility-and-motion.md`, `structure.md`. Requirement numbers refer to `requirements.md`.

## Files

```
src/background/site-haunt.ts   # new: siteOf, onSite, siteOrigins (pure, no chrome)
src/background/router.ts       # followSite, dropSite, rehaunt, onUpdated, permissions events, cover registration, COVER_CHECK
src/background/cover-script.ts # new (if router.ts passes 300 lines): registerCover, unregisterCover, setMarker
src/data/types.ts              # siteKey, QUIET_FLAG, COVER_MARKER, COVER_DONE, FOLLOW_SITE, COVER_CHECK, TabState.site
src/content/index.ts           # reads and deletes the quiet flag, calls the cover hook, removes the marker on un-haunt
src/content/costume/render.ts  # renderCostume(doc, { quiet })
src/cover/index.ts             # new: built as cover.js, an IIFE like content.js; the hg-cover element
src/popup/app.ts, screens.ts   # one button, request in its click, FOLLOW_SITE, the note, the site line
vite.config.ts                 # a cover entry beside content, same IIFE settings
test/site-haunt.test.ts        # new; test/chrome-mock.ts gains permissions events and scripting registration
test/cover.test.ts             # new
e2e/site-haunt.spec.ts         # new
design/DESIGN.md               # a "Page-change cover" section (task 9.1)
src/manifest.ts                # e2e build only: https host_permissions for 127.0.0.1 and localhost
```

The shipping manifest does not change. The e2e build already lists `http://127.0.0.1/*` and `http://localhost/*`. It gains their `https://` twins so `permissions.request` resolves `true` without a prompt, which Playwright cannot click. `test/manifest.test.ts` is updated for the e2e list only.

## Module: `src/background/site-haunt.ts`

```ts
export function siteOf(url: string | undefined | null): string | null;
export function onSite(url: string | undefined | null, site: string): boolean;
export function siteOrigins(site: string): string[];
```

`siteOf` parses with `new URL`, returns `null` on a throw or a protocol other than `http:` and `https:`, takes `hostname` (already lower case, port dropped) and strips one `^www\.` (criteria 1, 2).

`isBare(site)` is private: true for an IPv4 literal, an IPv6 literal (contains `:`) or a host with no `.`.

```ts
onSite = (url, site) => { const h = siteOf(url); return !!h && (h === site || (!isBare(site) && h.endsWith("." + site))); };
siteOrigins = (site) => isBare(site) ? [`http://${site}/*`, `https://${site}/*`]
  : [`http://${site}/*`, `https://${site}/*`, `http://*.${site}/*`, `https://*.${site}/*`];
```

The `"." + site` test keeps `evilnps.gov` out (criterion 3). Match patterns ignore ports, so `localhost:4321` and `localhost:3000` are one site, as Chrome grants them. The module imports nothing from `chrome`, so the popup and the background share it.

## Types

```ts
export const siteKey = (tabId: number) => `site:${tabId}`;   // storage.session, a string
export const QUIET_FLAG = "__hauntedGeoCitiesQuiet";
PopupRequest += { type: "FOLLOW_SITE"; tabId: number }
TabState     += site: string | null
```

`FOLLOW_SITE` is a `PopupRequest` only. `handle` ignores it when `sender.tab` is set and the sender is not an extension page (criterion 42). The site is never read from the message.

## State machine

The state is derived from storage. `idle` has no haunt entry, `haunted-page` has `haunt:<id>` and no `site:<id>`, `haunted-site` has both.

| From | Event | Guard | To | Action |
| --- | --- | --- | --- | --- |
| idle | `HAUNT` (the one button) | injection works | haunted-page | haunt entry, inject loud, hooks |
| idle | `HAUNT` | injection fails | idle | remove haunt entry, return error |
| haunted-page | `FOLLOW_SITE` | URL on its site, `contains` true | haunted-site | set `site:<id>` |
| haunted-page | `FOLLOW_SITE` | a guard is false | haunted-page | none |
| haunted-page | `permissions.onAdded` | added origins include all of the tab's site origins | haunted-site | set `site:<id>` |
| haunted-page | `UNHAUNT`, tab closed | | idle | restore hooks, remove entry, `clearTab` |
| haunted-page | new document | | idle | remove entry, `clearTab` |
| haunted-site | new document (loading, no ping answer) | URL on site, origins contained | haunted-site | `clearTab`, quiet inject, hooks |
| haunted-site | new document | URL off site, or origins not contained | idle | `dropSite`, remove entry, `clearTab` |
| haunted-site | `complete`, no ping answer | | haunted-site | quiet inject, hooks (retry) |
| haunted-site | `loading` or `complete`, ping answered | | haunted-site | none |
| haunted-site | `UNHAUNT`, tab closed | | idle | `dropSite`, then as haunted-page |
| haunted-site | `permissions.onRemoved` | origins no longer contained | haunted-page | `dropSite` |

`dropSite` is the only place that calls `permissions.remove` and `unregisterCover`. A `HAUNT` on an already haunted tab keeps today's behaviour (idempotent re-inject) and leaves the site entry alone. `HAUNT` never touches the site entry. Only `FOLLOW_SITE` (after the click's granted request), or `permissions.onAdded` when the prompt closed the popup, moves haunted-page to haunted-site.

The cover adds three effects to rows that already exist, and no new state. Entering haunted-site (`FOLLOW_SITE`, `onAdded`) runs `registerCover(site)` and `setMarker(tabId)`. A quiet re-haunt runs `setMarker` before `content.js`. Leaving haunted-site (`dropSite`, which `onRemoved` also calls for each entry it drops) runs `unregisterCover(site)` when no other tab follows the site. `onStartup` unregisters every `cover-` script. A denied request never reaches haunted-site, so nothing is registered.

## Router (`src/background/router.ts`)

`getState` adds `site` (the entry while haunted, else `null`); the error fallback in `register` sets `site: null`. If `router.ts` passes 300 lines, the new functions move to `src/background/follow.ts`, with the shared helpers passed in.

**`followSite(tabId)`**, called by `handle` for `FOLLOW_SITE`, then `getState`:

```ts
const tab = await api.tabs.get(tabId);
const site = siteOf(tab.url || tab.pendingUrl);
if (!site || !(await isHaunted(tabId))) return;
if (!(await api.permissions.contains({ origins: siteOrigins(site) }))) return;
await session.set({ [siteKey(tabId)]: site });
```

**`permissions.onAdded`** (criterion 16): for each tab from `tabs.query({})` that is haunted and has no site entry, take `siteOf(tab.url)` and store the entry if every pattern of `siteOrigins(site)` is among the added origins (string comparison). A grant of `http://*/*` alone does not match; `FOLLOW_SITE` covers that through `contains`. When the popup is still open, both paths write the same value.

**`dropSite(tabId)`**:

```ts
const site = (await session.get(siteKey(tabId)))[siteKey(tabId)];
if (typeof site !== "string") return;                    // no entry, no permissions call
await session.remove(siteKey(tabId));                    // first, so "another tab" excludes this one
const shared = Object.entries(await session.get(null)).some(([k, v]) => k.startsWith("site:") && v === site);
const links = await api.permissions.contains({ origins: LINK_CHECK_ORIGINS }).catch(() => false);
if (!shared) await unregisterCover(site);                // the script goes even when the access stays
if (!shared && !links) await api.permissions.remove({ origins: siteOrigins(site) }).catch(() => undefined);
```

`unhaunt` and the `tabs.onRemoved` handler call it before they remove the haunt entry. `permissions.onRemoved` calls it for each entry it finds uncovered, instead of removing the key alone, so the registration goes with the access.

**Cover registration.** `registerCover(site)` and `unregisterCover(site)` wrap `chrome.scripting`, swallow errors, and are idempotent:

```ts
const id = "cover-" + site;
if ((await api.scripting.getRegisteredContentScripts({ ids: [id] })).length) return;
await api.scripting.registerContentScripts([{ id, matches: siteOrigins(site), js: ["cover.js"],
  runAt: "document_start", allFrames: false, persistAcrossSessions: false }]);
```

`followSite` and the `onAdded` path call `registerCover(site)` and `setMarker(tabId)` after they store the entry. `setMarker` is an ISOLATED-world `executeScript({ func: (k) => sessionStorage.setItem(k, "1"), args: [COVER_MARKER] })` and ignores a failure. `rehaunt` calls it in the same `try`, before the quiet flag. `onStartup` first unregisters every script whose id starts with `cover-` (`getRegisteredContentScripts`, then `unregisterContentScripts({ ids })`), then does what it did before. Registration needs the granted site origins and nothing else: `cover.js` is named by no manifest key, so `web_accessible_resources` is not needed.

**`COVER_CHECK`.** A runtime message `{ type: "COVER_CHECK" }` from a content script. It is handled in the `onMessage` listener before `handle`, answers a boolean instead of a `TabState`, and `tabOf` is not used: the tab is `sender.tab.id`, and a message from an extension page gets `false`. The answer is `haunted && !!site && onSite(sender.tab.url, site)`, all read from storage and the sender's own tab URL.

**`tabs.onUpdated(tabId, info, tab)`**: for `loading` and `complete` only, send `ping`. If it answers, return (same document, as today). Otherwise, with `site` and `haunted` read from storage:

- `complete`: when both are set, `rehaunt(tabId)`.
- `loading`: when both are set, `onSite(info.url ?? tab.url, site)` and `contains` is true, run `clearTab` then `rehaunt`. In every other case, `dropSite`, remove the haunt entry, `clearTab`.

**`rehaunt(tabId)`** keeps a `Set<number>` of tabs being injected and returns at once if the tab is in it (criterion 23). Otherwise it runs, in a `try`, `executeScript({ func: setQuiet })` (ISOLATED world, sets `globalThis[QUIET_FLAG] = true`), then `executeScript({ files: ["content.js"] })`, then `installVampireHooks`. `clearTab` removed the nonce, so the hooks get a new one (criterion 27). A failure is swallowed, because the `complete` event retries. `setQuiet` closes over nothing but the imported constant's literal, since `executeScript` serialises it. If the worker stops mid-injection the set is lost and `complete` retries, so nothing needs saving.

**`permissions.onRemoved`**: for each `site:` key whose origins are no longer contained, `dropSite` (so the cover registration goes too). The haunt entry stays, so the page is a one-page haunt (criterion 30). The event caused by our own `remove` finds nothing to drop.

## Content script

```ts
const quiet = g[QUIET_FLAG] === true;
delete g[QUIET_FLAG];
renderCostume(document, quiet ? { quiet: true } : undefined);
if (quiet) afterPaint(() => (g[COVER_DONE] as undefined | (() => void))?.());   // two animation frames
```

`renderCostume(doc = document, opts: { quiet?: boolean } = {})`. With `quiet` it takes the branch a hidden tab or reduced motion already takes: no haunt moment, no caption, settled at once (criterion 26). Deleting the flag first means a later Haunt click in the same document is loud. The cover hook goes after two animation frames, so the costume is painted under the cover before the fade starts. `leaveCostume` removes the marker (`sessionStorage.removeItem`, in a `try`) and calls the hook with `true`, which removes the cover at once.

## Cover (`src/cover/index.ts`, built as `cover.js`)

Built as an IIFE next to `content.js`, with its own Vite entry: injected files cannot import. It runs in the ISOLATED world, shares its global with `content.js`, and reads no page script state.

```
run():
  marked = sessionStorage.getItem(COVER_MARKER) === "1"     // synchronous; wrapped in try (storage can throw)
  if marked: show()
  ask = runtime.sendMessage({ type: "COVER_CHECK" })        // rejection counts as false
  ask true  -> show()   (no-op if already shown)
  ask false -> hide(true) and, when marked, removeItem(COVER_MARKER)
  globalThis[COVER_DONE] = (now?: boolean) => hide(now === true)
  runtime.onMessage: { type: "unhaunt" } -> hide(true); never answers
show(): append <hg-cover> to documentElement once; start the 3000ms timer
hide(now): clear the timer; with reduced motion or now, remove at once; else fade opacity over 200ms, then remove
```

`hg-cover` is defined with `customElements.define` and has a closed shadow root (the same pattern as `hg-crypt`). If `documentElement` is missing, `show` waits for it with one `MutationObserver` and disconnects it. The root styles are `position: fixed; inset: 0; z-index: 2147483647; pointer-events: auto` while shown. The page is not made `inert`, nothing takes focus, and the cover has no `tabindex`, link or button. The ghost is a small pixel-art element drawn as in the costume sprites, the label is `<p role="status">Loading crypt…</p>`, and the bar is a sunken Win95 trough with blue blocks that step across (3 Hz at most). `@media (prefers-reduced-motion: reduce)` turns off the bob, the blocks and the fade. The look is specified in `design/DESIGN.md` (task 9.1). A subdomain has no marker, so its cover appears after the `COVER_CHECK` round trip and may follow one first frame. The 3000ms cap keeps a failed re-haunt from leaving the page covered.

## Popup

The idle screen's Haunt group box holds one button (criteria 7 to 10). `screens.ts` loses the `onSite` callback and the `.site-haunt` button. It keeps `onPrimary`.

- `Haunt page`: `<button class="primary" aria-describedby="site-note">`, always shown on an idle screen. It calls `act(current)`.
- When `siteOf(state.url)` is not `null`, under it: `<p class="muted site-note" id="site-note">Chrome may ask once to let the haunt follow you around SITE.</p>`. Without a site the button has no `aria-describedby` and there is no note.

In `act(current)`, for a tab that is not haunted and not restricted, with `site = siteOf(current.url)`:

```ts
let asked: Promise<boolean> = Promise.resolve(false);
try { if (site) asked = Promise.resolve(api.permissions.request({ origins: siteOrigins(site) })).catch(() => false); } catch {}
opts.play?.("whoosh");                       // no await before either line: the gesture is live
setBusy();                                   // the button is disabled and aria-busy
busy = true; epoch++;
const [next, granted] = await Promise.all([ask("HAUNT"), asked]);
const final = granted === true && !next.error ? await ask("FOLLOW_SITE") : next;
```

A throw from `request` gives one page, as does `false` or a rejection. When `HAUNT` failed after a granted request, the popup calls `permissions.remove` for the site origins and ignores its error. `ask` accepts `"FOLLOW_SITE"`. The button stays disabled until the pair and the optional `FOLLOW_SITE` finish, then `busy = false` and one render (criterion 10). If the prompt closes the popup, nothing after the `await` runs and `permissions.onAdded` stores the entry and registers the cover. `NO_TAB` sets `site: null`. Un-haunt uses the same `act` and asks for nothing.

`screens.ts`: when `screen === "haunted"` and `state.site`, a `<p class="site-line muted">Haunting all of SITE</p>` goes into `client` after `addressLine`. `.muted` already passes contrast. `popup.css` renames the `.site-hint` spacing rule to `.site-note` and adds no colour.

## Interaction with other specs

- **scaffold**: `TabState` grows one field. The typechecker finds every literal that needs `site: null`.
- **runtime-vampires**: hooks go in again with a fresh nonce. Un-haunt restores them as before.
- **tombstones**: link checks stay opt-in. The `links` guard in `dropSite` keeps `http://*/*` for a user who turned them on. The cover does not depend on it.
- **sound-effects**: the whoosh stays on the Haunt click. A quiet rehaunt and the cover play nothing.
- **costume-renderer**: the haunt moment is unchanged for the click and the cover never shows for it. Only the quiet branch skips it, and it tells the cover to go.
- **accessibility-and-motion**: the cover is static under reduced motion and flashes at most 3 Hz.

## Known limits

- Haunt page again after Un-haunt prompts again, because the permission was handed back.
- If `HAUNT` fails after a yes, the popup hands the access back at once (criterion 13). If the popup closed first, the permission stays until the user removes it in Chrome. No entry exists, so nothing follows.
- With `http://*/*` granted, `request` resolves `true` with no prompt and no `onAdded`. `FOLLOW_SITE` still stores the entry.
- The cover cannot appear before the page's first frame on a subdomain of the haunted site, because it has no marker (criterion 53).

## Testing

**Unit (`test/site-haunt.test.ts`).** `test/chrome-mock.ts` has `permissions.request`, `granted`, `calls.request` and `calls.remove`. It gains `permissions.contains`, `onAdded`, `onRemoved` with `emit` helpers, `tabs.query({})`, a `contentReply` that can reject `ping`, and `scripting.registerContentScripts`, `getRegisteredContentScripts` and `unregisterContentScripts` with a `scripts` map.

- Pure: `siteOf` (case, one `www.`, port, `ftp:`, `chrome:`, garbage), `onSite` (exact, subdomain, `www` host, `evilnps.gov`, `nps.gov.evil.com`, IP and `localhost` exact only), `siteOrigins` (four patterns, two for IP and dotless).
- State machine: one test per table row, asserting storage keys, the `executeScript` order (marker, quiet func, `content.js`, MAIN-world hooks with a new nonce) and `calls.remove`.
- Guards: `FOLLOW_SITE` on an un-haunted tab, off the site, with `contains` false, and from a content-script sender stores nothing and registers nothing. `onAdded` skips a tab with an entry and a partial grant. Two tabs on one site: the first drop makes no `remove` and no `unregister`, the second does. Link-check origins granted: no `remove`, but the script is unregistered. A rejecting `remove` or `register` does not throw. `loading` then `complete` injects once.
- Cover: a follow registers `cover-SITE` with the exact options of criterion 49, once. A drop and `onStartup` unregister. `COVER_CHECK` answers true for a haunted tab on its site, false for an un-haunted tab, a tab off the site, an extension page and a body tab id.
- Quiet: a second `content.js` run without the flag is loud. `renderCostume(doc, { quiet: true })` makes no haunt-moment elements.

**Cover (`test/cover.test.ts`).** In happy-dom with a mock `chrome.runtime`: marker and `true` shows the cover once; marker and `false` removes the cover and the marker; no marker and `true` shows it; no marker and `false` never does; a rejected check counts as false; the removal hook fades 200ms, removes at once with `true` and under reduced motion; 3000ms removes it (fake timers); the shadow root has no `a`, `button`, `input` or `[tabindex]`, a `role="status"` with `Loading crypt…`, and the page gets no `inert` and no focus change; an `unhaunt` message removes it and answers nothing.

**Popup (`test/popup.test.ts`).** One `.primary` and no `.site-haunt`. The click calls `request` before the first `sendMessage`, in the click's synchronous run. `true` gives `FOLLOW_SITE` after `HAUNT`. `false`, a rejection, a throw and a failed `HAUNT` give none. The note names the site in lower case and is linked by `aria-describedby`. A `file:` or restricted tab has no note and no request. The button is disabled and `aria-busy` until the permission promise resolves. The line shows for `site: "nps.gov"` and not for `null`.

**e2e (`e2e/site-haunt.spec.ts`).** Fixtures on `127.0.0.1:4321` get a link to a second fixture, and a link to `localhost:4321`, which is another site. The popup opens as a tab, and a spy on `permissions.request` counts calls. "No haunt moment" means none of its elements exist 200ms after the costume appears. A route delay on the second fixture's `content.js` is not needed: the cover is checked at `DOMContentLoaded` and with a `requestAnimationFrame` probe installed by `addInitScript` that records whether `hg-cover` existed at the page's first frame.

1. One button: the idle popup has `Haunt page` and no second Haunt button, and the note names `127.0.0.1`.
2. Click, then an internal link: the cover exists at `DOMContentLoaded` and at the first frame, then it is gone, the page is haunted with no haunt moment, and the popup shows `Haunting all of 127.0.0.1`. `getRegisteredContentScripts` lists `cover-127.0.0.1`.
3. Click, then the link to `localhost:4321`: the page is clean and both entries are gone, and the registration is gone. A reload on the site stays haunted, quietly, behind the cover.
4. Denied: a popup init script makes `permissions.request` resolve `false`. The first page haunts, the internal link leads to a clean page with no cover, and no line shows. No script is registered.
5. A second tab on the same site that was never haunted is never covered, with or without a copied `sessionStorage`. Un-haunt in the first tab removes the registration.

**Visual.** The popup's idle screen changes to one button and its note, and the haunted screen gains one line. `bun run visual:baselines` regenerates both in Docker, and the PNGs are reviewed before they are committed. The cover is not in the visual set: it shows for under 3 seconds and is covered by unit and e2e tests.
