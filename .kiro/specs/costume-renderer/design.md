# Design: Costume Renderer (R4)

## Context

This spec renders the 1998 GeoCities crypt costume — the visual overlay that the scaffold's `haunt()` / `unhaunt()` lifecycle manages. It builds on the existing closed Shadow DOM host from `src/content/overlay.ts` and adds the structural layers, haunt-moment animation, body-padding stylesheet, and reduced-motion handling. Trackers, vampires, tombstones, and dark-pattern curse badges are out of scope; later specs populate the lane and marker layers established here.

Steering references: `product.md` (costume overlay, scope boundaries), `tech.md` (Shadow DOM, adopted stylesheets, MutationObserver, IntersectionObserver, Web Audio), `structure.md` (directory layout, one responsibility per module), `non-destructive-dom.md` (shadow root isolation, adopted stylesheets, byte-identical un-haunt, no form changes), `accessibility-and-motion.md` (reduced motion, 3 Hz ceiling, keyboard, contrast, audio muted by default), `era-accuracy.md` (web-safe colours, Comic Sans MS / Times New Roman, tiled backgrounds, marquees, hit counters, web rings, original pixel art). Design reference: `design/DESIGN.md` Costume, Haunt moment, Motion, and Tokens sections.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  document (page)                                                          │
│    <html>                                                                 │
│      ... page nodes (untouched) ...                                       │
│      <hg-crypt>  ← host element, position:fixed, pointer-events:none     │
│        └─ closed shadow root                                              │
│             adoptedStyleSheets: [hostSheet, costumeSheet]                 │
│             #crypt-root                                                   │
│               ├── [z:1]  #starfield      (gutter tile, pointer-events:none)│
│               ├── [z:2]  #lanes         (empty in this spec)              │
│               ├── [z:3]  #markers       (empty in this spec)              │
│               ├── [z:4]  #top-bands     (neighborhood bar + marquee)      │
│               ├── [z:5]  #hud           (Hide, counts, odometer, ring)   │
│               ├── [z:6]  #cards         (empty in this spec)              │
│               └── [z:7]  #fx            (haunt-moment only, removed after)│
│    document.adoptedStyleSheets: [bodyPaddingSheet]  ← the one doc-level change│
└──────────────────────────────────────────────────────────────────────────┘
```

The renderer is called from `src/content/index.ts` after `haunt()` returns the shadow root. It creates the layer DOM inside the root, injects the costume adopted stylesheet, adds the body-padding sheet to the document, runs the haunt moment, and registers the reduced-motion listener. Un-haunt (triggered by the existing `unhaunt()` call) runs the reverse sequence and then removes the host + body-padding sheet.

## Module Layout

```
src/content/
  index.ts              # existing: calls haunt(), registers unhaunt listener
  overlay.ts            # existing: haunt()/unhaunt() — host + closed shadow root
  costume/
    render.ts           # main entry: build all layers, run haunt moment, wire Hide/Show
    tokens.ts           # typed export of the DESIGN.md costume + motion tokens
    starfield.ts        # paint the 64×64 tile, compute content column, place gutters
    bands.ts            # neighborhood bar + marquee
    hud.ts               # HUD frame, Hide/Show, counts, odometer, web ring
    haunt-moment.ts     # Web Animations API haunt + un-haunt sequences
    reduced-motion.ts   # matchMedia listener, apply/remove reduced-motion class
    body-padding.ts     # adopted stylesheet for body padding, computed + updated
```

Shared types stay in `src/data/types.ts`. The costume modules import `haunt` / `unhaunt` only from `overlay.ts`; they never touch `document` directly except for the body-padding adopted sheet and `elementsFromPoint` sampling.

## Tokens Module (`tokens.ts`)

Exports the costume palette, hem tints, fonts, pixel scales, sprite sizes, layout dimensions, hard shadow, focus ring, and motion tokens — all typed from the `## Tokens` JSON in `design/DESIGN.md`.

```ts
export const PALETTE = {
  crypt: "#000033",
  cryptViolet: "#330066",
  spectral: "#6633cc",
  ectoplasm: "#66ff99",
  ghostWhite: "#ffffff",
  ghostShade: "#ccffff",
  vampireGlow: "#ff0033",
  vampireLining: "#660000",
  bone: "#ffffcc",
  star: "#ffff66",
  stone: "#cccccc",
  stoneShadow: "#666666",
  moss: "#336633",
  curse: "#ff9900",
  ink: "#000000",
  bevelLight: "#ccccff",
  bevelDark: "#333366",
  hudBevelLight: "#9999cc",
} as const;

export const HEM_TINTS = ["#ff99cc", "#99ccff", "#ccff99", "#ffcc99", "#cc99ff", "#99ffcc"] as const;

export const FONTS = ['Comic Sans MS', 'Times New Roman'] as const;

export const PIXEL = { spriteScale: 3, iconScale: 2 } as const;

export const SPRITES = {
  ghost: [48, 48], vampire: [48, 54], webmasterGhost: [96, 96],
  tombstoneMarker: [16, 20], badgeIcon: [12, 12], hudIcon: [16, 16],
} as const;

export const LAYOUT = {
  laneWidth: 64, slotPitch: 72, neighborhoodBar: 24, marquee: 24,
  hudMinHeight: 40, hudMaxWidth: 720, hudWrapBelow: 400, cardWidth: 248,
  tombstoneWidth: 176, starTile: 64, minText: 11,
} as const;

export const HARD_SHADOW = "4px 4px 0 #000000" as const;
export const FOCUS_RING = "2px dotted #ffff66" as const;

export const MOTION = {
  fast: 120, base: 200, slow: 300, haunt: 2500, unhaunt: 1100,
  reducedHaunt: 300, reducedUnhaunt: 200,
  easeOut: "cubic-bezier(.2,.8,.2,1)",
  easeInOut: "cubic-bezier(.45,0,.2,1)",
  ghostBob: { px: 4, ms: 4000 },
  ghostSway: { px: 6, ms: 7000 },
  marqueePxPerSec: 60,
  twinkleMs: 2000,
} as const;
```

## Starfield (`starfield.ts`)

### Tile painting

Draw a 64×64 canvas once:
- Fill ground `#000033`.
- Place 6 individual `#ffffff` pixels at fixed positions.
- Place 2 `#ffff66` 2×2 blocks.
- Place 1 `#ffffcc` 5×5 4-point twinkle (a plus/cross shape).
- Convert to a data URL for use as `background-image: url(...) repeat`.

### Content column

```ts
function computeContentColumn(doc: Document): { left: number; right: number } {
  // 1. Start from main/article bounding box. If neither, widest block > 50% text.
  // 2. Iterate all text nodes (TreeWalker), union their rects (getClientRects).
  // 3. Return left = min left, right = max right, clamped to viewport.
}
```

### Gutter placement

The starfield container is `position: fixed; inset: 0; z-index: 1; pointer-events: none`. It renders two gutter divs:
- Left gutter: `left: 0; width: contentColumn.left`.
- Right gutter: `width: calc(100vw - contentColumn.right); right: 0`.

Each gutter has `background-image` set to the tile URL, `background-repeat: repeat`, `opacity: 0.92`. The 16px edge toward the column uses a 2×2 checker via a second background layer or a pseudo-element with a `conic-gradient`-free dithering technique (CSS `background` with a tiny 4px tile of alternating `#000033`/transparent).

### Narrow pages

If `contentColumn.left < 64 && (viewport.width - contentColumn.right) < 64`, the gutters are not rendered. The starfield still appears inside the top bands and HUD (they carry their own background references to the same tile).

## Top Bands (`bands.ts`)

A `#top-bands` container at `position: fixed; top: 0; left: 0; right: 0; z-index: 4`.

### Neighborhood bar (24px)

- `#330066` ground, Times New Roman 13px, `#ffffcc` text.
- Left: `You are in: <Neighborhood>`.
- Right: 48×24 under-construction sign (original pixel art, 2 frames at 1 Hz with motion, static under reduced motion).

### Neighborhood placeholder

Since per-host neighborhoods are a later spec, the renderer uses a deterministic placeholder derived from the host name:

```ts
function neighborhoodFor(host: string): string {
  // Deterministic but non-meaningful until the data module lands.
  const h = simpleHash(host);
  const areas = ["Area51", "Heartland", "SiliconValley", "SunsetStrip", "Tokyo", "Vienna"];
  return `${areas[h % areas.length]}/Vault/${1000 + (h % 9000)}`;
}
```

### Marquee (24px)

- `#000033` ground, Comic Sans MS 14px, `#66ff99` text.
- Content: `~*~ Welcome to my haunted homepage!!! ~*~ Best viewed at 800x600 ~*~`.
- Animation: `translateX` keyframe from `100%` to `-100%` at 60px/s. Implemented via CSS `@keyframes` in the costume stylesheet.
- `animation-play-state: paused` when `document.hidden` (visibilitychange listener).
- Under reduced motion: static, first line shown, ellipsis, advances only on Hide/Show.

### Fixed/sticky detection

```ts
function topOffset(doc: Document): number {
  // Sample elementsFromPoint at y=8 across the viewport width.
  // If any returned element is position:fixed or sticky with top:0, return its bottom.
  return 0; // default
}
```

The bands' `top` is set to `topOffset(doc)`.

## HUD (`hud.ts`)

### Frame

- `position: fixed; bottom: calc(8px + var(--hg-lift)); left: 8px; right: 8px; max-width: 720px; margin: 0 auto; min-height: 40px; z-index: 5; pointer-events: auto`.
- Background: `#000033` with starfield tile at `30%` opacity (via `background-blend-mode` or a pseudo-element).
- 2px bevel: `border: 2px outset; border-color: #9999cc #333366 #333366 #9999cc`.
- 1px outer line + `box-shadow: 4px 4px 0 #000000`.

### Layout (DOM order = visual order)

```
[Hide]  [ghost-icon] 0 [vampire-icon] 0 [tomb-icon] 0 [curse-icon] 0  Souls counted: [000000]  « prev | Haunted WebRing | next »
```

Using `display: flex; align-items: center; gap: 8px; flex-wrap: nowrap` (wrap at ≤400px).

### Lift sampling

```ts
function sampleBottomLift(doc: Document): number {
  // For y in [viewport.height - 80, viewport.height] step 8px:
  //   elementsFromPoint(viewport.width / 2, y)
  // If any element is position:fixed/sticky with bottom:0, return its height.
  return 0;
}
```

`--hg-lift` is set as a CSS custom property on the shadow root's `:host` (via the costume stylesheet or inline style on the host). Re-checked on `resize` and `MutationObserver` callbacks.

### Hide / Show

- `[Hide]` button: Win95 style (see tokens). On click:
  1. All costume layers (starfield, bands, HUD content except the Show tab, lanes, markers, cards) get `opacity: 0; pointer-events: none` via a class on `#crypt-root`, transition 200ms.
  2. A `#show-tab` element appears at `bottom: 8px; right: 8px`, 40×40, ghost icon, `pointer-events: auto`.
- `[Show]` tab: On click or Enter, remove the hidden class, restore opacity over 200ms, remove the tab.
- Haunt state preserved: the host, shadow root, adopted sheets all remain.

### Counts

- Each count: 16px icon SVG (using existing `sprite()` from `src/popup/sprites.ts`, or a content-side equivalent) + Comic Sans 13px `#ffffcc` number.
- In this spec, all counts are 0.
- Empty state: when all counts are 0, the counts area is replaced by `No ghosts here. Suspiciously clean.`

### Hit counter (odometer)

- Label: `Souls counted:` (Comic Sans 11px `#ffffcc`).
- 6 cells, each 10×16px, `#000000` ground, `#66ff99` digits from an original 5×7 pixel font.
- Value: 0 in this spec. The digit strip is a single div per cell with `translateY` for the roll animation.
- During haunt moment: roll from `000000` to value, right digit first, 600ms.

### Web ring

- `« prev | Haunted WebRing | next »`
- Prev/next are `<button>` elements (keyboard reachable, focus ring).
- In this spec they are present but inert (no sprites to move to).

### Responsive (≤400px)

- Insets drop to 4px.
- `flex-wrap: wrap; row-gap: 4px`.
- Row 1: Hide + counts. Row 2: hit counter + web ring.
- Max 2 rows (88px), no horizontal scroll.

## Body Padding (`body-padding.ts`)

```ts
export function applyBodyPadding(doc: Document, hudHeight: number, lift: number): CSSStyleSheet {
  const sheet = new (doc.defaultView ?? window).CSSStyleSheet();
  const orig = doc.defaultView!.getComputedStyle(doc.body);
  sheet.replaceSync(`body {
    padding-top: calc(${orig.paddingTop} + 48px) !important;
    padding-bottom: calc(${orig.paddingBottom} + ${hudHeight + 16 + lift}px) !important;
  }`);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  return sheet;
}

export function removeBodyPadding(doc: Document, sheet: CSSStyleSheet): void {
  doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(s => s !== sheet);
}
```

The sheet is stored alongside the overlay so `unhaunt()` can remove it. Recomputed when the HUD wraps (viewport ≤400px) or when `--hg-lift` changes.

## Haunt Moment (`haunt-moment.ts`)

### Full sequence (2500ms)

Uses `Element.animate()` (Web Animations API) on elements inside the shadow root. No `setTimeout` chains — all timing is driven by animation timelines.

```ts
export function runHauntMoment(root: ShadowRoot, opts: HauntMomentOpts): Animation[] {
  if (reducedMotion()) return runReducedHaunt(root);
  // Build FX layer: vignette div, ghost sprite, dither strip
  // Return running animations for cancellation
}
```

| Phase | Elements | Keyframes | Duration | Easing |
|-------|----------|-----------|----------|-------|
| Vignette in | `#fx-vignette` | `opacity: [0, 0.4]` | 200ms | easeOut |
| Ghost travel | `#fx-ghost` | `transform: translateX(-96px → 100vw)`, `translateY` bob | 900ms (200ms delay) | easeInOut |
| Starfield+bands reveal | `#starfield, #top-bands` | `clip-path: inset(0 calc(100% - X) 0 0)` synced to ghost X | 900ms (200ms delay) | easeInOut |
| Dither strip | `#fx-dither` | follows ghost trailing edge | 900ms (200ms delay) | easeInOut |
| Vignette out | `#fx-vignette` | `opacity: [0.4, 0]` | 300ms (1100ms delay) | easeOut |
| HUD slide up | `#hud` | `transform: translateY(100% → 0)` | 300ms (1400ms delay) | easeOut |
| Odometer roll | `.odo-cell` | `transform: translateY` per digit | 600ms (1700ms delay) | easeOut |
| Markers fade | `#markers` | `opacity: [0, 1]` | 200ms (2300ms delay) | linear |

The ghost travel and clip-path reveal share one `Animation` object (or tightly synced timing) so they never drift apart. The ghost sprite is a 96×96 pixel ghost drawn as an SVG with `shape-rendering: crispEdges`, `image-rendering: pixelated`.

At 2500ms, `#fx` is removed from the DOM.

### Un-haunt reverse (1100ms)

| Phase | Keyframes | Duration | Delay |
|-------|-----------|----------|-------|
| Markers fade out | `opacity: [1, 0]` | 200ms | 0 |
| Sprites sink+fade | `transform: translateY(0 → 16px); opacity: [1, 0]` | 300ms | 200ms |
| HUD slide down | `transform: translateY(0 → 100%)` | 300ms | 300ms |
| Ghost crosses right→left | `transform: translateX(100vw → -96px)` | 600ms | 500ms |
| Clip shrinks | `clip-path: inset(0 0 0 100%)` | 600ms | 500ms |

At 1100ms, `unhaunt()` removes the host and the body-padding sheet together. The caller (`src/content/index.ts`) calls `unhaunt(doc)` after the animation completes.

### Reduced motion

```ts
function runReducedHaunt(root: ShadowRoot): Animation[] {
  // Cross-fade #crypt-root opacity 0 → 1 over 300ms linear.
  // Odometer shows final value. Marquee static.
  return [root.host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "linear" })];
}

function runReducedUnhaunt(root: ShadowRoot): Animation[] {
  // 200ms opacity fade, then removal.
  return [root.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear" })];
}
```

## Reduced Motion (`reduced-motion.ts`)

```ts
const MQ = "(prefers-reduced-motion: reduce)";

export function watchReducedMotion(root: ShadowRoot): () => void {
  const mql = matchMedia(MQ);
  const apply = () => root.querySelector("#crypt-root")?.classList.toggle("reduced-motion", mql.matches);
  apply();
  mql.addEventListener("change", apply);
  return () => mql.removeEventListener("change", apply);
}
```

The `reduced-motion` class on `#crypt-root` triggers CSS rules that set `animation: none` on all animated layers, make the marquee static, disable twinkles, and lock the under-construction sign to frame 1.

## Costume Stylesheet

All costume CSS is in one `CSSStyleSheet` created via `new CSSStyleSheet().replaceSync(...)`, appended to `root.adoptedStyleSheets`. It contains:

- Layer positioning and z-index.
- Starfield gutter styles.
- Top band styles (neighborhood bar, marquee keyframes).
- HUD frame, bevel, shadow, layout.
- Win95 button styles.
- Focus rings.
- Odometer cell styles.
- Web ring styles.
- Under-construction sign styles.
- Reduced-motion overrides.
- `#show-tab` styles.
- Responsive (≤400px) overrides.

All colours reference the `PALETTE` constants — no hard-coded hex values in the CSS string.

## Render Entry (`render.ts`)

```ts
import { haunt } from "../overlay";

export function renderCostume(doc: Document = document): { cleanup: () => void } {
  const root = haunt(doc);
  // 1. Create #crypt-root container
  // 2. Build layers: starfield, lanes, markers, top-bands, hud, cards, fx
  // 3. Create + append costume stylesheet to root.adoptedStyleSheets
  // 4. Apply body padding
  // 5. Sample lift, set --hg-lift
  // 6. Watch reduced motion
  // 7. Run haunt moment
  // 8. Register resize + mutation listeners for lift/column recompute
  // Return cleanup that removes listeners
}
```

`src/content/index.ts` calls `renderCostume()` after `haunt()`. The unhaunt path (`unhaunt()` in `overlay.ts`) is extended: it first runs the un-haunt animation, then removes the host and body-padding sheet.

## Integration with Existing Code

### `src/content/index.ts` (modified)

```ts
import { haunt, unhaunt } from "./overlay";
import { renderCostume, runUnhauntAnimation } from "./costume/render";

haunt();
renderCostume();
// listener for unhaunt message:
//   runUnhauntAnimation().then(() => unhaunt());
```

### `src/content/overlay.ts` (unchanged)

The existing `haunt()` / `unhaunt()` functions remain as-is. The costume renderer calls `haunt()` to get the shadow root and builds inside it. The body-padding sheet is managed by `body-padding.ts`, stored in the overlay's metadata so `unhaunt()` can find and remove it.

### Non-destructive guarantee

- `renderCostume()` only appends to `root` (shadow DOM) and adds one sheet to `doc.adoptedStyleSheets`.
- No page node is mutated. `elementsFromPoint` is read-only.
- `body-padding.ts` uses `!important` to override page padding, but the original computed values are captured and restored on removal.
- Un-haunt removes the host (dropping all shadow content) and filters the body-padding sheet out of `document.adoptedStyleSheets`.
- `document.documentElement.outerHTML` after un-haunt equals the pre-haunt value.

## Test Strategy

### Unit tests (`test/costume.test.ts`, `test/costume/*.test.ts`)

Using `happy-dom` for DOM, same pattern as `test/content.test.ts`:

- **Tokens**: all palette colours are web-safe hex; all come from DESIGN.md.
- **Starfield tile**: canvas is 64×64, ground is `#000033`, contains the right pixel counts.
- **Content column**: `main` exists → column covers it; no `main`/`article` → falls back to widest text block.
- **Gutters**: rendered only when gutter ≥ 64px; dither edge present.
- **Narrow page**: gutters not rendered, starfield only in bands/HUD.
- **Neighborhood bar**: `#330066` ground, Times New Roman, `#ffffcc` text, contains `You are in:`.
- **Marquee**: CSS animation uses `translateX`, no `<marquee>` element, speed 60px/s.
- **Under-construction sign**: 48×24, 2-frame or static.
- **HUD**: fixed bottom, correct colours, bevel, shadow; controls in correct DOM order.
- **Hide/Show**: Hide fades layers, Show tab appears; Show restores; haunt state preserved.
- **Odometer**: 6 cells, 10×16, `#000000` ground, `#66ff99` digits.
- **Web ring**: `« prev | Haunted WebRing | next »`, prev/next are buttons.
- **Empty state**: all counts 0 → `No ghosts here. Suspiciously clean.`
- **Body padding**: sheet added to `document.adoptedStyleSheets`; padding-top = orig + 48px; removed on un-haunt.
- **Haunt moment**: FX layer created, animations exist, removed at 2500ms.
- **Un-haunt**: reverse animations, then host + sheet removed, `outerHTML` byte-identical.
- **Reduced motion**: `matchMedia` mock → `reduced-motion` class applied, no animations, marquee static.
- **Non-destructive**: `document.documentElement.outerHTML` unchanged after haunt (only host added) and after un-haunt (byte-identical).
- **Focus rings**: costume focus ring CSS present in stylesheet.

### E2E tests (`e2e/costume.spec.ts`)

Using existing `e2e/fixtures.ts`:

- Haunt a fixture → assert shadow root contains starfield, bands, HUD.
- Assert body padding changed; un-haunt → body padding restored.
- Assert marquee scrolls (CSS animation).
- Assert Hide/Show works.
- Assert page remains interactive (form submission works while haunted).
- Un-haunt → `document.documentElement.outerHTML` byte-identical.
- Reduced motion (via `--force-prefers-reduced-motion` emulation) → cross-fade, no ghost.
