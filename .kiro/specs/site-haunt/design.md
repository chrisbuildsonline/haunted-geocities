# Design: Site Haunt

## Context

A haunt now ends with the document. This spec lets the background carry it across the pages of one site. The user chooses that with a separate button, **Haunt this whole site** (F26), which asks for access to that site. The default button, **Haunt this page**, never asks. The background keeps a per-tab site entry and re-injects the costume, quietly, on each new page of the site.

Steering references: `non-destructive-dom.md`, `product.md` and `tech.md` (permissions model, `storage.session`, MV3 worker), `accessibility-and-motion.md`, `structure.md`. Requirement numbers refer to `requirements.md`.

## Files

```
src/background/site-haunt.ts   # new: siteOf, onSite, siteOrigins (pure, no chrome)
src/background/router.ts       # followSite, dropSite, rehaunt, onUpdated, permissions events
src/data/types.ts              # siteKey, QUIET_FLAG, FOLLOW_SITE, TabState.site
src/content/index.ts           # reads and deletes the quiet flag
src/content/costume/render.ts  # renderCostume(doc, { quiet })
src/popup/app.ts, screens.ts   # two actions, request in the site click, FOLLOW_SITE, the site line
test/site-haunt.test.ts        # new; test/chrome-mock.ts gains permissions events
e2e/site-haunt.spec.ts         # new
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
| idle | `HAUNT` (from either button) | injection works | haunted-page | haunt entry, inject loud, hooks |
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

`dropSite` is the only place that calls `permissions.remove`. A `HAUNT` on an already haunted tab keeps today's behaviour (idempotent re-inject) and leaves the site entry alone. `HAUNT` itself is the same message from both buttons and never touches the site entry. Only `FOLLOW_SITE`, sent after the site button's granted request, moves haunted-page to haunted-site.

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
if (!shared && !links) await api.permissions.remove({ origins: siteOrigins(site) }).catch(() => undefined);
```

`unhaunt` and the `tabs.onRemoved` handler call it before they remove the haunt entry.

**`tabs.onUpdated(tabId, info, tab)`**: for `loading` and `complete` only, send `ping`. If it answers, return (same document, as today). Otherwise, with `site` and `haunted` read from storage:

- `complete`: when both are set, `rehaunt(tabId)`.
- `loading`: when both are set, `onSite(info.url ?? tab.url, site)` and `contains` is true, run `clearTab` then `rehaunt`. In every other case, `dropSite`, remove the haunt entry, `clearTab`.

**`rehaunt(tabId)`** keeps a `Set<number>` of tabs being injected and returns at once if the tab is in it (criterion 23). Otherwise it runs, in a `try`, `executeScript({ func: setQuiet })` (ISOLATED world, sets `globalThis[QUIET_FLAG] = true`), then `executeScript({ files: ["content.js"] })`, then `installVampireHooks`. `clearTab` removed the nonce, so the hooks get a new one (criterion 27). A failure is swallowed, because the `complete` event retries. `setQuiet` closes over nothing but the imported constant's literal, since `executeScript` serialises it. If the worker stops mid-injection the set is lost and `complete` retries, so nothing needs saving.

**`permissions.onRemoved`**: for each `site:` key whose origins are no longer contained, `dropSite`. The haunt entry stays, so the page is a one-page haunt (criterion 30). The event caused by our own `remove` finds nothing to drop.

## Content script

```ts
const quiet = g[QUIET_FLAG] === true;
delete g[QUIET_FLAG];
renderCostume(document, quiet ? { quiet: true } : undefined);
```

`renderCostume(doc = document, opts: { quiet?: boolean } = {})`. With `quiet` it takes the branch a hidden tab or reduced motion already takes: no haunt moment, no caption, settled at once (criterion 26). Deleting the flag first means a later Haunt click in the same document is loud.

## Popup

The idle screen's Haunt group box holds two actions (criteria 7 to 10). `screens.ts` takes a second callback, `onSite`.

- `Haunt this page`: `<button class="primary">`, always shown on an idle screen. It calls `act(current, false)`.
- `Haunt this whole site`: `<button class="btn site-haunt">`, shown only when `siteOf(state.url)` is not `null`. Under it, `<p class="muted site-hint" id="site-hint">Follows every link on SITE. Chrome asks once.</p>`, and the button has `aria-describedby="site-hint"`. It calls `act(current, true)`. `.btn` is the ordinary Win95 bevel already used by Exorcise, so no new colour is added. Only the page button has class `primary`.

In `act(current, wholeSite)`, for a tab that is not haunted and not restricted, with `site = wholeSite ? siteOf(current.url) : null`:

```ts
const asked = site ? Promise.resolve(api.permissions.request({ origins: siteOrigins(site) })).catch(() => false) : Promise.resolve(false);
opts.play?.("whoosh");                       // no await before either line: the gesture is live
setBusy(clicked);                            // both buttons disabled, only the clicked one aria-busy
busy = true; epoch++;
const [next, granted] = await Promise.all([ask("HAUNT"), asked]);
const final = granted === true && !next.error ? await ask("FOLLOW_SITE") : next;
```

The synchronous `request` call is wrapped in `try`, because Chrome can throw it outright, and that also gives one page. When `HAUNT` failed after a granted request, the popup calls `permissions.remove` for the site origins and ignores its error. The page button never reaches the `request` line: `site` is `null` for it. `ask` accepts `"FOLLOW_SITE"`. Both buttons stay disabled until the pair and the optional `FOLLOW_SITE` finish, then `busy = false` and one render (criterion 10). If the prompt closes the popup, nothing after the `await` runs and `permissions.onAdded` stores the entry. `NO_TAB` sets `site: null`.

`screens.ts`: when `screen === "haunted"` and `state.site`, a `<p class="site-line muted">Haunting all of SITE</p>` goes into `client` after `addressLine`. `.muted` already passes contrast. `popup.css` gets one rule for `.site-hint` spacing and no new colour.

## Interaction with other specs

- **scaffold**: `TabState` grows one field. The typechecker finds every literal that needs `site: null`.
- **runtime-vampires**: hooks go in again with a fresh nonce. Un-haunt restores them as before.
- **tombstones**: link checks stay opt-in. The `links` guard in `dropSite` keeps `http://*/*` for a user who turned them on.
- **sound-effects**: the whoosh stays on both Haunt clicks. A quiet rehaunt plays nothing.
- **costume-renderer**: the haunt moment is unchanged for the button. Only the quiet branch skips it.

## Known limits

- Haunt this whole site again after Un-haunt prompts again, because the permission was handed back.
- If `HAUNT` fails after a yes, the popup hands the access back at once (criterion 13). If the popup closed first, the permission stays until the user removes it in Chrome. No entry exists, so nothing follows.
- With `http://*/*` granted, `request` resolves `true` with no prompt and no `onAdded`. `FOLLOW_SITE` still stores the entry.

## Testing

**Unit (`test/site-haunt.test.ts`).** `test/chrome-mock.ts` has `permissions.request`, `granted`, `calls.request` and `calls.remove`. It gains `permissions.contains`, `onAdded`, `onRemoved` with `emit` helpers, `tabs.query({})`, and a `contentReply` that can reject `ping`.

- Pure: `siteOf` (case, one `www.`, port, `ftp:`, `chrome:`, garbage), `onSite` (exact, subdomain, `www` host, `evilnps.gov`, `nps.gov.evil.com`, IP and `localhost` exact only), `siteOrigins` (four patterns, two for IP and dotless).
- State machine: one test per table row, asserting storage keys, the `executeScript` order (quiet func, `content.js`, MAIN-world hooks with a new nonce) and `calls.remove`.
- Guards: `FOLLOW_SITE` on an un-haunted tab, off the site, with `contains` false, and from a content-script sender stores nothing. `onAdded` skips a tab with an entry and a partial grant. Two tabs on one site: the first drop makes no `remove`, the second does. Link-check origins granted: no `remove`. A rejecting `remove` does not throw. `loading` then `complete` injects once.
- Quiet: a second `content.js` run without the flag is loud. `renderCostume(doc, { quiet: true })` makes no haunt-moment elements.

**Popup (`test/popup.test.ts`).** The page button never calls `permissions.request`. The site button calls it before the first `sendMessage`, in the click's synchronous run. `true` gives `FOLLOW_SITE` after `HAUNT`. `false`, a rejection and a failed `HAUNT` give none. The hint names the site in lower case and is linked by `aria-describedby`. A `file:` or restricted tab has no site button. Exactly one `.primary` exists. Both buttons are disabled and the clicked one `aria-busy` until the permission promise resolves. The line shows for `site: "nps.gov"` and not for `null`.

**e2e (`e2e/site-haunt.spec.ts`).** Fixtures on `127.0.0.1:4321` get a link to a second fixture, and a link to `localhost:4321`, which is another site. The popup opens as a tab, and a spy on `permissions.request` counts calls. "No haunt moment" means none of its elements exist 200ms after the costume appears.

1. Page button: the page haunts, the spy shows no request, and the next page is clean.
2. Site button, then an internal link: the next page is haunted with no haunt moment, and the popup shows `Haunting all of 127.0.0.1`.
3. Site button, then the link to `localhost:4321`: the page is clean and both entries are gone. A reload on the site stays haunted, quietly.
4. Denied: a popup init script makes `permissions.request` resolve `false`. The first page haunts, the internal link leads to a clean page, and no line shows.

**Visual.** The popup's idle screen gains the second button and its hint, and the haunted screen gains one line. `bun run visual:baselines` regenerates both in Docker, and the PNGs are reviewed before they are committed.
