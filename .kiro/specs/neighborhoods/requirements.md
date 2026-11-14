# Requirements: Neighborhoods and popup polish (R9)

## Overview

This spec gives every site a GeoCities **neighborhood address** and fixes five rough edges in the popup, the toolbar and the cards.

| Part | What changes |
| --- | --- |
| (a) Neighborhoods | The placeholder `neighborhoodFor` in `src/content/costume/bands.ts` is replaced by a pure resolver over `src/data/neighborhoods.json`. A host gets an address such as `SiliconValley/Heights/2049` and a tagline. The neighborhood bar shows both. The popup shows the address under the site title. |
| (b) Toolbar badge | While a tab is haunted, the toolbar icon carries the number of ghosts, vampires, tombstones and curses found on that tab. |
| (c) Link-check permission | The popup switch "Check links to other sites" opens a small extension page, `permissions.html`, which asks Chrome for the permission. Chrome's permission dialog closes the popup, so the popup can no longer be the page that asks. |
| (d) Hem tints | Ghosts that sit next to each other never share a hem colour. |
| (e) Known vampire row | The popup sub line for a known vampire stops repeating the word "Known". |
| (f) Ghost card footnote | The footnote tells the truth about how long an Exorcise lasts. |

It builds on the costume renderer (R4: the neighborhood bar and its 24px band), the tracker detector (R5: ghosts, the ghost card, Exorcise, the router), runtime vampires (R6: the vampire rows) and tombstones and dark patterns (R7, R8: the per-tab counts that feed the badge). It follows the existing shapes: a pure module with unit tests, a message handled in `src/background/router.ts`, a popup screen built with the `h()` helper, and an e2e spec per feature.

The resolver only reads a host name. The badge, the permission page and the tints never touch the page. After Un-haunt, `document.documentElement.outerHTML` is byte-identical to its pre-haunt value, as before.

Steering references: `product.md` (the GeoCities neighborhood capability, permissions model), `tech.md` (no `host_permissions` at install, optional http/https only after opt-in, Shadow DOM overlay), `non-destructive-dom.md` (the costume never changes the page), `accessibility-and-motion.md` (4.5:1 contrast, keyboard reach, focus rings, reduced motion), `era-accuracy.md` (Times New Roman, the 216 web-safe colours, original assets), `structure.md` (`src/data/`, `src/popup/`, `src/background/`, `test/`, `e2e/`). Design references: `design/DESIGN.md`, sections for the neighborhood bar, ghosts, cards and the popup. Task 12 of `tasks.md` updates them.

## Terms

- **Neighborhood**: one of the 16 entries in `neighborhoods.json`: `{ name, tagline, suburbs }`.
- **Address**: `Neighborhood/Suburb/NNNN`, for example `SiliconValley/Heights/2049`.
- **Host**: the `hostname` of a URL (no scheme, no port, no path).
- **Label**: one dot-separated part of a host. A **token** is a label split again at hyphens (`night-owl` gives `night` and `owl`).
- **Rule**: an entry of `rules` in `neighborhoods.json`: `{ kind: "tld" | "word", match: string[], to: string }`.
- **Total count** (badge): ghosts + vampires + tombstones + curses on the tab. Ghosts and vampires are the entries of the reported company list, so the sum is `companies.length + tombstones.length + curses.length`.
- **Ghost order**: the order of the ghosts that are not vampires, sorted by request count (most first), then by company name. It is the order of the gutter lane slots (`updateGhosts`) and of the popup Ghosts list.

## EARS Acceptance Criteria

### Neighborhood data

1. `src/data/neighborhoods.json` shall list exactly 16 neighborhoods with these names, in this order: `Area51`, `SiliconValley`, `Hollywood`, `Athens`, `CapitolHill`, `WallStreet`, `TimesSquare`, `SunsetStrip`, `Colosseum`, `MotorCity`, `Paris`, `SoHo`, `Heartland`, `Petsburgh`, `RainForest`, `Tokyo`. Each entry shall have `name`, `tagline` and `suburbs`.
2. Each `tagline` shall be one line of printable ASCII, 48 characters or fewer, in period voice (for example `Where the webmasters code all night.`), and shall contain no third-party trademark. Each `suburbs` list shall hold exactly 4 distinct names of 2 to 12 letters (no spaces, digits or slashes). The `SiliconValley` list shall include `Heights`, the `Area51` list `Hangar` and the `Heartland` list `Homestead`.
3. The file shall also hold `rules`, an ordered array of `{ kind, match, to }`. `kind` is `"tld"` or `"word"`, `match` is a non-empty array of lowercase ASCII strings, and `to` is the name of a neighborhood in the file. Every `tld` rule shall come before every `word` rule.

### Resolver

4. A pure module `src/data/neighborhood.ts` shall export `resolveNeighborhood(host: string): Neighborhood`, where `Neighborhood` is `{ name: string; tagline: string; suburb: string; number: number; address: string }`. The module shall not use a Chrome API, the DOM, the network, the clock or a random source, so the content script, the popup and unit tests can all import it.
5. The resolver shall normalise the host before it looks at it: lowercase, one trailing dot removed, one leading `www.` removed. `Example.COM.`, `www.example.com` and `example.com` shall resolve to the same address.
6. `localhost` and any host ending in `.localhost` shall resolve to the fixed address `Heartland/Homestead/1998`. An IPv4 literal (four dot-separated numbers) and an IPv6 literal (a host that starts with `[` or contains `:`) shall resolve to the fixed address `Area51/Hangar/1998`. These addresses use the `Heartland` and `Area51` name and tagline.
7. A `tld` rule shall match when the host's last label, or its second-to-last label, equals one of its `match` entries (so `agency.gov`, `agency.gov.uk` and `school.edu.au` all match). The file shall include rules for `gov` and `mil` (to `CapitolHill`), `edu` and `ac` (to `Athens`), `jp` (to `Tokyo`), `fr` (to `Paris`) and `dev` (to `SiliconValley`).
8. A `word` rule shall match when any token of the host's labels, **excluding the last label**, equals one of its `match` entries or that entry plus `s`, or, for an entry of 4 or more letters, starts or ends with it. Entries of 3 letters or fewer (`cat`, `dog`, `pet`, `dev`, `git`, `tv`) match whole tokens only (plus the `s` form). The file shall include these keywords at least:
   - `shop`, `store`, `bank`, `pay`, `trade` to `WallStreet`;
   - `game`, `play`, `arcade` to `TimesSquare`;
   - `news`, `blog`, `write`, `art` to `SoHo`;
   - `music`, `band`, `radio` to `SunsetStrip`;
   - `code`, `dev`, `github`, `gitlab`, `git`, `software`, `tech` to `SiliconValley`;
   - `pet`, `dog`, `cat`, `puppy`, `kitten` to `Petsburgh`.
   The file may add keywords for the other neighborhoods.
9. Rules shall be tried in file order, `tld` rules first, and the first rule that matches decides the neighborhood.
10. A host that matches no rule shall get the neighborhood at index `fnv1a(host) mod 16` in the file order, where `fnv1a` is the 32-bit FNV-1a hash of the normalised host (offset basis `0x811c9dc5`, prime `0x01000193`, as the placeholder uses today).
11. The address shall be `name/suburb/number`. The suburb shall be the entry of the neighborhood's `suburbs` at index `fnv1a("suburb:" + host) mod 4`. The number shall be `1000 + ((fnv1a(host) >>> 8) mod 9000)`, so it is a whole number from 1000 to 9999. These two rules apply to hosts matched by a rule as well as to hash fallbacks.
12. The resolver shall be deterministic and total: the same string always gives the same result, and no string (empty, very long, non-ASCII, with spaces) makes it throw. An empty host shall resolve through the hash like any other.

### Neighborhood bar

13. The neighborhood bar shall show `You are in: <address>` on the left, with the address in bold as today, and the neighborhood's tagline after it.
14. The tagline shall be on one line only. It shall take the space left between the address and the under-construction sign, and shall be cut with an ellipsis (`text-overflow: ellipsis`) when it does not fit. It shall never wrap and never push the sign or the address out of the bar. The address shall never be cut.
15. The tagline shall be hidden (`display: none`) when the viewport is narrower than 480 CSS px. At 480px and wider it shall be shown.
16. The bar shall keep its 24px height, `#330066` ground, `#ffffcc` text, Times New Roman 13px, the 1px `#6633cc` bottom edge and the 48×24 sign on the right. The tagline uses the same colour and font as the address. No new colour or font is introduced.
17. The address and the tagline shall be set as text (`textContent`), never as markup.
18. The costume shall call `resolveNeighborhood(location.hostname)` once when it renders. `neighborhoodFor` shall be removed from `bands.ts`, and `buildBands` shall take a `Neighborhood`.

### Popup address line

19. The popup haunted screen shall show the address of the page's host as one muted line directly under the site title (the `h1`), for example `SiliconValley/Heights/2049`. The line shall be set as text, shall be 13px in the popup's muted colour, and shall not wrap inside a word.
20. The idle screen and the restricted screen shall not show the line. When the tab's URL has no host (for example a `file:` URL or no URL), the haunted screen shall not show it either.

### Toolbar badge

21. While a tab is haunted, the background shall set the action badge text for that tab to its total count: `""` when the count is 0, the decimal count from 1 to 99, and `99+` above 99.
22. When the text is not empty, the badge background shall be `#6633cc` and the badge text colour `#ffffff` (7.1:1 contrast).
23. The background shall update the badge after it has stored a `TRACKER_UPDATE`, a `TOMBSTONE_UPDATE` or a `CURSE_UPDATE` from a haunted tab. A message dropped because the tab is not haunted shall not change the badge.
24. The background shall clear the badge (text `""`) in `clearTab`: on `UNHAUNT`, when the tab closes, and when the tab navigates or reloads away from the haunted document (the existing `onUpdated` path that clears the tab's state).
25. Every `chrome.action` call shall pass `tabId`. The badge shall never be set globally, and one tab's count shall never show on another tab.
26. A failing `chrome.action` call (for example for a tab that has just closed) shall be swallowed. It shall not stop the message handler, change the answer to the sender or leave an unhandled rejection.
27. The badge shall add no permission and no dependency. `test/manifest.test.ts` passes unchanged.

### Link-check permission prompt

28. When the user turns the popup switch "Check links to other sites" on, the popup shall open `permissions.html` of the extension in a new tab (`chrome.tabs.create` with `chrome.runtime.getURL("permissions.html")`). The popup shall not call `chrome.permissions.request`.
29. After it opens the tab, the popup shall put the switch back to off and set the sub line to `Finish on the page that just opened.`, because the permission is not granted yet.
30. When the user turns the switch off, the popup shall remove the permission directly with `chrome.permissions.remove` and show `Asks Chrome to visit linked sites. Off.` (unchanged behaviour).
31. Every time the popup opens, it shall read `chrome.permissions.contains` and set the switch and its sub line from the answer. While the popup stays open, it shall follow `chrome.permissions.onAdded` and `chrome.permissions.onRemoved` for the link-check origins.
32. `permissions.html` shall be a small extension page in the popup's design system: `#eef0f4` canvas, one white surface with an 18px radius, a heading `Check links to other sites`, a one-sentence explanation, and one near-black pill button `Allow link checks`. The explanation shall read exactly: `Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites.`
33. The button's click handler shall call `chrome.permissions.request` for the link-check origins before any `await`, so the call stays inside the user gesture. The page shall show the result in a polite live region: `Link checks are on. You can close this tab.` when granted, and `Chrome didn't allow it. Link checks stay off.` when not. After a refusal the button stays enabled so the user can try again. After a grant the button is disabled.
34. When the page opens and `chrome.permissions.contains` already answers true, it shall show `Link checks are already on.`, with the button disabled.
35. `permissions.html` shall be a build output next to `popup.html`, reachable as `chrome-extension://<id>/permissions.html`, shall load no remote resource, and shall need no manifest change (no `web_accessible_resources`, no new permission). The shipping `dist/manifest.json` still has no `host_permissions`.
36. The button shall be keyboard reachable, show the popup focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`), and have text that meets 4.5:1 contrast. The page shall not animate.

### Distinct hem tints

37. `hemTint(company)` (`hash(company) mod 6` over `HEM_TINTS`) shall stay as the base tint of a company.
38. A new pure function `assignTints(companies)` in `ghosts.ts` shall return one tint per company, for companies given in ghost order. The tint of a company is its base tint, unless that tint equals the tint assigned to either of the two companies before it, in which case the company takes the next tint in `HEM_TINTS` (wrapping from the last to the first), and again the next until it differs from both. The first company always has its base tint.
39. No two ghosts that are next to each other in ghost order shall have the same hem tint. Because lane rows alternate sides, the check against two companies back also covers the nearest ghost above in the same lane.
40. `assignTints` shall depend only on the list it is given, so the same page state always gives the same colours. The lane ghosts (`updateGhosts`) and the popup ghost rows shall both use it, so a company has the same tint in the lanes and in the popup. When an update changes a ghost's tint, `updateGhosts` shall redraw that ghost's sprite and leave the element, its focus and its label in place.

### Known vampire row

41. The popup sub line of a known vampire (never caught at runtime) shall be `On the Tracker Radar fingerprint list`. Its `Known` pill is unchanged. Rows of caught vampires are unchanged. The ghost-card line `Known to fingerprint (Tracker Radar)` and the lane label `<company>, vampire, known to fingerprint` are unchanged.

### Ghost card footnote

42. The footnote of an exorcisable ghost or vampire card shall be exactly `Blocked on this tab until you un-haunt or leave the page.`
43. The footnote shall be true. After Exorcise, the company's session rules shall be gone after Un-haunt, after a reload, after navigating the tab to another page, and after the tab closes, and shall still be in place while the page stays haunted.

### Tests

44. Unit tests in `test/neighborhoods/` shall cover the data file, the resolver, the bar, the popup address line, the badge, the permission flow, the permissions page, the tints, the vampire sub line and the footnote.
45. A property-based test with a seeded PRNG (the mulberry32 helper and `SEED`/`CASES` convention of `test/tracker/properties.test.ts`, no new dependency) shall check that the resolver is total and deterministic, that the number is in 1000-9999, that the suburb belongs to the neighborhood, that the normalisation holds, and that `assignTints` never gives two of three consecutive companies the same tint.
46. An end-to-end test `e2e/neighborhoods.spec.ts` shall run at viewport widths 1280 and 375 and verify: the bar text and the tagline rule (shown at 1280, hidden at 375); the popup address line; the badge text, colours and clearing; the permission flow through `permissions.html`; distinct hem tints on `trackers.html`; the vampire sub line; and the footnote.
47. `design/DESIGN.md`, `README.md` and `test/readme.test.ts` shall be updated for the new behaviour (task 12).
