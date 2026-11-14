# Design: Dark Patterns (R8)

## Overview

This spec adds **cursed dark patterns** to the haunted costume. A pure detector finds five kinds of pressure on the page (fake scarcity, static countdown text, ticking timers, confirmshaming, pre-checked opt-ins). Each one gets a `CURSED!` badge beside it in the `#markers` layer. Clicking a badge opens a card that quotes the text and names the trick. The HUD counts the curses and the popup lists them after the tombstones.

The work follows the shape of tombstones (R7) so that the code reads the same:

| Concern | Tombstones (existing) | Dark patterns (this spec) |
| --- | --- | --- |
| Pure finder | `collectLinks` in `src/content/links.ts` | `detectDarkPatterns` in `src/content/dark-patterns.ts` |
| Async source | `checkLinks` (fetch) | `watchTimers` (MutationObserver) in `src/content/timers.ts` |
| Content → background | `TOMBSTONE_UPDATE { dead }` | `CURSE_UPDATE { curses }` |
| Session key | `tombstonesKey(tabId)` = `tombstones:<tabId>` | `cursesKey(tabId)` = `curses:<tabId>` |
| `TabState` field | `tombstones: DeadLink[]` | `curses: Curse[]` |
| Markers | `mountTombstones` in `costume/tombstones.ts` | `mountCurses` in `costume/curses.ts` |
| Card | `openTombstoneCard` in `costume/card.ts` | `openCurseCard` in `costume/card.ts` |
| Popup | tombstone rows, `No tombstones. Every link is alive.` | curse rows, `No curses. This page plays fair.` |

The detector never writes to the page. Everything the visitor sees is a badge or a card inside the closed shadow root, so Un-haunt (remove the host and the adopted sheet) leaves the page byte-identical.

Steering and design references: see `requirements.md`. Section names in `design/DESIGN.md`: "Cursed badges (dark patterns)", "Card style", "HUD", "Empty states", "Popup", "Motion".

## Assumptions

These choices fill gaps in the brief. Each is cheap to reverse.

- `costumeHost` is the overlay's tag name (`HOST_TAG` = `hg-crypt`), as in `collectLinks(doc, siteOrigin, costumeHost)`, not an element.
- `root` is a `Document` or an `Element`.
- `<head>` is skipped along with `script`, `style`, `noscript` and `template`, because `<title>Only 2 left</title>` is not on the page.
- The snippet is the element's text, not only the matched words, so the card reads like the page (`Only 2 left in stock!`). It starts at the match when it has to be cut.
- A block's text is built from its own text nodes (nested blocks are separate blocks). This is the nearest block's `textContent` without the text of nested blocks and without text the visitor cannot see.
- A timer is tracked per block and reported on the smallest element holding the clock. Tracking per block survives a page that replaces the clock's `<span>` on every tick.
- `timer` replaces `countdown` when both would mark the same text, because a clock that moves is the stronger evidence.
- The tombstone code keeps its private `textNear` helper. This spec exports it (no behaviour change) so that badges use the same "text near this element" rects.
- Rescan debounce (500 ms, at most once per 2 s) and the 200-record watcher cap are performance choices, not product requirements.

## Architecture and Data Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ CONTENT SCRIPT (isolated world)                                                 │
│                                                                                 │
│ renderCostume()                                                                 │
│   ├─ statics = detectDarkPatterns(doc, HOST_TAG)          (pure, read-only)     │
│   ├─ stopTimers = watchTimers(doc, HOST_TAG, onTimer)     (MutationObserver)    │
│   ├─ mo (existing) → relayout() + scheduleRescan()   (500 ms debounce, ≥ 2 s)   │
│   │                                                                             │
│   ├─ commit():                                                                  │
│   │     patterns = mergeCurses(known statics, timers)    (≤ 30, doc order)      │
│   │     badges.update(patterns)        → #markers .curse-badge                  │
│   │     setCounts(hud, { …, curses: patterns.length })                          │
│   │     if the {kind, snippet} set changed:                                     │
│   │        send({ type: "CURSE_UPDATE", curses })  ─────────────┐               │
│   │                                                              │               │
│   └─ badge click → openCurseCard(cards, curse, badge, opts)      │               │
└──────────────────────────────────────────────────────────────────┼─────────────┘
                                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ BACKGROUND SERVICE WORKER (router.ts)                                           │
│   CURSE_UPDATE: tab = sender.tab.id; drop unless haunt:<tab> is set;            │
│                 validate + clean; session.set({ curses:<tab>: Curse[] })        │
│   getState(tab) → { …, tombstones, curses }                                     │
│   clearTab(tab) (Un-haunt, tab close, navigation) removes curses:<tab>          │
└───────────────────────────────────────────────────────────────────────────────┘
                                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ POPUP: tile "Curses" = state.curses.length; list after Tombstones               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Sequence

1. **Haunt.** `renderCostume()` builds the layers (existing), then calls the detector once and starts the timer watcher.
2. **Badges.** `commit()` merges static and timer patterns, hands them to `mountCurses`, updates the HUD count and sends `CURSE_UPDATE`.
3. **Store.** The background checks that the tab is haunted, cleans the list and stores it under `curses:<tabId>`.
4. **Later changes.** The existing page `MutationObserver` triggers a debounced rescan. Timer patterns arrive from the watcher whenever a clock has ticked 3 times.
5. **Open a card.** A click (or Enter or Space) on a badge opens the card in `#cards`. Esc closes it and focus returns to the badge.
6. **Popup.** `getState` returns `curses`. The popup renders the tile and the list.
7. **Un-haunt.** The `onUnhaunt` cleanup stops the watcher, removes the badges and disconnects the observer. The background clears `curses:<tabId>`.

## Types (`src/data/types.ts`)

```ts
export const DARK_PATTERN_KINDS = ["scarcity", "countdown", "timer", "confirmshaming", "prechecked"] as const;
export type DarkPatternKind = (typeof DARK_PATTERN_KINDS)[number];

/** A dark pattern the costume found, as the background stores it and the popup lists it. */
export interface Curse {
  kind: DarkPatternKind;
  /** The quoted text, at most 60 characters. */
  snippet: string;
}

export type ContentRequest =
  | /* … existing … */
  | { type: "CURSE_UPDATE"; curses: Curse[] };

export interface TabState {
  /* … existing … */
  /** Dark patterns the costume reported; [] when none. */
  curses: Curse[];
}

/** chrome.storage.session key holding the `Curse[]` last reported by the tab. */
export const cursesKey = (tabId: number) => `curses:${tabId}`;
```

No `ContentMessage` variant is added: nothing flows from the background to the content script for curses.

## Detector (`src/content/dark-patterns.ts`)

```ts
export interface DarkPattern {
  kind: DarkPatternKind;
  element: Element;
  /** ≤ 60 characters. */
  snippet: string;
}

export function detectDarkPatterns(root: Document | Element, costumeHost: string): DarkPattern[];
export function mergeCurses(statics: readonly DarkPattern[], timers: readonly DarkPattern[]): DarkPattern[];
export const KIND_INFO: Record<DarkPatternKind, { name: string; title: string; trick: string }>;
// Shared with timers.ts:
export const CLOCK: RegExp;
export function blockOf(node: Node): Element;
export function flowOf(block: Element, costumeHost: string): Flow;
export function locate(flow: Flow, re: RegExp): { element: Element; text: string; index: number } | null;
export function inSkipped(el: Element, costumeHost: string): boolean;
export function snippetOf(element: Element, re: RegExp): string;   // the collapsed element text, cut at 60 from the match
```

### Skipped and hidden nodes

`SKIP_TAGS = script, style, noscript, template, head`. An element is **pruned** (it and its subtree are ignored) when its tag is in `SKIP_TAGS`, its tag name is `costumeHost`, it has the `hidden` attribute or `aria-hidden="true"`, it is `input[type="hidden"]`, or `getComputedStyle(el).display === "none"`. Text directly inside an element whose computed `visibility` is `hidden` or `collapse` is ignored too (visibility inherits, so a visible child of a hidden parent still counts).

The text walk uses a `TreeWalker` whose filter returns `FILTER_REJECT` for a pruned element, so every descendant of a pruned node is skipped without being visited. The two `querySelectorAll` passes (confirmshaming, prechecked) call `inSkipped(el, costumeHost)`, which walks the ancestors and memoises the answer per element within one call.

### Blocks and flows

`BLOCK_TAGS`: `address article aside blockquote body caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup legend li main nav ol p pre section summary table tbody td tfoot th thead tr ul label`.

`blockOf(node)` returns the closest ancestor-or-self element in `BLOCK_TAGS`, or `document.body` if none.

A **flow** is a block's shown text:

```ts
interface Flow {
  block: Element;
  nodes: Text[];      // the text nodes whose nearest block is `block`, in document order
  starts: number[];   // starts[i] = offset of nodes[i].data inside `text`
  text: string;       // nodes' data joined with no separator; a <br> between nodes adds one space
}
```

Words separated only by inline elements with no whitespace text between them (`<span>Only</span><span>2</span>`) are joined without a space, the same as `textContent`. They are not matched. This is a known limit.

### Locating a match and its smallest element

```ts
function locate(flow: Flow, re: RegExp) {
  const m = re.exec(flow.text);              // re is never global or sticky
  if (!m) return null;
  const first = nodeAt(flow, m.index);                 // the text node that holds the first character
  const last = nodeAt(flow, m.index + m[0].length - 1); // ... and the last
  let a: Element | null = first.parentElement!;
  const chain = new Set<Element>();
  for (let e: Element | null = a; e; e = e.parentElement) { chain.add(e); if (e === flow.block) break; }
  let b: Element = last.parentElement!;
  while (!chain.has(b)) b = b.parentElement!;      // lowest common ancestor, never above the block
  return { element: b, text: m[0], index: m.index };
}
```

Results for `<p>Only <b>2</b> left</p>`: the first node is `"Only "` (parent `p`), the last is `" left"` (parent `p`), so the element is the `<p>`. For `<p>Sale <b>Only 2 left</b></p>` both ends are inside the `<b>`, so the element is the `<b>`. For `<p>Only <span><b>2</b></span> left</p>` it is the `<p>`.

### Patterns

All patterns are case-insensitive and non-global. `\s+` between words is how "any whitespace is one space" is met.

```ts
// scarcity
const SCARCITY = [
  /\b(?:only|just)\s+\d{1,4}\s+(?:(?:items?|units?|rooms?|seats?|tickets?|pieces?|spots?|copies|pairs?)\s+)?(?:left|remaining|available|in\s+stock)\b/i,
  /\b\d{1,4}\s+(?:people|others|shoppers|customers)\s+(?:are\s+)?(?:viewing|looking|watching)\b/i,
  /\b(?:low\s+stock|selling\s+fast|almost\s+(?:gone|sold\s+out))\b/i,
];

// countdown (static urgency text)
const COUNTDOWN = [
  /\b(?:offer|sale|deal|discount|price|promo)s?\s+(?:ends?|expires?)\s+(?:in|on|at|soon|today|tonight)\b/i,
  /\b(?:ends?|expires?)\s+in\s+\d{1,3}\s*(?:d|h|m|s|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i,
  /\blimited[\s-]time\s+(?:offer|deal)\b/i,
  /\b\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?)\s+(?:left|remaining)\b/i,
];

// timer: a clock-shaped value (reported only when it ticks)
export const CLOCK = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(?:\d{1,2}\s*d\s*)?\d{1,2}\s*h\s*\d{1,2}\s*m(?:\s*\d{1,2}\s*s)?\b/i;

// prechecked: words in the label
const OPT_IN_WORDS = /\b(?:newsletters?|offers?|marketing|partners?|e-?mails?|subscribe)\b/i;
```

Confirmshaming is built from parts so that each part can be read and tested:

```ts
const LEAD   = String.raw`(?:no|nope|not\s+now|maybe\s+later|skip)`;
const THANKS = String.raw`(?:(?:no\s+)?thanks?|thank\s+you)?`;
const SEP    = String.raw`[\s,.!:;–—-]*`;
const I      = String.raw`(?:i|we)(?:['’](?:ll|m|d)|\b)`;
const SHAME  = "(?:" + [
  String.raw`hate\s+(?:saving|savings?|deals?|discounts?|free|bargains?|money|being|getting)`,
  String.raw`(?:like|love|enjoy)\s+(?:paying|missing|losing|wasting|being\s+(?:broke|bored|unhealthy))`,
  String.raw`prefer\s+(?:paying|to\s+pay|full|missing|losing|wasting)`,
  String.raw`(?:pay|paying)\s+(?:full|more|extra)`,
  String.raw`full\s+price`,
  String.raw`rather\s+(?:pay|miss|lose|waste|stay)`,
  String.raw`miss(?:ing)?\s+out`,
  String.raw`(?:don['’]t|do\s+not)\s+(?:like|want|need)\s+(?:to\s+save|saving|deals?|discounts?|savings?|free|bargains?|money)`,
  String.raw`stay\s+(?:broke|uninformed|ignorant)`,
].join("|") + ")";
const CONFIRM = new RegExp(`^${LEAD}\\b${SEP}${THANKS}${SEP}${I}[^.!?]*?\\b${SHAME}\\b`, "i");
```

| Text | Kind | Why |
| --- | --- | --- |
| `Only 2 left` · `just 3 items remaining` · `Only <b>2</b> left in stock!` | scarcity | pattern 1 |
| `12 people are viewing this blend` · `Low stock` | scarcity | patterns 2, 3 |
| `Offer ends in 3 hours` · `Ends in 15 min` · `Limited-time offer` · `2 hours left` | countdown | patterns 1–4 |
| `No thanks, I hate saving money` · `No, I prefer paying full price` · `Maybe later, I don't like deals` · `No thanks, I'll pay full price` | confirmshaming | `CONFIRM` |
| `Only the best coffee` · `Just 2 minutes from the station` · `Left-handed mugs` · `Our road ends in a cul-de-sac` | none | no number or no stock word |
| `No thanks` · `No, thanks` · `Not now` · `Maybe later` · `Skip` · `No thanks, I'm good` | none | no shaming clause |
| `Open daily 09:00 to 17:30` | none | clock text that never changes is not a timer |

### Algorithm

```
detectDarkPatterns(root, costumeHost):
  doc = root.ownerDocument ?? root
  found = new Map<Element, DarkPattern>()          // one per element
  add(kind, element, snippet): if (!found.has(element) || PRECEDENCE[kind] < PRECEDENCE[found.get(element).kind]) found.set(...)

  1. prechecked: for input of root.querySelectorAll('input[type="checkbox"]'):
       skip unless input.hasAttribute("checked"), skip if inSkipped(input)
       label = input.closest("label") ?? [...root.querySelectorAll("label[for]")].find(l => l.htmlFor === input.id)   // no selector built from the id
       text = collapse(label?.textContent ?? input.getAttribute("aria-label") ?? "")
       if OPT_IN_WORDS.test(text): add("prechecked", label ?? input, snippet(text, 0))
  2. confirmshaming: for c of root.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]'):
       skip if inSkipped(c); text = collapse(c is input ? c.value : c.textContent)
       if text.length <= 80 && CONFIRM.test(text): add("confirmshaming", c, snippet(text, 0))
  3. scarcity and countdown: walk the text nodes (TreeWalker with the prune filter) of root,
       group them by blockOf(node) into flows;
       for each flow: for [kind, patterns] of [scarcity, countdown]:
         first pattern p with a locate(flow, p) hit wins → add(kind, hit.element, snippetOf(hit.element, p))
  4. sort found.values() by document order (compareDocumentPosition); slice(0, 30)
```

`PRECEDENCE`: `prechecked` 0, `confirmshaming` 1, `scarcity` 2, `countdown` 3, `timer` 4 (timers only enter through `mergeCurses`).

The prechecked label element is the reported element so the badge sits by the visible words, not by a tiny checkbox. When the same `<label>` wraps two checked boxes, one curse is reported (one per element).

### Snippet

```ts
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function snippet(text: string, from: number): string {
  const t = text.slice(from);
  return t.length <= 60 ? t : t.slice(0, 59) + "…";
}
```

`text` is the collapsed shown text of the reported element. For `scarcity`, `countdown` and `timer`, `from` is the index where the match starts in that collapsed text. `snippetOf(element, re)` computes it: it collapses the element's shown text, runs `re` on it (the match is still there, because the element holds the whole match) and calls `snippet(text, match.index)`. For `confirmshaming` and `prechecked`, `from` is 0. The string is always set into the DOM with `textContent`.

### `mergeCurses`

```ts
export function mergeCurses(statics: readonly DarkPattern[], timers: readonly DarkPattern[]): DarkPattern[] {
  const kept = statics.filter(
    (s) => s.kind !== "countdown" || !timers.some((t) => t.element === s.element || s.element.contains(t.element) || t.element.contains(s.element)),
  );
  const byElement = new Map<Element, DarkPattern>();
  for (const p of [...kept, ...timers]) {
    const old = byElement.get(p.element);
    if (!old || PRECEDENCE[p.kind] < PRECEDENCE[old.kind]) byElement.set(p.element, p);
  }
  return [...byElement.values()].sort(byDocumentOrder).slice(0, 30);
}
```

When a timer shares an element with a `scarcity`, `prechecked` or `confirmshaming` pattern, the lower precedence number wins, so the timer yields.

### `KIND_INFO`

One table drives the card, the popup rows and the aria labels.

| Kind | `name` (popup row) | `title` (card) | `trick` (one line) |
| --- | --- | --- | --- |
| scarcity | Fake scarcity | Cursed: Fake scarcity | A low-stock warning makes you hurry. Many are never true. |
| countdown | Countdown | Cursed: Countdown | An offer with a deadline makes you rush. The deadline often comes back. |
| timer | Ticking timer | Cursed: Ticking timer | A clock counting down pushes you to decide fast. Many restart when you reload. |
| confirmshaming | Confirmshaming | Cursed: Confirmshaming | The decline button is worded to make you feel bad for saying no. |
| prechecked | Pre-checked opt-in | Cursed: Pre-checked opt-in | The box was ticked for you, so doing nothing signs you up. |

## Timer Watcher (`src/content/timers.ts`)

### Tick tracker (pure)

```ts
export interface TickOptions { changes?: number; windowMs?: number }   // defaults 3 and 10_000

export function createTickTracker(opts: TickOptions = {}) {
  const { changes = 3, windowMs = 10_000 } = opts;
  const seen = new WeakMap<Element, { value: string; times: number[]; reported: boolean }>();
  return {
    /** Note the clock value now showing in `block`; true the first time it has ticked enough. */
    note(block: Element, clock: string, now: number): boolean {
      const s = seen.get(block);
      if (!s) { seen.set(block, { value: clock, times: [], reported: false }); return false; }
      if (s.value === clock) return false;
      s.value = clock;
      s.times = [...s.times.filter((t) => now - t <= windowMs), now];
      if (s.times.length >= changes && !s.reported) { s.reported = true; return true; }
      return false;
    },
  };
}
```

### Watcher

```ts
export interface TimerOptions {
  now?: () => number;                                  // defaults to Date.now, injected by tests
  MutationObserver?: typeof MutationObserver;          // defaults to the document's window
}

export function watchTimers(doc: Document, costumeHost: string, onTimer: (p: DarkPattern) => void, opts: TimerOptions = {}): () => void {
  const tracker = createTickTracker();
  const mo = new (opts.MutationObserver ?? doc.defaultView!.MutationObserver)((records) => {
    const blocks = new Set<Element>();
    for (const r of records.slice(0, 200)) {
      const el = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (el?.isConnected && !inSkipped(el, costumeHost)) blocks.add(blockOf(el));
    }
    for (const block of blocks) {
      const flow = flowOf(block, costumeHost);
      const hit = locate(flow, CLOCK);
      if (hit && tracker.note(block, hit.text, (opts.now ?? Date.now)())) {
        onTimer({ kind: "timer", element: hit.element, snippet: snippetOf(hit.element, CLOCK) });
      }
    }
  });
  mo.observe(doc.body, { subtree: true, childList: true, characterData: true });
  return () => mo.disconnect();
}
```

Read-only by construction: the callback only reads `target`, the tree and text. It does not set attributes, does not call `observe` on anything inside the shadow root, and the costume host's own mutations never reach it (the shadow root is closed and the host is skipped).

The element is chosen when the tracker fires, so a page that replaces the clock's child on each tick is still reported on the node that holds the clock at that moment. The element is reported once per block. If that element is later removed from the page, the next rescan drops the curse (`isConnected`).

## Background (`src/background/router.ts`)

Edits to the existing file:

```ts
const TYPES = new Set([/* … */, "CURSE_UPDATE"]);

const isCurse = (c: unknown): c is Curse =>
  typeof c === "object" && c !== null &&
  (DARK_PATTERN_KINDS as readonly unknown[]).includes((c as Curse).kind) &&
  typeof (c as Curse).snippet === "string";

// tabOf: CURSE_UPDATE joins TRACKER_UPDATE, TOMBSTONE_UPDATE and CHECK_LINKS in the list that takes sender.tab.id.

async function getState(tabId) {
  /* … */
  curses: ((await session.get(cursesKey(tabId)))[cursesKey(tabId)] as Curse[] | undefined) ?? [],
}

async function clearTab(tabId) {
  await exorcist.clearTab(tabId);
  await session.remove([ghostsKey(tabId), nonceKey(tabId), tombstonesKey(tabId), cursesKey(tabId)]);
}

case "CURSE_UPDATE":
  if (!(await isHaunted(tabId))) break;
  if (Array.isArray(msg.curses)) {
    await session.set({
      [cursesKey(tabId)]: msg.curses.filter(isCurse).slice(0, 30).map(({ kind, snippet }) => ({ kind, snippet: snippet.slice(0, 60) })),
    });
  }
  break;
```

The error answer in `register` gains `curses: []`. A page script cannot send `CURSE_UPDATE`, because the router only accepts messages from the extension's own content script (`sender.id` check). Even a forged one could only change the popup list. A curse never reaches `declarativeNetRequest`.

## Badge Placement (`src/content/costume/curses.ts`)

### Line boxes

A block element's `getClientRects()` returns its one block box, which is as wide as its container. The badge must sit by the text, so the line boxes are taken from a `Range`:

```ts
export function lineRects(el: Element): Rect[] {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
}
// first = the rect with the smallest top, then the smallest left; last = the largest bottom, then the largest right
```

For an `<a>`, `<button>` or `<label>` the same call works. When the list is empty (the element is not rendered), no badge is shown.

### `curseSpot`

```ts
const H = 18, GAP = 4;

export function curseSpot(first: Rect, last: Rect, w: number, viewportWidth: number, text: readonly Rect[], slots: readonly Slot[]): { x: number; y: number } | null {
  const fits = (x: number, y: number) =>
    x >= 0 && y >= 0 && x + w <= viewportWidth &&
    !text.some((r) => r.left < x + w && r.right > x && r.top < y + H && r.bottom > y);

  // (a) 4px right of the last line box, centred on it
  const a = { x: Math.round(last.right + GAP), y: Math.round((last.top + last.bottom) / 2 - H / 2) };
  if (fits(a.x, a.y)) return a;

  // (b) 4px above the first line box, left edges aligned (the element's margin)
  const b = { x: Math.round(first.left), y: Math.round(first.top - GAP - H) };
  if (fits(b.x, b.y)) return b;

  // (c) the gutter lane slot that holds the last line's y, on its inner edge nearest the element
  const y = a.y;
  let best: { x: number; y: number } | null = null, dist = Infinity;
  for (const s of slots) {
    if (s.y > y || y + H > s.y + L.slotPitch) continue;
    const x = s.side === "left" ? s.x + s.w - w : s.x;
    const d = Math.abs(x - last.right);
    if (d < dist) [best, dist] = [{ x, y }, d];
  }
  return best;
}
```

`text` comes from `textNear(element, cache)`, the helper in `costume/tombstones.ts` that collects the text rects around an element's block and its siblings. This spec exports it. The element's own lines are in that list; they cannot intersect spot (a) or (b) by construction, and any tight-leading case where they do falls through to the next spot. Spot (b) is why the fixture gives every cursed element 28px of top margin.

### `mountCurses`

```ts
export interface CurseOptions {
  slots: () => readonly Slot[];          // planSlots at the current layout
  fade: () => boolean;                   // true once the haunt moment is over and motion is allowed
  onOpen: (curse: Curse, badge: HTMLElement) => void;
}
export interface CurseBadges {
  update(patterns: readonly DarkPattern[]): void;   // full list: adds, removes, keeps
  place(): void;
  stop(): void;
}
```

Behaviour mirrors `mountTombstones`:

- `update` creates one `<button class="curse-badge" data-kind="…">` per new element, with `aria-label` `<title>: <snippet>`, the skull SVG and the text `CURSED!`. It removes badges whose pattern left the list, observes each element with an `IntersectionObserver` and calls `place()`.
- `place` re-measures per frame: `el.style.display = ""`, measure `offsetWidth`, take `lineRects(element)` (none: `display: none`), compute `curseSpot`, and write `left` and `top`. A badge whose element is off screen (`onScreen` false from the observer) or that has no spot gets `display: none`.
- `scroll` (capture, passive) and `resize` listeners schedule one `requestAnimationFrame` pass. Page mutation reaches `place()` through the existing `relayout`.
- A badge added after the haunt moment fades in with `el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" })` when `opts.fade()` is true.
- `stop` cancels the frame, disconnects the observer, removes both listeners and removes the badges.

The badge never gets a handler on the page element and never touches it. The `IntersectionObserver` and the rect reads are the only page contact.

### Badge art and CSS

`art.ts` gains a 6×6 skull (`BADGE_SKULL`, drawn 12×12 at 2px, matching `SPRITES.badgeIcon`), web-safe colours only:

```ts
export const BADGE_SKULL = [".WWWW.", "WWWWWW", "WkWWkW", "WWWWWW", ".WkkW.", ".W..W."];
export const BADGE_SKULL_LEGEND: Legend = { W: P.ghostWhite, k: P.ink };
export const curseBadgeSvg = () => svgMarkup(mapToPx(BADGE_SKULL, BADGE_SKULL_LEGEND, PIXEL.iconScale), 12, 12);
```

White with black eyes reads on the `#ff9900` ground (the `#000000` outline of the badge frames it).

```css
.curse-badge {
  position: absolute; display: inline-flex; align-items: center; gap: 4px; box-sizing: border-box;
  height: 18px; margin: 0; padding: 0 4px; white-space: nowrap; cursor: pointer; pointer-events: auto;
  background: #ff9900; color: #000000; border: 1px solid #000000; box-shadow: 2px 2px 0 #000000;
  font: bold 11px/16px "Comic Sans MS", "Comic Sans", cursive;
}
.curse-badge svg { display: block; flex: none; image-rendering: pixelated; }
.curse-badge:focus-visible { outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 2px 2px 0 #000000, 0 0 0 5px #000000; }
```

(The costume's CSS template in `styles.ts` uses the palette tokens `P.curse` and `P.ink`; the literal values above are what they resolve to.)

## Curse Card (`src/content/costume/card.ts`)

`openCurseCard` sits next to `openCard` and `openTombstoneCard` and reuses the private `show()` helper, so it gets the same Esc handling, `[x]` button, opener bookkeeping and placement.

```ts
export function openCurseCard(cards: HTMLElement, curse: Curse, opener: HTMLElement, opts: Pick<CardOptions, "bounds" | "reduced">): HTMLElement {
  cards.querySelector(".card")?.remove();                      // one card at a time
  const doc = cards.ownerDocument;
  const info = KIND_INFO[curse.kind];
  const card = doc.createElement("section");
  card.className = "card curse-card";
  card.dataset.kind = curse.kind;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "card-title");
  card.innerHTML =
    `<div class="bar"><h2 id="card-title"></h2><button class="close win95" type="button" aria-label="Close">x</button></div>` +
    `<div class="card-body"><p class="quote"></p><p class="trick"></p></div>`;
  card.querySelector("h2")!.textContent = info.title;
  card.querySelector(".quote")!.textContent = `\u201C${curse.snippet}\u201D`;
  card.querySelector(".trick")!.textContent = info.trick;
  show(cards, card, opener, L.cardWidth, opts);
  card.querySelector<HTMLElement>(".close")!.focus();
  return card;
}
```

Title bar colour is the default `#330066` (only the vampire card changes it). The snippet and every other string come from `textContent`, never `innerHTML`, so page text cannot inject markup. The card uses the 248px width, the 2px outset bevel and the `4px 4px 0 #000000` shadow of the shared card frame, and stays at least 8px from both viewport edges.

CSS additions: `.curse-card .quote { font-style: italic; overflow-wrap: anywhere; }` so a long unbroken snippet cannot widen the card.

## Costume Integration (`src/content/costume/render.ts`)

New state next to the tombstone state:

```ts
const known = new Map<Element, DarkPattern>();   // statics by element: the first kind and snippet seen stay
let timers: DarkPattern[] = [];
let curses: Curse[] = [];
let lastSent = "";

const renderCounts = () => {            // the existing setCounts call, factored so both ghosts and curses use it
  const vampires = scan.companies.filter((c) => c.vampire).length;
  setCounts(hud, { ghosts: scan.companies.length - vampires, vampires, tombstones: dead.length, curses: curses.length });
};

const commit = () => {
  const patterns = mergeCurses([...known.values()], timers);
  badges.update(patterns);
  curses = patterns.map(({ kind, snippet }) => ({ kind, snippet }));
  renderCounts();
  const key = JSON.stringify(curses);
  if (key !== lastSent) { lastSent = key; send({ type: "CURSE_UPDATE", curses }); }
};

const rescan = () => {
  for (const p of detectDarkPatterns(doc, HOST_TAG)) if (!known.has(p.element)) known.set(p.element, p);
  for (const el of known.keys()) if (!el.isConnected) known.delete(el);
  timers = timers.filter((t) => t.element.isConnected);
  commit();
};
```

- `refresh()` (ghost/vampire/tombstone changes) calls `renderCounts()` instead of its inline `setCounts`.
- `badges = mountCurses(markers, { slots: () => slots, fade: () => settled && !motion.matches, onOpen: (c, b) => openCurseCard(cards, c, b, { bounds: bounds(), reduced: motion.matches }) })`.
- `relayout` also calls `badges.place()`.
- The existing `mo` callback becomes `() => { relayout(); scheduleRescan(); }`. `scheduleRescan` is a trailing 500 ms debounce that never runs sooner than 2 s after the previous rescan. The existing observer does not watch `characterData`, so a clock that ticks by editing a text node does not trigger rescans on its own.
- After the layers are built: `rescan()` once, then `const stopTimers = watchTimers(doc, HOST_TAG, (p) => { timers.push(p); commit(); })`.
- `onUnhaunt` adds: `stopTimers()`, `badges.stop()`, clear the debounce timer. The card is already closed by the existing `closeCard(cards)`.

The detection runs in the same task as the haunt, after the shadow host is attached, so `detectDarkPatterns` skips `hg-crypt` by tag name. The haunt moment already fades the whole `#markers` layer at 2300-2500 ms (and cross-fades the root under reduced motion), so badges present at haunt need no extra animation.

## HUD

`setCounts` already renders `curses`. Only the value changes: `curses: curses.length` through `renderCounts()`. The empty state (`No ghosts here. Suspiciously clean.`) shows only when all four counts are zero, so a page with curses and nothing else shows its counts.

## Popup (`src/popup/screens.ts`, `sprites.ts`, `styles.css`)

```ts
function curseRow(doc: Document, c: Curse): HTMLElement {
  const info = KIND_INFO[c.kind];
  return h(doc, "li", { class: "ghost-row curse-row", tabindex: "0", "aria-label": `${info.name}: ${c.snippet}` },
    h(doc, "span", { class: "icon-tile" }, curseTile(doc)),
    h(doc, "span", { class: "row-text" },
      h(doc, "span", { class: "row-title" }, info.name),
      h(doc, "span", { class: "row-line" }, h(doc, "span", { class: "row-sub quote" }, `\u201C${c.snippet}\u201D`))));
}
```

In the haunted branch of `renderScreen`:

```ts
const curses = state.curses ?? [];
tiles.querySelector('[data-count="curses"] .num')!.textContent = String(curses.length);
const curseList = curses.length
  ? [h(doc, "h2", { class: "list-head curses-head" }, "Curses ", h(doc, "span", { class: "list-count" }, String(curses.length))),
     h(doc, "ul", { class: "rows" }, ...curses.map((c) => curseRow(doc, c)))]
  : [h(doc, "p", { class: "muted no-curses" }, "No curses. This page plays fair.")];
const list = [...ghostList, ...vampireList, ...tombList, ...curseList];
```

- `curseTile(doc)` is added to `sprites.ts` beside `tombTile`, using the `curse` sprite the Curses tile already uses.
- `styles.css` gains `.curses-head`, `.no-curses` and `.curse-row` by copying the `.tombstones-head`, `.no-tombstones` and `.tombstone-row` rules, plus `.curse-row .row-sub.quote { white-space: normal; overflow-wrap: anywhere; }`. The row focus ring is the existing `outline: 2px solid #6633cc; outline-offset: 2px`.
- The list surface's `aria-label` becomes `Ghosts, vampires, tombstones and curses`.
- `src/popup/app.ts`: `NO_TAB` gains `curses: []`.

## Fixture (`fixtures/dark-patterns.html`)

A standalone fake shop, `Lantern Moth Coffee` (no real brand), in the style of the other fixtures. The contract is the table: these six, and nothing else, are curses.

| Element | Kind | Text | Notes |
| --- | --- | --- | --- |
| `p#stock` | scarcity | `Only <b>2</b> left in stock!` | split markup; snippet `Only 2 left in stock!` |
| `p#viewers` | scarcity | `12 people are viewing this blend right now` | |
| `p#sale` | countdown | `Offer ends in 3 hours, so hurry.` | static text |
| `p#clock` | timer | `Cart reserved for 09:59` | the page script ticks it once a second, 09:59 down to 00:00, then restarts |
| `label#optin` | prechecked | `<input type="checkbox" name="news" checked> Yes, send me the newsletter and partner offers` | |
| `a#decline` | confirmshaming | `No thanks, I hate saving money` | `href="#no"` |

Innocent controls (each must produce no curse):

| Element | Why it must not match |
| --- | --- |
| `Only the best coffee, roasted by candlelight in a very small shed.` | no number |
| `Just 2 minutes from the station. Open daily 09:00 to 17:30.` | no stock word; a static clock never ticks |
| `Left-handed mugs ship free.` | no `only`/`just` and number |
| `<button id="plain-decline" type="button">No thanks</button>` | plain decline |
| `<label><input type="checkbox" name="remember" checked> Remember my cart</label>` | checked, no marketing word |
| `<label><input type="checkbox" name="restock"> Email me when it is back</label>` | marketing word, not checked |
| `<p hidden>Only 1 left</p>` · `<div style="display: none">Only 1 left</div>` · `<noscript>Only 1 left</noscript>` · `<template>Only 1 left</template>` · `/* Only 1 left */` in the inline script | skipped nodes |

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>Lantern Moth Coffee: Cart</title>
    <style>
      body { margin: 0; padding: 24px 0 0; font-family: Georgia, serif; line-height: 1.6; color: #1d1d1b; background: #fbfaf6; }
      main { max-width: 520px; margin: 0 auto; padding: 0 16px 96px; }
      h1 { font-size: 2rem; margin: 0 0 0.5rem; }
      p, label, .row { margin: 0; }
      .gap { margin-top: 28px; }      /* room above every cursed element for a badge in the margin */
      label { display: block; }
    </style>
  </head>
  <body>
    <main>
      <h1>Lantern Moth Coffee</h1>
      <p>Only the best coffee, roasted by candlelight in a very small shed.</p>
      <p class="gap">Just 2 minutes from the station. Open daily 09:00 to 17:30.</p>
      <p class="gap">Left-handed mugs ship free.</p>
      <h2 class="gap">Midnight Blend, 250 g</h2>
      <p id="stock" class="gap">Only <b>2</b> left in stock!</p>
      <p id="viewers" class="gap">12 people are viewing this blend right now</p>
      <p id="sale" class="gap">Offer ends in 3 hours, so hurry.</p>
      <p id="clock" class="gap">Cart reserved for 09:59</p>
      <form action="thanks.html" class="gap">
        <label id="optin" class="gap"><input type="checkbox" name="news" checked> Yes, send me the newsletter and partner offers</label>
        <label class="gap"><input type="checkbox" name="remember" checked> Remember my cart</label>
        <label class="gap"><input type="checkbox" name="restock"> Email me when it is back</label>
        <div class="row gap"><button id="plain-decline" type="button">No thanks</button></div>
        <div class="row gap"><a id="decline" href="#no">No thanks, I hate saving money</a></div>
        <div class="row gap"><button type="submit">Place order</button></div>
      </form>
      <p hidden>Only 1 left</p>
      <div style="display: none">Only 1 left</div>
      <noscript>Only 1 left</noscript>
      <template>Only 1 left</template>
    </main>
    <script>
      /* Only 1 left */
      (function () {
        var el = document.getElementById("clock");
        var left = 599;
        setInterval(function () {
          left = left > 0 ? left - 1 : 599;
          var m = ("0" + Math.floor(left / 60)).slice(-2), s = ("0" + (left % 60)).slice(-2);
          el.firstChild.nodeValue = "Cart reserved for " + m + ":" + s;
        }, 1000);
      })();
    </script>
  </body>
</html>
```

The page's own script edits the text of `#clock`, so the byte-identical check in the e2e test normalises that one value (`Cart reserved for \d\d:\d\d` becomes `Cart reserved for MM:SS`) in both snapshots. Every other byte must match. The page needs no fixture-server change.

## Non-Destructive Guarantees

| Surface | Guarantee |
| --- | --- |
| `detectDarkPatterns` | Reads the tree, `getComputedStyle` and attributes. No writes. Called twice on a frozen tree it returns equal results (tested with `outerHTML` before and after). |
| `watchTimers` | One `MutationObserver` on `document.body`, options `{ subtree, childList, characterData }`. The callback reads only. `stop()` disconnects. |
| Pre-checked boxes | The `checked` attribute is read; the property is never set; no event is dispatched; clicking a badge does not reach the input. |
| Badges and card | Created with `createElement` inside the closed shadow root; strings set with `textContent`. |
| Un-haunt | The host and its adopted sheet are removed; the observers, listeners and timers are stopped. The page's own text changes are the only possible difference (the fixture clock). |

## Test Plan

### Layout

```
test/dark-patterns/
  detect.test.ts        # per-kind positive/negative cases, snippet, precedence, cap, skipped nodes, purity
  properties.test.ts    # seeded PRNG: split markup and cross-block / look-alike negatives
  timers.test.ts        # tick tracker, watcher with a fake MutationObserver, block tracking, merge
  merge.test.ts         # mergeCurses: timer over countdown, nesting, precedence, cap, order
  markers.test.ts       # lineRects, curseSpot, mountCurses (observer, rAF, fade, reduced motion, stop)
  card.test.ts          # openCurseCard titles, quote, trick, Esc and focus, one at a time, no innerHTML
  router.test.ts        # CURSE_UPDATE accepted/dropped/cleaned, getState, clearTab, navigation
  popup.test.ts         # curse rows, tile, empty line, order after tombstones, focus ring
  wiring.test.ts        # renderCostume: HUD count, CURSE_UPDATE sent once per change, un-haunt cleanup
  fixture.test.ts       # fixtures/dark-patterns.html through detectDarkPatterns gives exactly the six
e2e/
  dark-patterns.spec.ts # 1280 and 375: badges, cards, Esc, popup list, checkbox, byte-identical Un-haunt
```

Unit tests use `happy-dom` like the existing tombstone tests (`new Window({ url, width, height })`, aborted in `afterEach`). Layout-dependent tests pass stub rects to the pure placement functions instead of relying on happy-dom layout.

### Property test (split markup)

`properties.test.ts` copies the local `prng` (mulberry32), `int`, `pick`, `SEED` and `CASES = 300` helpers and the `forAll` wrapper that names the seed and case on failure, from `test/tracker/properties.test.ts`. It adds no dependency.

Generator, per case:

1. Pick a phrase: a scarcity phrase built from random parts (`pick` of `Only`/`just`/`ONLY`, a number from 1 to 99, an optional noun, `left`/`remaining`/`available`/`in stock`), or a countdown phrase (`Offer ends in 3 hours`, `Limited time offer`).
2. Cut it into 1 to 5 contiguous pieces at random word boundaries (the cut keeps the space on one side).
3. Build `<p>` = optional innocent prefix text + the pieces + optional innocent suffix. Each piece is a text node, optionally wrapped in 1 to 3 nested inline elements chosen from `b i em strong span u`. With some probability a run of consecutive pieces is wrapped together in one more inline element.
4. The model records, for each piece, the chain of elements from the `<p>` down to the piece's text node. The expected element is the last element the chains of all pieces share (the model's own lowest common ancestor, computed from the generated structure, not by calling the code under test).
5. Random case (`toUpperCase`, `toLowerCase`) and random single-space or multi-space or newline whitespace between words, inside a text node.

Properties:

- **Found once, on the smallest element.** `detectDarkPatterns` returns exactly one pattern, of the phrase's kind, whose `element` is the model's expected element.
- **Snippet.** `snippet.length <= 60` and, for a phrase shorter than 60 characters, it equals the collapsed text of the reported element from the match onward.
- **Pure.** The tree's `outerHTML` is unchanged after the call.
- **Cross-block negative.** The same pieces placed in two sibling `<p>` elements, cut so that no one block holds the whole phrase, give zero patterns.
- **Look-alike negative.** Phrases built from the same parts with one required piece swapped (`Only the best coffee`, number removed, `left` replaced by `lift`) and split the same random way give zero patterns.
- **One per element.** Two phrases of different kinds in the same `<p>` give one pattern, of the higher precedence (`scarcity` over `countdown`).

### Timer tests

- `createTickTracker`: no report on the first value; none for the same value repeated; none for 2 changes; report on the 3rd change; not reported twice; changes older than 10 s do not count (injected `now`).
- `watchTimers` with a stub `MutationObserver` class that captures the callback: feed `characterData` records for a block whose text goes `09:59`, `09:58`, `09:57`, `09:56` and expect one `onTimer` with `kind: "timer"`, the block's smallest clock element and snippet; feed a static clock (`17:30` repeated) and expect none; feed a split clock (`<span>09</span>:<span>58</span>`) and expect the parent element; feed records for a node inside `hg-crypt` and expect none; feed 300 records and expect 200 processed; `stop()` calls `disconnect`.
- The observer is created with exactly `{ subtree: true, childList: true, characterData: true }` and the tree is unchanged after a run.

### E2E (`e2e/dark-patterns.spec.ts`)

Uses `fixture`, `haunt`/`openPopup`, `shadowOf`, `tabIdOf` from `e2e/fixtures.ts`, as `e2e/tombstones.spec.ts` does.

1. **Both widths** (`for (const width of [1280, 375])`): load `dark-patterns.html`, record `before` (`outerHTML` with the clock value normalised), HAUNT through the popup. Poll (up to 10 s, the timer needs about 3 s of ticks) for six `.curse-badge` elements in `#markers`, with kinds `scarcity, scarcity, countdown, timer, prechecked, confirmshaming` in document order.
2. **Beside, never over.** For each badge: height 18, shown, aria-label starting `Cursed:`. Its position is one of (a) 4px (±0.5) right of the last line box of its page element, vertically within it, (b) its bottom 4px (±0.5) above the first line box with its left edge on the line's left edge, or (c) inside a gutter lane. Its rect intersects no text rect of the page (a `TreeWalker` plus `Range` rect pass, as in the tombstone spec). The page has no horizontal scroll at 375.
3. **Cards.** Click each badge, check the title (`Cursed: Fake scarcity`, `Cursed: Fake scarcity`, `Cursed: Countdown`, `Cursed: Ticking timer`, `Cursed: Pre-checked opt-in`, `Cursed: Confirmshaming`), the quoted snippet (the timer's matches `/^“Cart reserved for \d\d:\d\d”$/`), a non-empty trick line, focus inside the card, and at least 8px between the card (plus its 4px shadow) and both viewport edges. Press Escape: the card is gone and the active element is the same badge. Press Enter on the focused badge: the card opens again. Escape.
4. **Checkbox.** After haunting, after clicking the pre-checked badge and after Un-haunt, `input[name=news]` has `checked === true` and `hasAttribute("checked")`. The `remember` box is still checked and the `restock` box still unchecked.
5. **Popup.** Open the popup for the tab: the Curses tile shows 6; the Curses list has 6 rows with the kind names and quoted snippets; the Curses heading follows the Tombstones empty line (`No tombstones. Every link is alive.`) in document order. A row shows the `#6633cc` focus ring when reached with Tab. `GET_STATE` returns `curses` of length 6 and the session key `curses:<tabId>` holds the same.
6. **HUD.** The HUD curse count (`#hud .count.curses .n`) is `6`.
7. **Un-haunt.** After UNHAUNT: `hg-crypt` is gone, `GET_STATE` returns `curses: []`, the session key is gone, and `outerHTML` (clock value normalised) equals `before` byte for byte.
8. **Clean page.** On `clean.html`, haunt: the popup shows `No curses. This page plays fair.`, the Curses tile shows 0, and the HUD curse count is 0.
9. **Reduced motion.** With `reducedMotion: "reduce"`, haunt the fixture: the badges and the open card have no running animations (`getAnimations()` is empty).

The test fails on any console error, as every spec does through the `consoleErrors` fixture.

## Known Limits

- Words separated only by inline elements with no whitespace between them are read as one word (the same as `textContent`), so they are not matched.
- Detection is English only.
- `Remember my email` pre-checked would be flagged, because `email` is on the keyword list. The list is the one the brief names.
- A tombstone marker and a badge can land on the same line. Both avoid page text; neither avoids the other.
- Detection runs `getComputedStyle` on each element it walks. On a very large page a rescan is costly, which is why rescans are debounced and spaced 2 seconds apart.
- A ticking clock only becomes a curse after three changes (about 3 seconds for a one-second clock).
