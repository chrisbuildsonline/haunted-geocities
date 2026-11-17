# Design: Costume Renderer (R4)

## Context

This spec renders the 1998 GeoCities crypt costume — the visual overlay that the scaffold's `haunt()` / `unhaunt()` lifecycle manages. It builds on the existing closed Shadow DOM host from `src/content/overlay.ts` and adds the structural layers, haunt-moment animation, body-padding stylesheet, and reduced-motion handling. Trackers, vampires, tombstones, and dark-pattern curse badges are out of scope; later specs populate the lane and marker layers established here.

**Design change (judges' request).** The costume now also transforms the page's content column: a page restyle in the single adopted document sheet, a guestbook frame, a parchment tint, and a full-overlay mode for pages with no gutter. See "Content Column Costume" below. Where older sections say the starfield is "never over text", that stays true for the starfield tile; the tint, frame and full-overlay edge frame are the only other layers over the column.

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
│               │            ├─ gutters · #column-tint · #column-frame · #edge-frame│
│               ├── [z:2]  #lanes         (empty in this spec)              │
│               ├── [z:3]  #markers       (empty in this spec)              │
│               ├── [z:4]  #top-bands     (neighborhood bar + marquee)      │
│               ├── [z:5]  #hud           (Hide, counts, odometer, ring)   │
│               ├── [z:6]  #cards         (empty in this spec)              │
│               └── [z:7]  #fx            (haunt-moment only, removed after)│
│    document.adoptedStyleSheets: [pageSheet]  ← the one doc-level change (padding, --hg-lift, restyle)│
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
    body-padding.ts     # the page sheet (addPageSheet): body padding, --hg-lift, and the restyle rules
    page-theme.ts       # NEW: luminance, dark/light, contrast, nearest-web-safe fallback, restyle CSS text
    column-layers.ts    # NEW: #column-tint and #column-frame, positioned from the column rect
    (starfield.ts)      # extended: buildEdgeFrame() for full-overlay mode
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

[Amended] If `gutterWidths(column, viewportWidth)` returns null (`contentColumn.left < 64 && (viewport.width - contentColumn.right) < 64`), the gutters are not rendered and the renderer enters **full-overlay mode**: the starfield appears inside the top bands and HUD (as before) and in a 12px edge frame (see "Content Column Costume"). The page body stays fully visible and clickable. Ghosts and vampires, which have no lanes in this mode, are shown in the docked graveyard strip (see "Docked Graveyard (no gutters)" below).

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

[Amended] This module is the **page sheet**: the one adopted sheet on `document`. It holds the body padding, `--hg-lift` and, from the content-column change, the restyle rules and the full-overlay inline padding. The code is `addPageSheet(doc): PageSheet` with `update(hudHeight, lift)` and `remove()`; the sketch below is the original padding-only idea.

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

## Content Column Costume

Requirements 71-90. The costume now reaches into the content column, using one more kind of rule in the page sheet and three more overlay sub-layers inside layer 1.

### Page restyle (rules in the page sheet)

`page-theme.ts` builds the CSS text; `addPageSheet` appends it. Shape for a light page:

```css
:root { --hg-lift: 0px; }
body { padding-top: …; padding-bottom: …; }            /* existing */
body, body :where(p, li, dd, dt, td, th, blockquote, figcaption, label, summary) {
  font-family: "Times New Roman", Times, serif !important; }
body :where(h1, h2, h3) { font-family: "Comic Sans MS", "Comic Sans", cursive !important; }
a:link    { color: #0000ff !important; text-decoration: underline !important; }
a:visited { color: #800080 !important; }
a:link:hover, a:visited:hover { color: #cc0000 !important; }   /* #ff0000 fails 4.5:1, see below */
```

Dark pages swap in `#66ccff` and `#cc99ff`. Notes:

- `!important` is needed to win against page rules, as the padding already does. `:where()` keeps specificity at zero for the selector lists, so the sheet never fights itself.
- **Selector scope is an assumption.** The list above is text containers only. It excludes `input`, `textarea`, `select`, `button`, `code`, `pre`, `kbd`, `samp`, `svg` and elements that use icon fonts (`i`, `[aria-hidden="true"]`), so form controls look and behave as before and icon glyphs do not turn into letters. Confirm the list when implementing.
- Contrast is computed against the effective background: the page background, multiplied by `#ffffcc` when the tint is on. `contrastRatio(a, b)` uses WCAG 2.x relative luminance. `ensureContrast(colour, bg)` returns the colour if it reaches 4.5:1, else the nearest of the 216 web-safe colours by RGB distance that does. Black or white always qualifies (one of them reaches at least 4.58:1 on any background), so a result always exists.
- `#ff0000` hover is 4.0:1 on `#ffffff` and 3.9:1 on `#ffffcc`. `ensureContrast` turns it into `#cc0000` on light pages. On dark pages `#ff0000` passes on near-black but not on dark greys, so the fallback runs there too.
- The 0.4 dark threshold is the requested number. Between luminance about 0.18 and 0.4 the "dark" link colours (`#66ccff`, `#cc99ff`) can miss 4.5:1, and `ensureContrast` then moves them. That is why the 4.5:1 rule, not the threshold, is the guarantee.
- Dark detection reads `getComputedStyle(body).backgroundColor`, then `html`, then white. Background images are ignored. Recomputed on resize, `prefers-color-scheme` change and `class`/`style` attribute mutation on `html`/`body` (read-only `MutationObserver`). A change rebuilds the sheet text with `sheet.replaceSync`.
- Changing fonts moves text, so the column is recomputed after the sheet lands and after `document.fonts` `loadingdone` (requirement 82). Order in `renderCostume`: add sheet, then `computeContentColumn`, then layout gutters/lanes/frame/tint.

### Guestbook frame (`#column-frame`)

- A `div` in `#starfield`, `position: fixed`, sized to the column rect plus the frame, `pointer-events: none`, `aria-hidden`.
- Drawn outside the column rect. Two 3px bands make the 6px ridge: the outer band is `#9999cc` top/left and `#333366` bottom/right, the inner band is reversed. A 1px `#000000` line goes outside that. The glow is `box-shadow: 0 0 6px #6633cc`, the same radius as the ghost glow. The 3px split is an assumption about what "ridge" means in px.
- Position comes from `column.top/left/width/height` in document coordinates minus `scrollX/scrollY`, applied with `transform: translate(...)`. A passive `scroll` listener plus `resize` update it through one `requestAnimationFrame` per frame. The frame is clipped by the viewport and never moves the column.
- Room: the frame needs 6px + 1px outside the column. Where the gutter or viewport edge leaves less than that, the page sheet adds the missing amount to body `padding-left`/`padding-right` so the frame never covers text.
- Not drawn in full-overlay mode (assumption: the 12px edge frame is the border there, and a full-width column has no room outside it).

### Parchment tint (`#column-tint`)

- A `div` in `#starfield`, below the frame, same rect and tracking as the frame, `background: #ffffcc; mix-blend-mode: multiply; pointer-events: none`. Light pages only.
- White becomes `#ffffcc`. Black text stays black. Mid-greys darken slightly, which is why contrast is measured against the multiplied background.
- **Risk: blending is limited to the host's stacking context.** `<hg-crypt>` is `position: fixed` with `z-index: 2147483647`, so it forms its own stacking context and isolated group. A `mix-blend-mode` on a child blends only with other content in that group, which is transparent, so the multiply may do nothing to the page. Do not assume it works. Task 17.1 is a spike with a pixel test. Options if it fails, in order:
  1. A second host element only for the tint (a second shadow root appended to `documentElement`, still outside the page DOM). This breaks "one shadow host" and needs the requirement text amended.
  2. Draw the tint as a rule in the page sheet (a `html::before` fixed overlay sized by CSS variables, `mix-blend-mode: multiply`, `pointer-events: none`). This stays one stylesheet and no DOM change, but the tint is no longer in the shadow root, so requirement 77 changes.
  Pick after the spike and update requirement 77 and this section. Requirement 79 forbids shipping a plain alpha overlay as a substitute.

### Full-overlay mode (`#edge-frame`)

- Entered when `gutterWidths(...)` is null. Left/right lanes do not exist in this mode (as today).
- `buildEdgeFrame(doc)` in `starfield.ts` returns a `div` with four 12px strips (top, right, bottom, left) inside the viewport, `position: fixed; inset: 0`, `pointer-events: none`, painted with the starfield tile. The inner 4px of each strip is a 2×2 `#000033`/transparent checker, the same technique as the gutter dither (the 4px depth is an assumption; the brief only says "2×2 checker dither edge").
- The top strip sits under the top bands (z-order inside layer 1 already puts bands above). The bottom strip sits under the HUD.
- The page sheet adds `padding-left`/`padding-right: calc(<original> + 12px)` on `body` so no text sits under the frame. The tint and the restyle still apply.
- Everything is `pointer-events: none`, so clicks reach the page. The e2e test checks `elementFromPoint` on links, buttons and form controls at 375px wide.

### Motion

- None of the new layers animates. There is no `transition` on the frame, tint or edge frame, and link hover has no colour transition, so reduced motion needs no extra rule beyond keeping them out of any `animation`/`transition` selector (requirement 83). The existing `reduced-motion` class listener still toggles live.
- Hide fades the new layers with the rest (opacity, 200ms). The restyle stays on while hidden, because it lives in the page sheet and Hide keeps haunt state. That can look odd (fonts changed, no frame). Confirm with the judges' intent; the alternative is to remove the restyle rules on Hide and re-add them on Show.
- **Open question: haunt-moment sync.** The wipe reveals layer 1 and the bands behind the ghost with `clip-path`. A page restyle cannot be clipped. Plan: the page sheet is applied at t=0 as today (one reflow), and the frame and tint join the clip-path reveal. This means the page text changes before the ghost arrives. If that reads badly, apply the restyle at 200ms when the ghost enters.

### Tokens

`tokens.ts` gains `PAGE` (web-safe): `link #0000ff`, `visited #800080`, `hover #ff0000`, `hoverFallback #cc0000`, `darkLink #66ccff`, `darkVisited #cc99ff`, `parchment #ffffcc`, `frameLight #9999cc`, `frameDark #333366`, `frameLine #000000`, `glow #6633cc`, plus `LAYOUT.frameBevel = 6`, `LAYOUT.edgeFrame = 12`, `LAYOUT.edgeDither = 4`, `LAYOUT.darkLuminance = 0.4`, `LAYOUT.minContrast = 4.5`. `design/DESIGN.md` gets the same under `costume.page` (requirement 89).

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

- `renderCostume()` only appends to `root` (shadow DOM) and adds one sheet (the page sheet) to `doc.adoptedStyleSheets`. The restyle is rules in that sheet, never inline styles or attributes.
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

Content column costume (requirements 71-90):

- **Page theme**: `isDark` threshold at luminance 0.4 (0.39 dark, 0.41 light); body transparent falls back to `html`, then white; `contrastRatio` against known pairs (`#ff0000`/`#ffffff` = 4.0, `#cc0000`/`#ffffcc` ≥ 5.7); `ensureContrast` returns a web-safe colour at ≥ 4.5 for every background in a sweep of 0 to 255 grey levels.
- **Restyle text**: the sheet text has Times New Roman on body, Comic Sans MS on `h1`-`h3`, `#0000ff`/`#800080`/`#cc0000` on light, `#66ccff`/`#cc99ff` on dark, and excludes form controls.
- **Page sheet**: still the only added entry in `document.adoptedStyleSheets`; `remove()` restores the original array; full-overlay adds 12px inline padding.
- **Frame**: 6px, correct four edge colours, 1px `#000000` line, `#6633cc` glow; follows a simulated scroll and resize; `pointer-events: none`.
- **Tint**: present with `multiply` and `#ffffcc` on a light page, absent on a dark page, `pointer-events: none`.
- **Full-overlay**: viewport 375px gives the 12px edge frame with 2×2 dither, no guestbook frame, tint and restyle present.
- **Reduced motion**: the new layers have no `animation` or `transition` in either state.
- **Un-haunt**: host and page sheet gone together; `outerHTML` and `adoptedStyleSheets` equal their pre-haunt values.

### E2E tests (`e2e/costume.spec.ts`)

Using existing `e2e/fixtures.ts`:

- Haunt a fixture → assert shadow root contains starfield, bands, HUD.
- Assert body padding changed; un-haunt → body padding restored.
- Assert marquee scrolls (CSS animation).
- Assert Hide/Show works.
- Assert page remains interactive (form submission works while haunted).
- Un-haunt → `document.documentElement.outerHTML` byte-identical.
- Reduced motion (via `--force-prefers-reduced-motion` emulation) → cross-fade, no ghost.

Content column costume (`e2e/costume.spec.ts`, plus visual baselines in `e2e-visual/`):

- On `column.html`, `getComputedStyle(body).fontFamily` starts with Times New Roman, an `h1` with Comic Sans MS, an `a:link` colour is `rgb(0, 0, 255)`; the page is costumed, not only framed.
- On a dark fixture, links are `rgb(102, 204, 255)`.
- A screenshot pixel on a white area inside the column is `#ffffcc`, and a text pixel stays `#000000` (the multiply spike's proof, requirement 79).
- At 375px wide, `elementFromPoint` on each link and form control returns the page element, and the page's form still submits.
- Un-haunt: `outerHTML` and `document.adoptedStyleSheets` match their pre-haunt values, body font and link colour are back to the originals.
- Reduced motion: the frame, tint and edge frame have `animation-name: none` and no transitions.


## Docked Graveyard (no gutters)

Requirements 91-113. In full-overlay mode `gutterWidths` is null, `planSlots` returns `[]`, and `updateGhosts` therefore shows nothing. Only the HUD counts and the odometer say anything about trackers. The graveyard strip puts the same companies, with the same cards, in a row docked above the HUD.

### Layout

```
viewport (375px)
┌────────────────────────────┐
│ neighborhood bar / marquee │  z4
│ ... page ...               │
│                            │
│ ┌ Graveyard ─────────────┐ │  z5  #graveyard  (4px above the HUD)
│ │ [👻][👻][🧛][👻] → scroll│ │
│ └────────────────────────┘ │
│ ┌ HUD ───────────────────┐ │  z5  #hud
│ │ Hide  counts  Souls …  │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

- **Element.** `#graveyard` is a new direct child of `#crypt-root`, created after `#hud` in `render.ts` (`croot.append(starfield, lanes, markers, bands, hud, graveyard, cards, tab)`). It must be a direct child because Hide works as `.costume-hidden > :not(#show-tab) { opacity: 0; pointer-events: none }` (requirement 95). Putting it inside `#lanes` would also hide it in lane mode logic and tie it to `planSlots`. It is `hidden` in lane mode.
- **Position.** `position: fixed; left/right: 8px; max-width: 720px; margin: 0 auto` like the HUD (4px insets at 400px or less). `bottom: calc(8px + var(--hg-lift, 0px) + var(--hg-hud-h, 40px) + 4px)`. `--hg-hud-h` is a new custom property on `#crypt-root`, written by `render.ts` from `hud.offsetHeight` in `pad()`. That is the same measurement the page sheet already uses, so the strip follows the HUD when it wraps to two rows below 400px (requirement 95) and when `--hg-lift` changes.
- **Structure.** A `role="region"` `aria-label="Graveyard of trackers"` box with two children: a label bar (`Graveyard`, 11px) and a `.stones` row (`display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; padding: 4px 8px`). Sprite buttons are flex items with `flex: 0 0 auto`. Row height is the tallest sprite (vampire, 54px) plus the 4px paddings. Label bar is `LAYOUT.minText` (11px) text on a 16px bar. Both heights are CSS constants, but the page sheet uses the measured `offsetHeight`.
- **Frame.** Same as the HUD: `#000033` ground, 2px bevel `#9999cc`/`#333366` as inset shadows, 1px `#000000` border, `HARD_SHADOW`. The starfield tile at 30% on the HUD is not repeated; the strip uses the flat ground so sprite silhouettes stay readable (assumption, easy to change).
- **Scrolling.** `overscroll-behavior-x: contain` so a swipe at the end of the row does not scroll the page. `scroll-snap-type` is not used. Focus moves with Tab and the browser scrolls the focused button into view; `scroll-behavior: auto` always (requirement 107). The sprite buttons are the keyboard path: Tab reaches each one and scrolls it into view, so the row needs no `tabindex` of its own (verify in the e2e run).
- **Mode switch.** `measure()` already knows `overlay`. After it, `render.ts` calls `placeGhosts()`, which now does one of two things: in lane mode `updateGhosts(lanes, ...)` and `dockGraveyard(graveyard, [], ...)` (hide and empty the strip); in full-overlay mode `updateGhosts(lanes, companies, [], ...)` (empties the lanes) and `updateDocked(graveyard, companies, opts)`. One company is therefore never in both places (requirement 96).

### Code shape

- `ghosts.ts`: pull the per-company button builder out of `updateGhosts` into `makeSprite(doc, hit, tint, opts)` and `applyState(el, hit, exorcised)` (label, `exorcised` class, `EXORCISED` stamp). `updateGhosts` calls them; `updateDocked` calls them too. This keeps the label text (requirement 98) and exorcised look (requirement 99) in one place. No change to lane behaviour.
- `ghosts.ts`: `orderCompanies(companies)` returns ghosts by `byCountThenName`, then vampires by name, and `assignTints` runs over the ghosts in that order. Both the lanes and the strip use it, which is how requirement 92 holds ("same order as the lanes").
- `ghosts.ts` (or a small new `graveyard.ts`, one responsibility per module per `structure.md`): `updateDocked(strip, companies, opts)` reuses elements by `kind:company` key like `updateGhosts`, appends only new ones (moving a focused node drops focus, requirement 100), and removes the ones no longer present. No `+N` overflow stack: the strip scrolls instead.
- `hud.ts`: `buildHud` gets the new odometer label (below). `buildGraveyard(doc)` can live in `hud.ts` or in the new module; it returns the empty strip.
- `render.ts`: `bounds()` returns `bottom: graveyard shown ? graveyard.offsetTop : hud.offsetTop`, so cards opened from a docked sprite (or any card) are kept clear of the strip as well as the HUD. `pad()` passes `hud.offsetHeight` plus the strip's `offsetHeight + 4` (when shown) to `page.update`. A second `ResizeObserver` entry observes the strip so a label wrap or sprite-row change re-pads.
- `body-padding.ts`: `update(hudHeight, lift)` is called with the combined height, so the signature does not change. `padding-bottom` already is `original + hudHeight + 16 + lift`. Passing `hud + strip + 4` is enough. No new rule in the page sheet.
- `styles.ts`: new `#graveyard` rules, plus `.costume-hidden`, the reduced-motion block and the focus ring selectors extended to the strip's buttons. Colours from `PALETTE` only.

### Cards and focus

The strip's buttons call the existing `onOpen(company, opener)` from `render.ts`, so `openCard` gets the sprite as `opener` and returns focus to it on close. Card placement uses `bounds()`; the card's own anchor logic for lane ghosts places it beside the ghost, and for a docked sprite this means above the strip, so the check (task 18.4) is that a card opened from the leftmost and rightmost sprite at 375px stays 8px inside the viewport and does not cover the strip's other sprites more than it has to. If `openCard` assumes a gutter slot, a docked-anchor branch is added there. Confirm when implementing.

### Empty state (open choice)

Requirement 103 shows the label bar and `No graves yet.` when there are no trackers. The cost is about 50px of permanent chrome on every tracker-free narrow page, on top of the HUD, and the HUD's own empty state (`No ghosts here. Suspiciously clean.`) already says the same thing. The default in this design is to **show the empty strip**, because the brief asks for it. If the screenshots look crowded at 375px, switch to hiding the strip when empty, and change requirement 103 to match.

### Odometer label (requirements 104-106)

- `.hits` gets a two-line label: `<span class="label">Souls counted</span><span class="sub">tracker requests blocked or seen</span>`. The visible label drops the colon, since the sub-label follows it.
- `.hits` gets `title="tracker requests blocked or seen"`, and `setOdometer` writes `aria-label = "Souls counted: 000123, tracker requests blocked or seen"` (it already writes `Souls counted: <digits>`, so only the tail changes). It stays `role="img"` with children `aria-hidden`.
- Sub-label: Comic Sans MS 11px, `#ffffcc` on `#000033` (ratio is above 4.5:1, already tested in task 15.3). On one line it adds about 200px to the odometer. At 400px or less the HUD's row 2 holds the hit counter and web ring, and 375px minus 8px insets cannot hold both with the sub-label. Plan: below 400px the sub-label is visually hidden (the `.sr` pattern the HUD already uses, so it stays in the accessible name) and the `title` still carries it. Above 400px it shows under the label, and the HUD's `min-height` grows to fit (checked in the visual shots at 1280px).
- "Blocked or seen": the odometer is the total tracker requests seen from Resource Timing (requirement 34); blocked requests are the same requests after Exorcise, so the number is one count. The wording says both so a reader does not think Exorcise should lower it.

### Motion

- The lane `.bob` and `.sway` float keyframes are reused on strip sprites, with `--phase` as in the lanes. `.reduced-motion #graveyard * { animation: none !important }`. `riseIn` and `vampireIn` are not called for strip sprites under reduced motion (`opts.rise` is false when `motion.matches`, as in the lanes).
- The strip has no haunt-moment animation of its own. It is added to the HUD's slide-up (`runHauntMoment` animates `#hud` today; the strip gets the same `translateY(100% → 0)` keyframes at the same delay) and to the un-haunt HUD slide-down (requirement 108). `haunt-moment.ts` was not read for this change: when implementing, add the strip wherever `#hud` is animated, as one extra target and not a new phase.

### Z-order and hit testing

| Layer | z-index | Notes |
|-------|---------|-------|
| starfield, edge frame | 1 | unchanged |
| lanes | 2 | empty in full-overlay mode |
| markers | 3 | unchanged |
| top bands | 4 | unchanged |
| HUD, graveyard | 5 | strip is after the HUD in DOM order and 4px above it, so they never overlap |
| cards | 6 | above the strip (requirement 110) |
| FX | 7 | unchanged |
| `#show-tab` | by DOM order | after Hide, strip and HUD are `pointer-events: none` |

`#crypt-root` and the host are `pointer-events: none`; only the strip box (and the HUD) set `auto` (requirement 111). The edge frame's bottom strip (12px) sits under the HUD and the graveyard (layer 1 against 5).

### Tokens reused from `tokens.ts`

`PALETTE.crypt` (ground), `PALETTE.hudBevelLight` and `PALETTE.bevelDark` (bevel), `PALETTE.ink` (1px line), `PALETTE.bone` (text), `HARD_SHADOW`, `FOCUS_RING`, `SPRITES.ghost` and `SPRITES.vampire` (48×48 and 48×54), `PIXEL.spriteScale`, `HEM_TINTS` through `assignTints`, `LAYOUT.hudMaxWidth`, `LAYOUT.hudWrapBelow` (400), `LAYOUT.minText` (11), `MOTION`. One new value: `LAYOUT.graveyardGap = 4` (the gap above the HUD), mirrored in `design/DESIGN.md` Tokens. Nothing else new. The label and empty-state strings live in `render.ts`/`hud.ts` like the HUD's other strings.

### Test strategy additions

Unit tests (`test/costume/graveyard.test.ts`, odometer tests extended): strip hidden in lane mode and shown in full-overlay mode; order equals the lanes' order for a mixed set; one 48px button per company; aria-label strings equal the lane ghost's; click, Enter and Space call `onOpen`; exorcised class and stamp on and off; element reuse keeps focus; empty state text; label text and classes; reduced motion has `animation: none`; Hide hides it; `padding-bottom` includes strip height + 4; mode switch moves companies between lanes and strip with none in both; un-haunt removes it and restores `outerHTML` and `adoptedStyleSheets`; odometer label, sub-label, `title` and `aria-label`.

E2E (`e2e/graveyard.spec.ts`): at 375px on `trackers.html` (tracker hosts mapped as in the README) and on a full-width fixture, the strip shows one sprite per company in the right order, scrolls when there are more than fit, opens the card by keyboard and click, exorcise shows the stamp, `elementFromPoint` on page controls above the strip returns the page element, the last page line can be scrolled above the strip, Hide hides the strip, un-haunt is byte-identical.

Visual: the existing 375px baselines for `trackers.html` change (strip now visible), and a 1280px shot is unchanged except the HUD's odometer label.
