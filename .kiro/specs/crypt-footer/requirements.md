# Requirements: Crypt Footer (F28)

## Overview

Today the HUD and the graveyard strip float over the bottom of the page. They are `position: fixed`, so they cover whatever is under them, and the page has to be padded and scroll-padded to keep its end and any focused link in view (F23). The graveyard also shows only in full-overlay mode, and it scrolls sideways when it has many companies.

F28 (owner request) makes the bottom of the costume a 1998 page footer at the very end of the page, in normal flow. It scrolls with the page and covers nothing. The only fixed thing left at the bottom is the ghost icon. F28 also changes the page-change cover's label (a random line from a pool of 12) and adds four easter eggs that exist only while the page is haunted.

| Piece | What it does |
| --- | --- |
| Host | `<hg-crypt>` becomes `position: static`, still appended after `<body>`. It is the footer box. The fixed layers stay inside the fixed `#crypt-root`. |
| Footer | `<footer id="crypt-footer">`, a sibling of `#crypt-root` in the shadow root. It holds the graveyard (every company, wrapping rows), the HUD, an 88x31 badges row and a sign-off line. All static. |
| Ghost icon | `#show-tab` is always shown while haunted, with the count of companies still haunting. A click shows a hidden costume, scrolls the graveyard into view and focuses it. |
| Page sheet | Drops the bottom padding and the bottom scroll padding. |
| Cover | The label comes from a pool of 12 lines, never the same as the last one in that tab. |
| Secrets | Konami code, 13 clicks on the hit counter, typing `boo`, the witching hour and Oct 31. |

Steering references: `non-destructive-dom.md` (nothing in the page's DOM changes, un-haunt restores it), `accessibility-and-motion.md` (reduced motion, 3 Hz, 4.5:1, keyboard), `era-accuracy.md` (web-safe colours, Comic Sans MS and Times New Roman, original art, no trademarks), `structure.md`. Related specs: `costume-renderer` (HUD, graveyard, haunt moment), `site-haunt` (the cover and its marker), `neighborhoods` (the marquee lines). The visual source is `design/DESIGN.md`: "Crypt footer (graveyard, HUD, badges)", "Ghost icon", "Secrets (easter eggs)", the HUD's "Body padding" and "Page-change cover".

## Terms

- **Footer**: `<footer id="crypt-footer">` inside the host's shadow root.
- **Crypt root**: `#crypt-root`, the fixed layer container (starfield, lanes, markers, bands, cards, `#show-tab`, haunt-moment FX).
- **Graveyard**: `#graveyard` in the footer. **HUD**: `#hud` in the footer.
- **Company**: one entry of the scan result (a ghost or a vampire), exorcised or not.
- **Haunting count**: companies not exorcised (ghosts plus vampires), as the HUD already counts them.
- **Marker**: `sessionStorage["__hauntedGeoCitiesSite"]`. Under F28 its value is the index of the last cover line shown (below).
- **Typing in a field**: the event target (`composedPath()[0]`) is an `input`, `textarea`, `select` or `contenteditable` element, or the event has Ctrl, Meta or Alt held.

## EARS Acceptance Criteria

### The footer in flow

1. The host `<hg-crypt>` shall be `position: static` with `display: block`, shall still be appended to `document.documentElement` after `<body>`, and shall have no `inset`, no `z-index` and no `pointer-events: none` of its own.
2. The crypt root shall be `position: fixed; inset: 0; z-index: 2147483647; pointer-events: none`, so every fixed layer sits above any page layer as before.
3. The footer shall be a child of the shadow root, a sibling of the crypt root, and shall be in normal flow: no `position: fixed`, `sticky` or `absolute` on the footer, the graveyard, the HUD, the badges row or the sign-off.
4. The footer shall have `position: relative; z-index: 2147483646`, a full-width `#000033` ground with the starfield tile at 30%, 24px padding (16px at a viewport of 400px or less) and a 4px `#66ff99` checker dither rule on top. Its content shall be centred with a maximum width of 800px, and its boxes shall have `pointer-events: auto`.
5. The footer shall hold, in this order: the graveyard, the HUD, the badges row, the sign-off line. DOM order shall be the visual and the Tab order.
6. The graveyard shall always be drawn while the page is haunted, in lane mode and in full-overlay mode. It shall keep `role="region"` and `aria-label="Graveyard of trackers"`, and shall have `tabindex="-1"`.
7. The graveyard shall list every company found, one `<button>` per company in lane order, wrapping onto more rows with 16px between them. It shall have no horizontal scroll at any width and no `overflow-x`.
8. In lane mode a company shall be in its lane and in the graveyard at once. In full-overlay mode, where there is no lane, it shall be in the graveyard alone. This replaces the old rule that a company is never in a lane and the strip together.
9. A graveyard tag shall take up to three lines and never break a word, as before. `Google Analytics` and `Google Ads` shall stay distinct and `U.S. General Services Administration` shall read whole.
10. When no company is found, the graveyard shall show `No graves yet. This page plays it straight.` and the HUD shall show its existing empty state.
11. The badges row shall hold four plain 88x31 boxes, not links and not buttons: `Best viewed in Netscape 4.0`, `Made with Notepad`, `Under construction` (black-and-yellow 4px stripes) and `Sign my guestbook`. Each shall have a 2px Win95 bevel, Times New Roman 11px, `#000080` on `#c0c0c0`, 8px apart, wrapping. They shall not be in the Tab order and shall not use a third-party trademark or logo.
12. The sign-off shall read `You are visitor #NNNNNN to this crypt.` (the hit counter's value, six digits) and `(c) 1998 The Webmaster`, in Times New Roman 12px `#ccccff`, centred. The number shall update with the counter.
13. Hide shall fade the footer and the crypt root's layers out in 200ms, keep the footer's height so the page does not jump, and keep `#show-tab`. Show shall fade them back.
14. The footer shall follow the crypt root's `reduced-motion` and `tab-hidden` states.

### The page sheet

15. The page sheet shall not set `padding-bottom` on `<body>` and shall not set `scroll-padding-bottom` on the root. The page's own bottom values shall stay as they are.
16. The page sheet shall keep the top padding and top scroll padding for the bands, the inline padding of full-overlay mode, `--hg-lift`, the restyle, the real-site blocks, the tint and the frame.
17. The tint and the frame shall end at the footer's top edge (document coordinates), never run behind the footer, and the page-sheet layers shall sit at a lower `z-index` than the footer.
18. The footer shall be last in the document's flow, so the page's end is never covered. A page whose body is shorter than the viewport shall show the footer at the page's natural end, not pinned to the viewport bottom.

### The ghost icon

19. `#show-tab` shall be the only fixed element at the bottom: 40x48, `right: 8px; bottom: calc(8px + var(--hg-lift))` (4px at 400px or less), with the 16px ghost icon over the haunting count in Comic Sans MS 12px.
20. `#show-tab` shall be shown at all times while the page is haunted, not only after Hide, and shall not have the `hidden` attribute.
21. The count shall equal the haunting count and shall tick like the HUD's number when Exorcise or Let it back changes it. The accessible name shall be `Jump to the graveyard: N trackers` (`1 tracker` for one).
22. When the user clicks `#show-tab` (or presses Enter or Space) and the costume is hidden, the costume shall show again.
23. Then it shall scroll the graveyard into view (`behavior: "smooth"`, or `"auto"` under reduced motion) and move focus to the graveyard region with `preventScroll: true` after the scroll call.
24. `#show-tab` shall have the hard shadow `4px 4px 0 #000000`, the costume focus ring, and 4.5:1 contrast for its text.

### Bounds, lanes and the haunt moment

25. Card bounds shall be `top` = the bands' bottom edge and `bottom` = the viewport's bottom edge (`innerHeight`), not the top of any strip. A card opened from a ghost in the graveyard shall stand inside the viewport and return focus to the sprite that opened it.
26. Lane slots shall run from the bands' bottom edge to the viewport's bottom edge. No slot in the right lane shall intersect the rectangle of `#show-tab`.
27. Exorcise from a lane ghost or a graveyard ghost shall play the same spiral, stamp and count tick as before, on both copies of the company.
28. The haunt moment shall find the HUD, the graveyard and the odometer strips through the shadow root, not through `#crypt-root`.
29. The haunt moment shall slide the HUD and graveyard in and out (and the odometer shall roll) only for a box whose top edge is inside the viewport. A box below the viewport shall get no slide, so the moment is the same on screen.
30. Un-haunt shall remove the host, the footer, the page sheet and every listener of this spec, with the page's DOM byte for byte as before.

### The page-change cover's label (supersedes `site-haunt` criteria 55 (label), 53 and 62 where they name the marker's value)

31. `cover.js` shall hold a pool of exactly 12 lines: `Loading crypt…`, `Summoning the webmaster…`, `Dusting off the guestbook…`, `Rewinding the dial-up modem…`, `Counting the ghosts…`, `Polishing the tombstones…`, `Waking the hit counter…`, `Untangling the webring…`, `Feeding the bats…`, `Lighting the candles…`, `Spinning up the marquee…` and `Reticulating the spirits…`.
32. When the cover is shown, it shall pick one line at random (an injectable `random` source, default `Math.random`) from the pool, excluding the last index in that tab, and shall show it in the `role="status"` element.
33. The function `pickLine(last, random)` shall return an index from 0 to 11 that is never equal to `last` when `last` is a valid index, and shall return a valid index for any `last` (`null`, `-1`, `NaN`, 12, a non-integer).
34. The last index shall be the value of the existing marker, written as a decimal string (`"0"` to `"11"`) when the cover shows. The marker's name and its per-tab, per-origin scope shall not change.
35. When the background sets the marker and no value is there, it shall write `"-1"` (no line yet). It shall not overwrite an existing value, so a re-haunt does not reset the last index.
36. `cover.js` shall treat the marker as set when its value is `"-1"` or a decimal integer from `"0"` to `"11"`, and as unset for anything else, including a missing key. A marker with a bad value shall not cover the page by itself, but `COVER_CHECK` can still do so.
37. A storage error on read or write shall be swallowed: the cover shall still show, with a random line.

### Secrets

38. Secrets shall exist only while the page is haunted. Their listeners shall be added with the costume and removed by Un-haunt, and no secret shall run after Un-haunt.
39. A secret shall never add, remove or change a node, attribute, style or listener of the page's own DOM. Everything it draws shall be inside the shadow root. A secret's listeners shall never call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`.
40. While the user is typing in a field, no key-driven secret shall fire, and the key buffers shall be cleared, so a code started in a field cannot finish outside it.
41. When `↑ ↑ ↓ ↓ ← → ← → B A` is typed (letters in either case), the costume shall run a frenzy for 3000ms: the ghosts and vampires in the lanes and the graveyard bob and sway three times faster, and the marquee reads `!!! FULL HAUNT !!!`. Afterwards it shall restore the marquee's line and the normal speed.
42. The frenzy's motion shall never exceed 3 Hz: a period shorter than 334ms shall be clamped to 334ms.
43. Under reduced motion the frenzy shall change only the marquee line, which stays static.
44. When the hit counter is clicked 13 times in a row, with at most 3000ms between clicks, a 48px pixel skeleton shall dance beside the odometer for 5000ms, in four frames at two frames a second, then disappear. The count shall then reset.
45. The skeleton shall not change the footer's height or move any other box (it is out of flow), shall stay inside the viewport horizontally, and under reduced motion shall stand still on one frame for the same 5000ms.
46. When `b`, `o`, `o` are typed in a row (any case, no Ctrl, Meta or Alt, at most 2000ms between keys), every ghost and vampire in the lanes and the graveyard shall flee off the bottom of its lane or row in 600ms and float back, with the return starting 2000ms after the first flee frame and taking 600ms.
47. Under reduced motion, the fleeing sprites shall fade out and back on the same timing with no movement.
48. A sprite drawn after `boo` started shall not take part in it. A second `boo` while one runs shall be ignored.
49. At local time 00:00 to 00:59 the costume shall use the witching hour look, and on Oct 31 (local date, all day) the Halloween look. Halloween wins when both apply.
50. Both looks shall turn the neighborhood bar and the marquee band `#ff6600` on `#330066` (5.3:1 contrast) and shall open the marquee with `It's the witching hour.` or `Happy Halloween from 1998!`. They shall be static and shall not change the page.
51. The date shall be read once, when the costume is rendered, through `now()`. `renderCostume(doc, { quiet?, now? })` shall accept `now: () => Date`, default `() => new Date()`, so tests inject the date.
52. A second render of the same document, and a quiet re-haunt of the next page of a site, shall each read `now()` again for their own costume.
53. The secrets shall make no sound and no network request, and shall add no permission or manifest entry.
54. A hit counter click that is not part of a run of 13 shall do nothing visible, and the counter shall keep its title, role and accessible name.
55. The secrets' timers shall be cleared on Un-haunt, so no animation, class or line outlives the costume.

### Accessibility and era

56. Every colour added by F28 shall be one of the 216 web-safe colours, every text shall use Comic Sans MS or Times New Roman, and every text shall have 4.5:1 contrast against its ground.
57. Everything new that a keyboard user can reach (the graveyard buttons, the ghost icon, the HUD) shall keep a visible focus ring. The badges and the skeleton shall not take focus.
58. The footer shall add no flash faster than 3 Hz and, under `prefers-reduced-motion: reduce`, no motion except opacity fades.
59. The feature shall add no permission and no manifest entry. `bun run lint:manifest` shall still pass.

### Tests, docs and checks

60. Unit tests in `test/costume/footer.test.ts` shall cover criteria 1 to 30 that can run in happy-dom (host and footer structure, order, contents, page sheet, ghost icon, bounds, un-haunt).
61. Unit tests in `test/costume/secrets.test.ts` shall cover criteria 38 to 55, with an injected `now()` and fake timers.
62. `test/cover.test.ts` shall cover criteria 31 to 37 (the pool, `pickLine`, the marker's value, the status text).
63. E2E specs that assumed the fixed strip shall be updated: `graveyard`, `layout-375`, `photo-page`, `costume`, `haunt-parade`, `exorcise-moment`, `tracker`, `hero-haunt`, `haunt` and `readme.shots`. A new check shall show that the footer is below the page's last element, in flow, with no overlap.
64. The visual baselines shall be regenerated in Docker and reviewed one by one. The docs:realsite GIF and stills shall be made again, with the stills checked at 1280 and 375.
65. The README shall gain a short `Secrets` section. `docs/devpost.md` and `docs/demo-script.md` shall describe the footer, the ghost icon and the secrets.
66. `bun run typecheck`, `bun run test`, the affected e2e specs, `bun run docker:test` (once) and `bun run build` shall pass.
