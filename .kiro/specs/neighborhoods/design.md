# Design: Neighborhoods and popup polish (R9)

## Overview

Six small changes that share one theme: what the visitor reads should be true and should not repeat itself. The largest is the neighborhood resolver (a data file and a pure function). The others are a few lines each in the router, the popup, the ghost code and the card.

| Part | Where it lives | Pure part (unit-tested without Chrome) |
| --- | --- | --- |
| (a) Neighborhoods | `src/data/neighborhoods.json`, `src/data/neighborhood.ts`, `bands.ts`, `styles.ts`, `render.ts`, `popup/screens.ts` | `resolveNeighborhood` |
| (b) Toolbar badge | `src/background/badge.ts`, `router.ts` | `badgeText(count)` |
| (c) Permission prompt | `src/popup/settings.ts`, `src/popup/permissions.html`, `permissions.ts`, `permissions.css`, `vite.config.ts` | `renderPermissions(doc, api)` against a mock `chrome` |
| (d) Hem tints | `src/content/costume/ghosts.ts`, `src/popup/screens.ts` | `assignTints` |
| (e) Known vampire row | `src/popup/screens.ts` | none (a string) |
| (f) Footnote | `src/content/costume/card.ts` | none (a string) |

Steering and design references: see `requirements.md`.

## Assumptions

These choices fill gaps in the brief. Each is cheap to reverse.

- The resolver and its data live in `src/data/` because the content script and the popup both import them (`structure.md`: cross-cutting code goes there).
- A host with a `www.` prefix is the same site as without it. A port is not part of a host (`URL.hostname`).
- "Host-label keywords" match tokens of the labels before the last one. The last label is the TLD and is handled by the `tld` rules. So `shop.example.com` matches `shop`, and `example.shop` does not.
- Word matching is loose for long keywords on purpose (`coffeeshop.example` matches `shop`, `bandcamp.example` matches `band`). A costume may be silly. Keywords of 3 letters or fewer match whole tokens only, so `cat` does not fire on `education`.
- The first matching rule wins, and the file order is the precedence. A host such as `petshop.example` has the token `petshop`, which does not equal `pet` and, because `pet` is 3 letters, does not start with it. It matches `shop` and goes to `WallStreet`. This is accepted.
- The fixed addresses for `localhost` and IP literals are `Heartland/Homestead/1998` and `Area51/Hangar/1998`. The numbers are the year, a nod to the era.
- Tint adjacency is checked against the two previous ghosts in ghost order. Two back is the same-lane neighbour when the lanes alternate sides. Checking both makes one rule serve the lanes and the popup list.
- A ghost's tint can change when the ghost order changes (a new ghost arrives, counts re-sort). That one-time recolour is accepted. The alternative, a tint fixed by arrival order, would differ between the lanes and the popup.
- The badge counts everything the popup counts, so the badge, the popup tiles and the HUD agree. The tab's `ghosts` list includes vampires, so the sum is `companies.length + tombstones.length + curses.length`.
- The permissions page is a tab, not a popup. Chrome's permission dialog is attached to the window that asks, and it closes the toolbar popup. A tab survives it. This was seen with the current build: the switch turns on, the dialog opens, the popup closes, and the answer never arrives.
- `chrome.tabs.create` needs no permission, and opening an extension URL needs no `web_accessible_resources` entry.

## Neighborhoods

### Data file (`src/data/neighborhoods.json`)

```json
{
  "neighborhoods": [
    { "name": "Area51",        "tagline": "Strange lights, strange pages. Aliens welcome!", "suburbs": ["Hangar", "Roswell", "Dreamland", "GroomLake"] },
    { "name": "SiliconValley", "tagline": "Where the webmasters code all night.",           "suburbs": ["Heights", "Cupertino", "Sunnyvale", "PaloAlto"] },
    { "name": "Hollywood",     "tagline": "Lights, camera, homepage!",                      "suburbs": ["Boulevard", "Studios", "Burbank", "Vine"] },
    { "name": "Athens",        "tagline": "Home of the scholar and the term paper.",        "suburbs": ["Acropolis", "Agora", "Lyceum", "Plaka"] },
    { "name": "CapitolHill",   "tagline": "Your government, now with a guestbook.",         "suburbs": ["Monument", "Mall", "Rotunda", "Embassy"] },
    { "name": "WallStreet",    "tagline": "Bulls, bears and secure online shopping.",       "suburbs": ["Exchange", "Ledger", "Bullpen", "Treasury"] },
    { "name": "TimesSquare",   "tagline": "Games, arcades and one big flashing sign.",      "suburbs": ["Broadway", "Arcade", "Marquee", "Midway"] },
    { "name": "SunsetStrip",   "tagline": "Bands, beats and the loudest guestbook.",        "suburbs": ["Encore", "Backstage", "Laurel", "Riff"] },
    { "name": "Colosseum",     "tagline": "Sports, scores and bragging rights.",            "suburbs": ["Arena", "Gladiator", "Forum", "Bleachers"] },
    { "name": "MotorCity",     "tagline": "Start your engines, surf the highway.",          "suburbs": ["Assembly", "Roadster", "Dragstrip", "Garage"] },
    { "name": "Paris",         "tagline": "Cafes, fashion and fine cuisine.",               "suburbs": ["Montmartre", "Bastille", "LeMarais", "Latin"] },
    { "name": "SoHo",          "tagline": "Writers, artists and the daily news.",           "suburbs": ["Greene", "Spring", "Prince", "Loft"] },
    { "name": "Heartland",     "tagline": "Home, family and small-town pages.",             "suburbs": ["Homestead", "Prairie", "Mainstreet", "Orchard"] },
    { "name": "Petsburgh",     "tagline": "Cats, dogs and other good company.",             "suburbs": ["Kennel", "Meadow", "Aviary", "Catwalk"] },
    { "name": "RainForest",    "tagline": "Nature, travel and the great outdoors.",         "suburbs": ["Canopy", "Understory", "Riverbank", "Trailhead"] },
    { "name": "Tokyo",         "tagline": "Anime, manga and gadgets from the future.",      "suburbs": ["Shibuya", "Akihabara", "Harajuku", "Ginza"] }
  ],
  "rules": [
    { "kind": "tld",  "match": ["gov", "mil"],                                              "to": "CapitolHill" },
    { "kind": "tld",  "match": ["edu", "ac"],                                               "to": "Athens" },
    { "kind": "tld",  "match": ["jp"],                                                      "to": "Tokyo" },
    { "kind": "tld",  "match": ["fr"],                                                      "to": "Paris" },
    { "kind": "tld",  "match": ["dev"],                                                     "to": "SiliconValley" },
    { "kind": "word", "match": ["code", "dev", "github", "gitlab", "git", "software", "tech", "byte", "cloud"], "to": "SiliconValley" },
    { "kind": "word", "match": ["shop", "store", "bank", "pay", "trade", "market"],         "to": "WallStreet" },
    { "kind": "word", "match": ["game", "play", "arcade"],                                  "to": "TimesSquare" },
    { "kind": "word", "match": ["news", "blog", "write", "art", "design"],                  "to": "SoHo" },
    { "kind": "word", "match": ["music", "band", "radio", "song"],                          "to": "SunsetStrip" },
    { "kind": "word", "match": ["pet", "dog", "cat", "puppy", "kitten"],                    "to": "Petsburgh" },
    { "kind": "word", "match": ["film", "movie", "cinema", "tv", "video"],                  "to": "Hollywood" },
    { "kind": "word", "match": ["sport", "team", "league", "arena", "gym"],                 "to": "Colosseum" },
    { "kind": "word", "match": ["car", "auto", "motor", "bike", "drive"],                   "to": "MotorCity" },
    { "kind": "word", "match": ["food", "cafe", "coffee", "recipe", "fashion"],             "to": "Paris" },
    { "kind": "word", "match": ["anime", "manga", "tokyo"],                                 "to": "Tokyo" },
    { "kind": "word", "match": ["eco", "green", "garden", "nature", "travel", "hike"],      "to": "RainForest" },
    { "kind": "word", "match": ["farm", "home", "family", "church", "local"],               "to": "Heartland" },
    { "kind": "word", "match": ["space", "ufo", "lab", "science", "alien"],                 "to": "Area51" }
  ]
}
```

The `Heartland` fixed address uses `Homestead`, and `Area51` uses `Hangar`, so both are in the lists (requirement 2). The taglines above are all under 48 characters.

### Resolver (`src/data/neighborhood.ts`)

```ts
import data from "./neighborhoods.json";

export interface Neighborhood {
  name: string;
  tagline: string;
  suburb: string;
  number: number;
  /** `Neighborhood/Suburb/NNNN` */
  address: string;
}

interface Rule { kind: "tld" | "word"; match: string[]; to: string }
interface Entry { name: string; tagline: string; suburbs: string[] }

const LOCALHOST = { name: "Heartland", suburb: "Homestead", number: 1998 };
const IP_LITERAL = { name: "Area51", suburb: "Hangar", number: 1998 };

/** 32-bit FNV-1a (the hash the placeholder used). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}
```

`for (const c of s)` walks code points and `charCodeAt(0)` reads the first code unit, so an astral character is hashed by its high surrogate only. It is stable, which is all that matters.

```ts
export const normaliseHost = (host: string) =>
  host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[") || h.includes(":");

function tokenMatches(token: string, word: string): boolean {
  if (token === word || token === `${word}s`) return true;
  return word.length >= 4 && (token.startsWith(word) || token.endsWith(word));
}

function ruleMatches(rule: Rule, labels: string[]): boolean {
  if (rule.kind === "tld") {
    const tail = [labels[labels.length - 1], labels[labels.length - 2]];
    return tail.some((l) => l !== undefined && rule.match.includes(l));
  }
  const tokens = labels.slice(0, -1).flatMap((l) => l.split("-")).filter(Boolean);
  return tokens.some((t) => rule.match.some((w) => tokenMatches(t, w)));
}

export function resolveNeighborhood(host: string): Neighborhood {
  const h = normaliseHost(host);
  const fixed = isIp(h) ? IP_LITERAL : h === "localhost" || h.endsWith(".localhost") ? LOCALHOST : null;
  const hash = fnv1a(h);
  const labels = h.split(".");
  const rule = fixed ? undefined : (data.rules as Rule[]).find((r) => ruleMatches(r, labels));
  const entry = fixed
    ? entryNamed(fixed.name)
    : rule ? entryNamed(rule.to) : data.neighborhoods[hash % data.neighborhoods.length]!;
  const suburb = fixed ? fixed.suburb : entry.suburbs[fnv1a(`suburb:${h}`) % entry.suburbs.length]!;
  const number = fixed ? fixed.number : 1000 + ((hash >>> 8) % 9000);
  return { name: entry.name, tagline: entry.tagline, suburb, number, address: `${entry.name}/${suburb}/${number}` };
}
```

Notes:

- `entryNamed(name)` looks the entry up in `data.neighborhoods` (a `Map` built once at module load). A unit test proves every rule's `to` and both fixed names exist, so the lookup cannot miss.
- A two-label host such as `example.com` has one token source (`example`). A single-label host (`intranet`) has no tokens, because the only label is the last one, so it goes to the hash.
- Nothing in the function can throw: it uses string methods, `find`, `some` and arithmetic on any string.
- `tld` rules test the last label and the second-to-last. `agency.gov.uk` has `uk`, `gov`, so the `gov` rule matches. `tld` rules come first in the file, so `ac.jp` is `Athens` (the `edu`/`ac` rule is earlier than `jp`).

### Neighborhood bar (`bands.ts`, `styles.ts`, `render.ts`)

`buildBands(doc, n: Neighborhood)` builds:

```html
<div id="neighborhood">
  <span class="where">You are in: <b>SiliconValley/Heights/2049</b></span>
  <span class="tagline">Where the webmasters code all night.</span>
  <span class="sign" role="img" aria-label="Under construction"><span class="sign-strip"></span></span>
</div>
```

`b` and `.tagline` are filled with `textContent`. `neighborhoodFor` and the `AREAS` list are deleted. `render.ts` calls `resolveNeighborhood(win.location.hostname)` where it called `neighborhoodFor`.

Costume CSS (in `styles.ts`, next to the existing `#neighborhood` rules):

```css
#neighborhood .where   { flex: none; }
#neighborhood .tagline { flex: 1 1 0; min-width: 0; margin: 0 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#neighborhood .sign    { flex: none; }
@media (max-width: 479px) { #neighborhood .tagline { display: none; } }
```

The existing rule `#neighborhood { justify-content: space-between; ... }` stays. With the tagline taking the free space, `space-between` has nothing left to distribute, and the sign stays at the right edge. When the tagline is hidden, `space-between` puts the address left and the sign right, as today. A media query in a stylesheet inside a shadow root is evaluated against the viewport, which is what requirement 15 asks for.

Widths: the longest address is 28 characters (`SiliconValley/Cupertino/NNNN`, `SiliconValley/Sunnyvale/NNNN`). In Times New Roman 13px that is well under 250px with the `You are in: ` lead, so at 375px the address and the 48px sign fit with the tagline hidden. At 480px the tagline gets whatever is left and is cut with an ellipsis when it is longer. The e2e test measures that the bar has no horizontal overflow at 375px and that the tagline does not wrap at 500px.

Contrast: `#ffffcc` on `#330066` is above 14:1 (the same pair as today).

### Popup address line (`screens.ts`)

```ts
const addressOf = (url: string | null): string | null => {
  try {
    const host = url ? new URL(url).hostname : "";
    return host ? resolveNeighborhood(host).address : null;
  } catch { return null; }
};
```

On the haunted screen only, after the `h1`:

```ts
const address = addressOf(state.url);
const line = address ? h(doc, "p", { class: "address muted" }, address) : null;
```

`renderScreen` returns `[header, title, line?, ...surfaces, settings, attribution]`. CSS: `.address { margin-top: -8px; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }`. The negative margin pulls the line up into the 12px column gap so it reads as part of the title. `overflow-wrap: anywhere` keeps a long address inside the popup (it is one unbroken word). The popup imports the resolver from `../data/neighborhood`, so the popup and the costume always show the same address for a host.

## Toolbar badge

### New module `src/background/badge.ts`

```ts
export const BADGE_BG = "#6633cc";
export const BADGE_FG = "#ffffff";

/** "" at 0, the number up to 99, "99+" above. */
export const badgeText = (n: number) => (n <= 0 ? "" : n > 99 ? "99+" : String(n));

export function createBadge(api: typeof chrome) {
  /** Show `count` on the tab's icon. Never throws: a closed tab or a missing API only skips the badge. */
  async function show(tabId: number, count: number) {
    try {
      const text = badgeText(count);
      await api.action.setBadgeText({ tabId, text });
      if (text) {
        await api.action.setBadgeBackgroundColor({ tabId, color: BADGE_BG });
        await api.action.setBadgeTextColor({ tabId, color: BADGE_FG });
      }
    } catch { /* tab gone, or no action API in this context */ }
  }
  const clear = (tabId: number) => show(tabId, 0);
  return { show, clear };
}
```

Every call carries `tabId`. Colours are set only when the text is not empty, because an empty badge is not drawn.

### Router changes (`router.ts`)

```ts
const badge = createBadge(api);

/** Recount the tab's badge from what is stored. A tab that is not haunted gets none. */
async function refreshBadge(tabId: number) {
  if (!(await isHaunted(tabId))) return badge.clear(tabId);
  const tombs = (await session.get(tombstonesKey(tabId)))[tombstonesKey(tabId)] as DeadLink[] | undefined;
  const curses = (await session.get(cursesKey(tabId)))[cursesKey(tabId)] as Curse[] | undefined;
  await badge.show(tabId, (await reportedGhosts(tabId)).length + (tombs?.length ?? 0) + (curses?.length ?? 0));
}
```

- In `handle`, after the `session.set` of a `TRACKER_UPDATE`, `TOMBSTONE_UPDATE` and `CURSE_UPDATE`, call `await refreshBadge(tabId)`. The `break` before the `session.set` for a tab that is not haunted stays, so a dropped message changes nothing.
- In `clearTab`, add `await badge.clear(tabId)`. `clearTab` already runs on `UNHAUNT` (through `unhaunt`), on `CLEAR_EXORCISE`, in the `tabs.onRemoved` listener and in the `tabs.onUpdated` branch that detects a navigation or reload. One line covers requirement 24. A closed tab rejects `setBadgeText`; `show` swallows it.
- `refreshBadge` reads the same keys as `getState`, so the badge cannot disagree with the popup tiles (ghosts and vampires from the company list, plus tombstones, plus curses).
- The popup is not involved: the badge needs no new message.

The manifest already declares `action`. `setBadgeText` and the two colour calls need no permission.

## Link-check permission prompt

### Why the popup cannot ask

`chrome.permissions.request` shows Chrome's own dialog. Chrome closes the toolbar popup when that dialog takes focus. The `.then` in the current `settings.ts` never runs, so the switch stays on and the permission may or may not be granted. The fix moves the request to a page that is not closed by the dialog.

### Flow

```
popup (switch on)                      permissions.html (a tab)                Chrome
 ├─ tabs.create({ url })  ────────────▶ shown
 ├─ switch back to off, sub: "Finish on the page that just opened."
 │   (popup is usually closed by the new tab taking focus)
 │                                      user clicks "Allow link checks"
 │                                      ├─ permissions.request(origins) ──────▶ dialog
 │                                      │◀──────────────────────── granted / not
 │                                      └─ shows the result
popup (opens later)
 └─ permissions.contains(origins) ─▶ switch and sub line match reality
```

### Popup (`settings.ts`)

```ts
export const LINK_SUB = {
  off: "Asks Chrome to visit linked sites. Off.",
  on: "Checking links on other sites too.",
  ask: "Finish on the page that just opened.",
};

link.input.addEventListener("change", () => {
  if (link.input.checked) {
    void api.tabs.create({ url: api.runtime.getURL("permissions.html") });
    link.input.checked = false;          // not granted yet
    link.subEl.textContent = LINK_SUB.ask;
  } else {
    api.permissions.remove(origins).catch(() => false).then(() => { link.subEl.textContent = LINK_SUB.off; });
  }
});

// Follow the permission while the popup stays open (the e2e popup is a tab; a real popup usually closes).
const sync = (on: boolean) => { link.input.checked = on; link.subEl.textContent = on ? LINK_SUB.on : LINK_SUB.off; };
api.permissions.onAdded.addListener((p) => { if (p.origins?.length) void api.permissions.contains(origins).then(sync); });
api.permissions.onRemoved.addListener((p) => { if (p.origins?.length) void api.permissions.contains(origins).then(sync); });
```

`LINK_SUB.denied` is removed: the popup no longer learns the result. `createSettings` already calls `contains` once per popup load, and a popup is a new document on every open, so the switch matches reality each time (requirement 31). The listeners cover a popup that is still open. They re-read `contains` instead of trusting the event, because another origin could have been added.

### Page (`src/popup/permissions.html`, `permissions.ts`, `permissions.css`)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Check links to other sites</title>
    <script type="module" src="./permissions.ts"></script>
  </head>
  <body class="permissions">
    <main id="app"></main>
  </body>
</html>
```

`permissions.ts` imports `./styles.css` (the tokens: `--canvas`, `--surface`, `--radius`, the `.pill` button, the focus ring) and `./permissions.css`, then calls `renderPermissions(document, chrome)` (exported, so a test can call it with a mock). `permissions.css` overrides what the popup fixes for a 360px box:

```css
body.permissions { width: auto; max-height: none; display: grid; place-items: start center; padding: 48px 16px; }
body.permissions #app { width: 100%; max-width: 420px; padding: 0; }
```

The built DOM:

```html
<main id="app">
  <section class="surface" aria-label="Link checks">
    <h1 class="title">Check links to other sites</h1>
    <p class="muted">Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites.</p>
    <button type="button" class="pill" id="allow">Allow link checks</button>
    <p id="result" role="status" aria-live="polite"></p>
  </section>
</main>
```

```ts
export async function renderPermissions(doc: Document, api: typeof chrome) {
  // build the DOM above into #app
  const origins = { origins: LINK_CHECK_ORIGINS };
  if (await api.permissions.contains(origins).catch(() => false)) return done(RESULT.already);
  allow.addEventListener("click", () => {
    // No await before request(): it must run inside the click's user gesture.
    api.permissions.request(origins).catch(() => false).then((granted) => (granted ? done(RESULT.on) : (result.textContent = RESULT.refused)));
  });
}
const RESULT = {
  on: "Link checks are on. You can close this tab.",
  already: "Link checks are already on.",
  refused: "Chrome didn't allow it. Link checks stay off.",
};
// done(text): result.textContent = text; allow.disabled = true;
```

The page sends no message to the background and has no content script. The background's `checkCrossSite` already reads `permissions.contains` at the time of each check, so a grant takes effect on the next haunt or link scan with no further wiring.

The result text uses `.muted` with `role="status"`. The button keeps the popup `.pill` look (near-black `#111318` ground, white text, 4.5:1 or better) and its `:focus-visible` ring from `styles.css`. Nothing animates.

### Build (`vite.config.ts`)

Add the second HTML entry:

```ts
input: {
  popup: resolve(root, "src/popup/popup.html"),
  permissions: resolve(root, "src/popup/permissions.html"),
},
```

The root is `src/popup`, so the output is `dist/permissions.html` and `dist/permissions.js`. Both pages import `styles.css`. With `assetFileNames: "[name][extname]"` the shared CSS keeps one name; a build check (task 8.3) confirms both HTML files link a CSS file that exists in `dist/`. `scripts/package.ts` zips the whole build output, so the page ships without a change.

## Distinct hem tints

```ts
/** One tint per company, for companies in ghost order: the base tint, moved to the next tint until it differs from the two before. */
export function assignTints(companies: readonly string[]): string[] {
  const out: string[] = [];
  for (const company of companies) {
    const recent = out.slice(-2);
    let i = HEM_TINTS.indexOf(hemTint(company) as (typeof HEM_TINTS)[number]);
    while (recent.includes(HEM_TINTS[i]!)) i = (i + 1) % HEM_TINTS.length;
    out.push(HEM_TINTS[i]!);
  }
  return out;
}
```

With 6 tints and at most 2 excluded, the loop ends within 3 steps. `hemTint` is unchanged (and still exported): `assignTints` starts from it.

**Lanes (`updateGhosts`).** The non-vampire companies are already sorted by `byCountThenName` into `sorted`. Compute `const tints = new Map(...)` from `assignTints(ghostsInOrder.map(c => c.company))`. `ghostSvg(company)` becomes `ghostSvg(tint)`. A new element gets its sprite from its tint. An existing element stores `data-tint` and, when the new tint differs, replaces only the `.sprite` innerHTML. The element itself, its listeners, its `aria-label` and focus stay. (Replacing the children of `.sprite` does not move focus, which is on the button.) The overflow ghosts (beyond the slots) are included in the order, so a ghost's tint does not depend on how many slots there are.

**Popup (`screens.ts`).** `ghosts` is already sorted by `byCountThenName`. Compute `const tints = assignTints(ghosts.map(g => g.company))` and pass `tints[i]` to `ghostRow` (`tintedGhost(doc, tint)`). Vampires have their own sprite and are not in the order.

Why two back and not one: in the lanes, rows alternate left/right, so slot `i` sits beside slot `i-1` (the other lane, same row) and under slot `i-2` (the same lane, row above). In one lane (a page with a gutter on one side only), `i-1` is the neighbour above. The rule `differs from both` is right in every case, and the popup list gets the same colours.

## Known vampire row

In `vampireRow`, replace the sub line of the non-caught case:

```ts
h(doc, "span", { class: "row-sub" }, isCaught ? did[0]!.toUpperCase() + did.slice(1) : "On the Tracker Radar fingerprint list")
```

The `Known` pill (`tag-pill known`) is unchanged. The card line `Known to fingerprint (Tracker Radar)` and the lane `aria-label` `<company>, vampire, known to fingerprint` stay: neither sits next to a `Known` pill.

## Ghost card footnote

In `openCard` (`card.ts`) change the footnote string to `Blocked on this tab until you un-haunt or leave the page.` Why it is true: the block is a `declarativeNetRequest` session rule made for this tab. `Exorcist.clearTab` removes it. `clearTab` runs on `UNHAUNT`, when the tab closes and when `tabs.onUpdated` sees the tab load a new document (a reload or a navigation) that our content script no longer answers. A same-document change (a hash or `pushState`) keeps the haunted page, so the block stays, which matches "until you leave the page". The footnote is longer than the old one. The card is 248px wide and its body wraps, so the footnote takes two lines at most. The card's `max-height` and scroll already handle height.

## Files changed

| File | Change |
| --- | --- |
| `src/data/neighborhoods.json` | new |
| `src/data/neighborhood.ts` | new: `resolveNeighborhood`, `fnv1a`, `normaliseHost` |
| `src/content/costume/bands.ts` | remove `neighborhoodFor`, `buildBands` takes a `Neighborhood`, adds the tagline span |
| `src/content/costume/styles.ts` | tagline rules and the 480px media query |
| `src/content/costume/render.ts` | call `resolveNeighborhood` |
| `src/content/costume/ghosts.ts` | `assignTints`, `ghostSvg(tint)`, re-tint in `updateGhosts` |
| `src/content/costume/card.ts` | new footnote |
| `src/background/badge.ts` | new |
| `src/background/router.ts` | `refreshBadge` after three updates, `badge.clear` in `clearTab` |
| `src/popup/screens.ts` | address line, `assignTints`, known-vampire sub line |
| `src/popup/settings.ts` | open `permissions.html`, `onAdded`/`onRemoved` sync, drop `LINK_SUB.denied` |
| `src/popup/permissions.html`, `permissions.ts`, `permissions.css` | new |
| `src/popup/styles.css` | `.address` |
| `vite.config.ts` | second HTML entry |
| `design/DESIGN.md`, `README.md`, `test/readme.test.ts` | documentation (task 12) |
| existing tests that name the old strings or functions | updated in tasks 2.4, 4.1, 4.2, 5.2 and 7.3 |

Not changed: `src/manifest.ts` (no permission, no `web_accessible_resources`).

## Error handling

- The resolver cannot throw. The popup wraps `new URL(...)` in `try`, and shows no line for a URL it cannot parse.
- A `chrome.action` failure is caught inside `badge.show`. A message handler never fails because of the badge.
- If `chrome.tabs.create` fails, the switch stays off and the sub line reads `Finish on the page that just opened.` That is wrong in this rare case, so the `.catch` sets the sub line back to `LINK_SUB.off`.
- If `permissions.request` rejects or the user refuses, the page says so and keeps the button enabled.
- If `permissions.contains` rejects on the page, it is treated as not granted, and the button is shown.

## Test plan

| Area | Unit test file (`test/neighborhoods/`) | Notes |
| --- | --- | --- |
| Data | `data.test.ts` | 16 names in order, tagline rules, 4 suburbs each, rule targets exist, `tld` before `word`, required keywords |
| Resolver | `resolver.test.ts` | rules, precedence, normalisation, fixed addresses, hash fallback, address format |
| Properties | `properties.test.ts` | seeded: total, deterministic, number range, suburb membership, normalisation, `assignTints` |
| Bar | `bar.test.ts` | DOM, text, CSS rules, media query, `textContent` |
| Popup address | `popup.test.ts` | line present on haunted, absent on idle, restricted, no host; vampire sub line |
| Badge | `badge.test.ts` | text and colours, per-tab calls, clearing, errors swallowed, no manifest change |
| Permission flow | `permissions.test.ts` | popup opens the page, no `request` in the popup, `contains` on open, listeners, the page's request, results |
| Tints | `tints.test.ts` | `assignTints`, lanes re-tint, popup agreement |
| Footnote | `footnote.test.ts` | the exact string, update of `test/tracker/ghosts.test.ts` |
| E2E | `e2e/neighborhoods.spec.ts` | at 1280 and 375 |

The e2e popup is opened as an extension page in a tab (as in the other specs), so it can stay open while `permissions.html` is open in another tab. Playwright cannot click Chrome's native permission dialog. The e2e test therefore replaces `chrome.permissions.request` on `permissions.html` with a stub (`page.addInitScript` before the page script runs) that records the call and answers true or false. That proves the page calls `request` from the click and shows each result. The real dialog is covered by the manual check in task 13.4.
