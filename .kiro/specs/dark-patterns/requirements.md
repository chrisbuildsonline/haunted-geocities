# Requirements: Dark Patterns (R8)

## Overview

This spec covers **cursed dark patterns**: text and controls on a haunted page that pressure the visitor, marked with a `CURSED!` badge beside them. It detects five kinds:

| Kind | What it is | Example |
| --- | --- | --- |
| `scarcity` | Fake low stock | `Only 2 left` |
| `countdown` | Static urgency text | `Offer ends in 3 hours` |
| `timer` | A clock that ticks | `Cart reserved for 09:58` |
| `confirmshaming` | A decline control worded to shame the visitor | `No thanks, I hate saving money` |
| `prechecked` | A checkbox ticked in the markup whose label is about marketing | `[x] Send me the newsletter and partner offers` |

It adds a pure detector (`src/content/dark-patterns.ts`), a read-only timer watcher, a `CURSE_UPDATE` message with per-tab `TabState.curses`, `CURSED!` badges in the `#markers` layer, a curse card, a HUD curse count, a Curses list in the popup, and the fixture and test surfaces.

It builds on the costume renderer (R4: shadow root layers, haunt moment, reduced-motion handling), runtime vampires (R6) and tombstones (R7). Tombstones set the pattern this spec follows: a pure collector, a content-script update message stored under a per-tab `chrome.storage.session` key, markers in `#markers` that are shown and hidden by an `IntersectionObserver` and positioned with `requestAnimationFrame`, a card opened from the marker, and a popup list after the previous one. The HUD already has a `curses` count (set to 0 by `renderCostume`) and the popup already has a Curses tile.

The detector only reads the page. It never changes a node, an attribute, a handler or a form control, and it never unchecks a box. After Un-haunt, `document.documentElement.outerHTML` is byte-identical to its pre-haunt value.

Steering references: `product.md` (cursed dark patterns, scope boundaries), `tech.md` (Shadow DOM, MutationObserver, IntersectionObserver, no new permissions), `non-destructive-dom.md` (observers are read-only, never change form behaviour, byte-identical Un-haunt), `accessibility-and-motion.md` (reduced motion, 3 Hz ceiling, keyboard, 4.5:1 contrast), `era-accuracy.md` (web-safe colours, Comic Sans MS, original pixel art), `structure.md` (`src/content/`, `src/background/`, `src/data/`, `fixtures/`, `test/`, `e2e/`). Design references: `design/DESIGN.md` sections "Cursed badges (dark patterns)", "Card style", "HUD", "Empty states", "Popup", "Motion".

## Terms

- **Block element**: an element from the block-tag list in `design.md` (`p`, `div`, `li`, `td`, `h1`–`h6`, `label`, and so on). Inline elements (`b`, `span`, `a`, `em`) are not blocks.
- **Nearest block**: for a text node, its closest ancestor that is a block element (or `<body>` if there is none).
- **Shown text of a block**: the concatenated data of the text nodes whose nearest block is that block, in document order, minus text inside skipped or hidden nodes. It is the nearest block's `textContent` without nested blocks and without text the visitor cannot see.
- **Skipped node**: the costume host, `<script>`, `<style>`, `<noscript>`, `<template>`, `<head>`, and a hidden node (see criterion 6), including everything inside them.
- **Curse**: `{ kind, snippet }`, the serialisable form that is sent to the background and stored. A **pattern** is `{ kind, element, snippet }`, the form the detector returns.

## EARS Acceptance Criteria

### Detector module

1. A pure module `src/content/dark-patterns.ts` shall export `detectDarkPatterns(root: Document | Element, costumeHost: string)` returning `DarkPattern[]`, where `DarkPattern` is `{ kind: DarkPatternKind; element: Element; snippet: string }` and `DarkPatternKind` is `"scarcity" | "countdown" | "timer" | "confirmshaming" | "prechecked"`. `costumeHost` is the overlay's tag name (`HOST_TAG`, `hg-crypt`), as in `collectLinks`.
2. The module shall be importable from the content script and from unit tests without a Chrome API, shall read the DOM only, and shall change no node, attribute, property, style, listener or form control. Calling it twice on the same unchanged tree shall return equal results.
3. `snippet` shall be at most 60 characters. A snippet is the collapsed text (runs of whitespace become one space, trimmed) of the reported element. When that is longer than 60 characters, the snippet shall be its first 59 characters followed by `…`, starting at the match for `scarcity`, `countdown` and `timer`, and at the start of the text for `confirmshaming` and `prechecked`.
4. The detector shall return at most one pattern per element. When more than one kind matches the same element, the kind listed first in this order shall win: `prechecked`, `confirmshaming`, `scarcity`, `countdown`.
5. The detector shall return at most 30 patterns, in document order. The cap is applied after the one-per-element rule.
6. The detector shall skip the costume host (the element whose tag name is `costumeHost`, and everything inside it), `<script>`, `<style>`, `<noscript>`, `<template>` and `<head>` elements, and hidden nodes. A node is hidden when it or an ancestor has the `hidden` attribute or `aria-hidden="true"`, is `<input type="hidden">`, or has a computed `display` of `none`, or when the element itself has a computed `visibility` of `hidden` or `collapse`. A match inside a skipped node shall never be reported, even when its text would match.

### Scarcity, countdown and split markup

7. The detector shall report `scarcity` for fake low-stock text. Scarcity text is: `only` or `just`, a number, an optional product noun (`items`, `units`, `rooms`, `seats`, `tickets`, `pieces`, `spots`, `copies`, `pairs`), then `left`, `remaining`, `available` or `in stock` (for example `Only 2 left`, `just 3 items remaining`); a number followed by `people`, `others`, `shoppers` or `customers` and `viewing`, `looking` or `watching` (for example `12 people are viewing this`); or `low stock`, `selling fast`, `almost gone`, `almost sold out`. The exact patterns are in `design.md`.
8. The detector shall report `countdown` for static urgency text: `offer`, `sale`, `deal`, `discount`, `price` or `promo` followed by `ends` and `in`, `on`, `at`, `soon`, `today` or `tonight` (for example `Offer ends in 3 hours`); `ends in` or `expires in` followed by a number and a time unit; `limited time offer` or `limited time deal`; or a number of hours or minutes followed by `left` or `remaining`. The exact patterns are in `design.md`.
9. Matching shall be case-insensitive and shall treat any run of whitespace between words as one space.
10. The detector shall match scarcity and countdown text against the shown text of each nearest block, so that the phrase is found when inline elements split it: `Only <b>2</b> left`, `<em>Only</em> 2 <strong>left</strong>`, `Only <span><b>2</b></span> left`.
11. A phrase split across two blocks (for example `<p>Only 2</p><p>left</p>`) shall not match.
12. For a match in a block, the detector shall report the smallest element that still holds the whole match: the deepest element that contains every text node the match touches, never above the block. For `<p>Only <b>2</b> left</p>` that is the `<p>`. For `<p>Sale <b>Only 2 left</b></p>` it is the `<b>`.
13. The detector shall report at most one match per kind per block.
14. Text that only resembles a pattern shall not match. `Only the best coffee`, `Just 2 minutes from the station`, `Left-handed mugs`, `Our road ends in a cul-de-sac` and a static opening time such as `Open daily 09:00 to 17:30` shall produce no pattern.

### Confirmshaming

15. The detector shall report `confirmshaming` for a decline control: an `a`, `button`, `[role="button"]`, `input[type="button"]` or `input[type="submit"]` (text from its `value`) whose collapsed text is at most 80 characters, begins with a decline lead (`no`, `nope`, `no thanks`, `no thank you`, `not now`, `maybe later` or `skip`) and continues with a first-person clause that puts down the visitor's own interest (for example `No thanks, I hate saving money`, `No, I prefer paying full price`, `Maybe later, I don't like deals`). The exact pattern is in `design.md`.
16. A plain decline (`No thanks`, `No, thanks`, `Not now`, `Maybe later`, `Skip`, `Close`) shall not match. The reported element is the control itself.

### Pre-checked opt-in

17. The detector shall report `prechecked` for an `input[type="checkbox"]` that has the `checked` attribute in the markup and whose label text matches `newsletter`, `offers`, `marketing`, `partners`, `emails` (or `e-mail`) or `subscribe` as a whole word (singular and plural forms accepted).
18. The label text is the text of the wrapping `<label>`, else of a `<label for="id">` naming the input, else the input's `aria-label`. An input with no label text shall not match.
19. The reported element is the label element when there is one, else the input. The check reads the `checked` attribute, not the `checked` property, so a box the visitor has since unticked is still found and is never changed by the detector.
20. A checked box with an unrelated label (`Remember my cart`), an unchecked box with a marketing label, and a checked box inside a skipped node shall not match.

### Timer

21. A module `src/content/timers.ts` shall export `watchTimers(doc, costumeHost, onTimer)`, which observes the page with a `MutationObserver` (`subtree`, `childList`, `characterData`; never `attributes`) and calls `onTimer(pattern)` with a `{ kind: "timer", element, snippet }` pattern for a ticking clock. It shall return a `stop()` function that disconnects the observer.
22. A clock is text shaped like `09:58`, `1:02:33`, `02h 14m` or `00d 12h 03m 09s` (patterns in `design.md`). A block is **ticking** when the first clock in its shown text changed to a different clock value at least 3 times within 10 seconds. Static clock text that never changes shall never be reported.
23. The element reported for a timer is the smallest element that holds the whole clock match (criterion 12), chosen when the block is found to be ticking. A clock split across elements (`<span>09</span>:<span>58</span>`) is one clock, and the reported element is the one that holds both spans. A page that replaces the clock's element on every tick is still reported, because ticking is tracked per block.
24. The watcher shall report each block at most once, shall ignore mutations whose target is inside a skipped node, shall process at most 200 mutation records per callback, and shall be read-only: it shall never write to a node and shall never keep a mutation record beyond the callback.
25. The watcher shall only run while the page is haunted. Un-haunt shall call `stop()`.
26. `mergeCurses(statics, timers)` (exported by `dark-patterns.ts`) shall combine the static patterns and the timer patterns by the rules of criteria 4 and 5, and a `timer` shall replace a `countdown` on the same element or on an element that contains it or is contained by it. The result is in document order and at most 30 long.

### Never mutate the page

27. The detector, the timer watcher, the badges and the card shall never modify any page node, attribute, property or style, never add or remove a page listener, and never click, focus, check or uncheck a page control.
28. A checkbox that was checked before Haunt shall be checked (both the `checked` property and the `checked` attribute) while haunted, after the visitor clicks its badge, and after Un-haunt.
29. Clicking a badge shall not dispatch a click, focus or change event on the page element.
30. After Un-haunt, `document.documentElement.outerHTML` shall be byte-identical to its value before Haunt, except for text the page itself changed (for example a page script that ticks a clock).
31. Page scripts shall never be edited, blocked or reordered, and form behaviour shall never change.

### Costume: re-detection

32. When the costume is rendered, it shall run `detectDarkPatterns(doc, HOST_TAG)` once, and shall start `watchTimers`.
33. When the page adds or removes nodes afterwards, the costume shall run the detector again, debounced to 500 ms after the last mutation and not more than once every 2 seconds. New patterns are added; a pattern whose element is no longer connected is dropped; a pattern whose element is already known keeps its kind and snippet, so a ticking text does not change its curse.
34. The costume shall send a `CURSE_UPDATE` only when the set of `{ kind, snippet }` pairs changes.

### State

35. The costume shall send `{ type: "CURSE_UPDATE", curses: Curse[] }` to the background, where `Curse` is `{ kind: DarkPatternKind; snippet: string }`. The tab id comes from `sender.tab.id`, never from the message.
36. The background shall accept `CURSE_UPDATE` only for a haunted tab (the `haunt:<tabId>` key exists in `chrome.storage.session`). For any other tab it shall drop the message.
37. The background shall store the list in `chrome.storage.session` under `cursesKey(tabId)`, which is `curses:<tabId>`, after dropping every entry whose `kind` is not one of the five kinds or whose `snippet` is not a string, cutting each snippet to 60 characters and keeping the first 30 entries.
38. The background shall clear `cursesKey(tabId)` on Un-haunt, on tab close and on navigation, in the same place that clears `tombstonesKey(tabId)` (`clearTab`).
39. `TabState` shall gain `curses: Curse[]`, filled from `chrome.storage.session` in `getState` (`[]` when none) and returned in every `getState` answer, including the error answer in `register`.

### Costume: badges

40. Each pattern shall get one `CURSED!` badge in the `#markers` layer of the shadow root: a `<button>` with a 12×12 skull icon (6×6 art grid at 2 CSS px, new `BADGE_SKULL` sprite in `art.ts`) and the text `CURSED!`, Comic Sans MS 11px bold `#000000` on `#ff9900`, a 1px `#000000` border, a hard shadow `2px 2px 0 #000000`, 18px tall.
41. The badge shall be placed, in this order of preference, at the first spot that is on screen and covers no page text: (a) 4px to the right of the element's last line box, vertically aligned to it; (b) 4px above the element's first line box, with its left edge on the line box's left edge (the element's margin); (c) in the gutter lane slot at the same y (the `planSlots` slots), on the lane edge nearest the element. When none fits, no badge shall be drawn for that pattern. The HUD count and the popup list shall still include it.
42. A badge shall never cover page text. The "line boxes" of an element are the client rects of a `Range` over its contents, not the single box of a block element.
43. Badges shall be repositioned on scroll (any scroller), resize and page mutation with `requestAnimationFrame` throttling, one pass per frame.
44. A badge shall be hidden while its element is off screen, using an `IntersectionObserver` on the page element. The observer shall only read the page and only change the badge.
45. A badge shall have `aria-label` `<card title>: <snippet>` (for example `Cursed: Fake scarcity: Only 2 left`), shall be a focusable `<button>`, and shall show the costume focus ring (`outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000`).
46. Badges added after the haunt moment shall fade in over 200ms linear. Under `prefers-reduced-motion: reduce` they shall appear with no animation. Badges present at the haunt moment shall fade in with the `#markers` layer (the 2300-2500ms markers phase of the timeline, or the 300ms cross-fade under reduced motion).
47. Un-haunt shall remove every badge, disconnect the `IntersectionObserver` and the timer watcher's observer, cancel any pending frame or debounce timer, and remove the scroll and resize listeners.

### Costume: curse card

48. Clicking a badge, or pressing Enter or Space on it, shall open a card in `#cards`, in the card style of `design/DESIGN.md` (248px wide, `#330066` title bar with a 16×16 `[x]` close button, Comic Sans body). Only one card shall be open at a time, shared with the ghost, vampire and tombstone cards.
49. The card title shall be `Cursed: Fake scarcity` for `scarcity`, `Cursed: Countdown` for `countdown`, `Cursed: Ticking timer` for `timer`, `Cursed: Confirmshaming` for `confirmshaming` and `Cursed: Pre-checked opt-in` for `prechecked`.
50. The card body shall show the snippet in quotation marks, set with `textContent`, then one line on the trick for that kind (the five lines are in `design.md`).
51. The card shall be anchored beside its badge toward the page centre and clamped to the viewport between the bands and the HUD, keeping at least 8px from both viewport edges at 1280 and 375 px wide.
52. Focus shall move into the card (the close button) on open. `Esc` shall close the card and return focus to the badge that opened it. The `[x]` button shall be keyboard reachable.

### HUD

53. The HUD curse count shall be the number of curses (the length of the list), shown through the existing `setCounts` call. It shall update when the list changes.

### Popup

54. The popup haunted screen shall list curses after tombstones in a section headed `Curses` with the count. Each row shall show the kind name on line 1 (`Fake scarcity`, `Countdown`, `Ticking timer`, `Confirmshaming`, `Pre-checked opt-in`) and the quoted snippet on line 2 (13px muted, wrapping, set with `textContent`), with the 32px icon tile showing the curse sprite. Rows are not buttons: they have no action.
55. When there are no curses, the list surface shall show `No curses. This page plays fair.`
56. The Curses tile in the count grid shall show the curse count.
57. Curse rows shall be keyboard reachable (`tabindex="0"`) with the popup focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`) and an `aria-label` `<kind name>: <snippet>`.
58. The popup shall read `state.curses ?? []`, so a state from an older background still renders.

### Accessibility and motion

59. Badge and card text shall meet a 4.5:1 contrast ratio against its background (`#000000` on `#ff9900` is 9.8:1; `#ffffcc` on `#000033` is 19.5:1).
60. No flashing, blinking or strobing faster than 3 Hz shall occur in any badge or card. Badges do not animate after their fade-in.
61. Under `prefers-reduced-motion: reduce`, badges and the card shall not animate (no fade-in, no scale).

### Fixtures

62. A fixture page `fixtures/dark-patterns.html` shall be a standalone fake shop with no real brand and no external dependency. It shall contain exactly these curses: two `scarcity` (one with split markup, `Only <b>2</b> left in stock!`), one `countdown`, one `timer` (a clock its own inline script ticks once a second), one `confirmshaming` (`No thanks, I hate saving money`) and one `prechecked` (a checked newsletter box).
63. The page shall also contain innocent control text that must not match: `Only the best coffee`, `Just 2 minutes from the station`, a static opening time, a plain `No thanks` button, a checked box with an unrelated label, an unchecked box with a marketing label, and the phrase `Only 1 left` inside a `hidden` element, a `display: none` element, `<noscript>`, `<template>` and `<script>` text.
64. Every cursed element shall have at least 28px of top margin and shall fit a 375px viewport with no horizontal scroll, so that badge placement (b) is always possible.

### Tests

65. Unit tests in `test/dark-patterns/` shall cover each kind with positive and negative cases, the snippet rule, one curse per element, the 30 cap, the skipped and hidden nodes, and purity (the tree serialises identically before and after).
66. A property-based test with a seeded PRNG (the mulberry32 helper and `SEED`/`CASES` convention of `test/tracker/properties.test.ts`, no new dependency) shall check split markup: a phrase cut into random pieces, each wrapped in random inline elements, is found once, and the reported element is the smallest one that holds all pieces; the same phrase split across blocks, and look-alike text, are never found.
67. Unit tests shall cover the timer watcher and its tick tracker, `mergeCurses`, the badge placement function, the badge mount (observer, rAF, reduced motion, Un-haunt), the curse card, the router (`CURSE_UPDATE`, storage, clearing, `getState`), the popup list and the HUD count.
68. An end-to-end test `e2e/dark-patterns.spec.ts` shall run on `fixtures/dark-patterns.html` at viewport widths 1280 and 375 and verify: the six badges are beside their elements and over no text; each badge opens a card with the right title, the quoted snippet and one trick line; Esc closes the card and returns focus to the badge; the popup lists the six curses after tombstones and shows `No curses. This page plays fair.` on a clean page; the pre-checked box stays checked; and Un-haunt leaves the page byte-identical.
