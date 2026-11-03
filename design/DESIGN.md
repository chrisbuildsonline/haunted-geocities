# Haunted GeoCities: Design System

Every UI feature cites this file. There are two worlds, and they are deliberately different:

- **The costume:** a 1998 GeoCities crypt drawn over any page. Only the 216 web-safe colours, Comic Sans MS / Times New Roman, original pixel art, bevels and hard edges.
- **The popup:** a modern control room, 360px wide, soft and quiet.

Both worlds share exactly one colour, the web-safe violet `#6633cc`. In the costume it is the spectral glow. In the popup it is the only accent. Exact values are in the `## Tokens` JSON. Where prose and JSON disagree, the JSON wins.

## References

These are Dribbble shots used as cues only. Nothing from them ships. Each author's rights apply (see `design/refs/refs.md`).

| # | Author | What we borrowed |
|---|--------|------------------|
| 01 | Vadym Drut (Emeris) | One huge number with a muted sub-line under it, which became our 36px count tiles. List rows of round icon + name + short muted line, with the value right-aligned. |
| 02 | Ryan Hulseberg (Dark Mode) | A white card floating on a tinted canvas with a soft blurred shadow and ~16px radius. 24px inner padding. A 48-64px icon tile beside a bold title. Two-line list rows. |
| 03 | Erdem (Command Menu) | Section labels in muted text with no divider lines. Rows are a 32-40px rounded icon tile + title + muted description. A selected row is a tinted fill, never a border. |
| 04 | Preston Attebery (Win95 UI Kit) | 2px bevels (light top-left, dark bottom-right), filled title bars, and a dotted focus rectangle. The default button gets an extra 1px black border. Used for HUD buttons, card title bars and costume focus rings. |
| 05 | SUPERGLOW (Y2K desktop) | Small windows with thin centred title bars stacked on a loud field. Tiny pixel icons with a label underneath. Used for ghost labels and card stacking. |
| 06 | Alvian Teddy Cahya Putra (RetroBoy) | A hard offset shadow with no blur (`4px 4px 0 #000`), chunky 1px-art black outlines, and 4-point sparkle stars. Used for card/HUD shadows, sprite outlines and starfield twinkles. |
| 07 | Piqo Studio (Halloween shop) | Each object gets its own coloured backlight on near-black: cool violet behind the reaper, hot red-orange behind the pumpkin. This is our cool ghost glow vs hot vampire glow. |
| 08 | Fanka (Weden) | A deep purple night field with a yellow moon and orange eyes peering out of the dark. Used for the `#330066` crypt violet, `#ffff66` stars and ghost eyes. |

## Costume

### Overlay layers

Everything renders inside one closed Shadow DOM.

- The host is `<hg-crypt>`, appended to `document.documentElement` with `position: fixed; inset: 0; z-index: 2147483647; pointer-events: none`.
- No page node is touched.
- The only document-level change is one adopted stylesheet. It holds the body padding and the HUD lift variable. Un-haunt removes it.

Layers, bottom to top:

| z | Layer | pointer-events | Notes |
|---|-------|----------------|-------|
| 1 | Gutter starfield | none | Only outside the content column (see below) |
| 2 | Lanes: ghosts, vampires | sprites `auto`, lane `none` | Left/right gutter lanes, 64px wide |
| 3 | Markers: tombstones, curse badges | marker `auto` | Pinned beside page elements |
| 4 | Top bands: neighborhood bar + marquee | bar links `auto` | 24px + 24px |
| 5 | HUD | `auto` | Bottom control strip |
| 6 | Cards | `auto` | One open at a time |
| 7 | Haunt-moment FX | none | Exists only during the transition |

### Pixel-art grid

- One art pixel is **3 CSS px** for sprites and **2 CSS px** for icons. Use `image-rendering: pixelated` and draw on integer offsets only.
- A sprite uses at most 4 web-safe colours + transparent, with a 1-art-px `#000033` outline (ref 06).

| Asset | Art grid | Rendered |
|-------|----------|----------|
| Ghost | 16×16 | 48×48 |
| Vampire | 16×18 | 48×54 |
| Webmaster's Ghost (haunt moment) | 32×32 | 96×96 |
| Tombstone marker | 8×10 | 16×20 |
| Curse badge icon | 6×6 | 12×12 |
| HUD icons | 8×8 | 16×16 |
| Under-construction sign | 24×12 | 48×24 |

Each ghost body is `#ffffff` with `#ccffff` shade and `#000033` eyes. Its 2-art-px hem is tinted per company. Pick the tint as hash(company) mod 6 over `#ff99cc #99ccff #ccff99 #ffcc99 #cc99ff #99ffcc`.

### Starfield (tiled, never over text)

- **Tile:** 64×64, painted once to a canvas and used as a tiled `background-image`. Ground is `#000033`. Add 6 single `#ffffff` pixels, 2 `#ffff66` 2×2 stars and one 5×5 `#ffffcc` 4-point twinkle.
- **Content column:**
  1. Start from the bounding box of `main`/`article`. If neither exists, use the widest block holding more than 50% of the page's text.
  2. Widen it to cover every text node rect.
- **Gutters:** the gutters are everything left and right of the column. Fill them with the tile at opacity 0.92. A 16px edge toward the column is 2×2-checker dithered (1998 dithering, no gradients).
- **Narrow pages:** with no gutter of 64px or more, the starfield appears only inside the top bands and the HUD. The page body stays fully visible.

### Top bands: neighborhood bar + marquee

- **Neighborhood bar (24px):**
  - Colours: `#330066` ground, Times New Roman 13px, `#ffffcc` text.
  - Left side: `You are in: Area51/Vault/2049`. The neighborhood is assigned per host from `src/data/` and is stable per host.
  - Right side: the 48×24 under-construction sign. It is static, or 2 frames at 1 Hz with motion allowed.
- **Marquee (24px):** `#000033` ground, Comic Sans MS 14px, `#66ff99` text. It cycles lines such as `~*~ Welcome to my haunted homepage!!! ~*~ 7 ghosts are watching you ~*~ Best viewed at 800x600 ~*~`. Implemented as a CSS `translateX` keyframe. Never `<marquee>`.
- **Placement:** the bands sit at `top: 0`. If page UI is fixed or sticky at y=0 (sampled with `elementsFromPoint` along the top row), the bands sit just below it.

### HUD (guestbook / hit-counter strip)

- **Position:** fixed bottom, `left/right: 8px`, `bottom: calc(8px + var(--hg-lift))`, max-width 720px, centred, min-height 40px.
- **Lift:** `--hg-lift` is the height of any page UI fixed to the bottom (cookie bars, chat buttons). It is sampled with `elementsFromPoint` along the bottom 80px and re-checked on resize and on mutation.
- **Frame:**
  - Ground `#000033` with the starfield tile at 30%.
  - 2px bevel: `#9999cc` top-left, `#333366` bottom-right.
  - 1px `#000000` outer line and a hard shadow `4px 4px 0 #000000` (refs 04, 06).
- **Order (controls first, DOM order = visual order):**
  1. `[Hide]` Win95 button.
  2. Counts: `[ghost] 7 [vampire] 1 [tomb] 3 [curse] 2`, each a 16px icon + Comic Sans 13px `#ffffcc`.
  3. Hit counter: label `Souls counted:` + 6-digit odometer. Cells are 10×16, `#000000` ground, `#66ff99` pixel digits from an original 5×7 font. The value is total tracker requests seen.
  4. Web ring: `« prev | Haunted WebRing | next »`. It moves focus to the previous/next sprite on the page.
- **Hide/Show:** Hide fades every costume layer out (200ms) and leaves a 40×40 `[Show]` tab bottom-right with the ghost icon. Haunt state is kept.
- **At 375px:**
  - At viewport width 400px or less, insets drop to 4px and the strip uses `flex-wrap: wrap; row-gap: 4px`.
  - Row 1 holds Hide + counts. Row 2 holds the hit counter + web ring.
  - Never more than 2 rows (88px) and never horizontal scroll.
- **Body padding:**
  - The adopted stylesheet sets body `padding-top` to the original computed value + 48px, and `padding-bottom` to the original + HUD height + 16px + lift.
  - Both are computed once at haunt and when the HUD wraps.
  - The sheet is removed on Un-haunt, so page content is never trapped under the costume.
- **Empty state:** when nothing is found, the counts are replaced by `No ghosts here. Suspiciously clean.`

### Ghosts (one per tracker company)

- **Lanes:**
  - A lane exists on a side only if that gutter is 64px or wider. Slots run at a 72px pitch (48 sprite + 24 label), between the top bands and the HUD.
  - IntersectionObserver re-checks each slot. Any slot intersecting a text rect is skipped.
  - When slots run out, the last slot becomes a `+N` stack token.
  - With no lane at all (most phones), ghosts live only in the HUD count and the popup list. Ghosts are never drawn over page text.
- **Glow:** `filter: drop-shadow(0 0 6px #6633cc) drop-shadow(0 0 2px #ccffff)`. This is the cool spectral backlight (ref 07).
- **Label:** under the sprite. Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis.
- **Card** (click or Enter):
  - Title bar: company name.
  - Body: category, `Haunts these domains:` (Times New Roman 13px list), `Seen 12 times on this page`.
  - Then the `[Exorcise]` default button.
  - Footnote: `Blocked until you close the browser.`
  - After Exorcise, the sprite fades to 40% opacity with an `EXORCISED` stamp, and the button becomes `[Let it back]`.

### Vampires (runtime fingerprinting scripts)

- **Sprite:** its own 16×18 sprite, with a cape, `#660000` lining and `#ff0033` eyes. It lives in the same lanes, after the ghosts.
- **Glow:** `drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999)`. It is hot where the ghost glow is cool, and never confused with it.
- **Card:** title bar `#660000`, titled **`Vampire identified`**.
  - Body: the script URL (wraps at `/`).
  - `Caught doing: canvas readback · AudioContext · font probing`.
  - One line on what fingerprinting is.
  - If the script host belongs to a known tracker company, the card adds `[Exorcise <company>]`.

### Tombstones (dead links)

- **Marker:** a 16×20 stone placed just after the link's last line box (beside it, never over it). If there is no room there, it goes in the nearest gutter lane at the same y.
- **Card is the stone:** a 176px-wide `#cccccc` slab with a 88px top radius (arched headstone, no blur), a 2px bevel `#ffffff`/`#666666`, and moss pixels `#336633` along the base. The inscription is pinned to the stone face (absolute, 16px inset) in Times New Roman `#000000`:
  - `HERE LIES` (11px, letter-spacing 2px).
  - The path, e.g. `/blog/2019/old-post.html`, at 13px. The minimum anywhere is 11px.
  - `404 · Not Found` (11px).
- **Path wrapping:** the path clamps at 3 lines (`-webkit-line-clamp: 3`). Insert `<wbr>` after every `/`. Set `overflow-wrap: normal; word-break: keep-all`, so lines break only at `/` and never inside a filename. If one segment is too long, ellipsis the start of that segment.

### Cursed badges (dark patterns)

- **Badge:** `CURSED!` with a 12px skull icon. Comic Sans 11px bold `#000000` on `#ff9900`, 1px `#000000` border, hard shadow `2px 2px 0 #000000`, 18px tall.
- **Placement:**
  - First choice: 4px right of the element's last line box.
  - If that would cross text or the viewport edge, 4px above-left in the element's margin.
  - Otherwise, in the gutter lane at the same y.
  - Never over the text.
- **Card:** titled `Cursed: Fake scarcity` (or `Countdown`, `Confirmshaming`, `Pre-checked opt-in`). Body: the quoted snippet (60 chars max) and one line on the trick.

### Card style (ghost, vampire, tombstone frame, badge)

- **Frame:**
  - 248px wide, max-height 320px, scroll inside.
  - Ground `#000033`, 2px outset bevel `#ccccff`/`#333366`, `4px 4px 0 #000000` hard shadow.
  - Radius 0, the era rule. Only the headstone arch is rounded.
- **Title bar:** 22px tall, `#330066` (vampire `#660000`), Times New Roman bold 14px `#ffffcc`, and a 16×16 `[x]` Win95 close button on the right.
- **Body:** 12px padding, Comic Sans 13px `#ffffcc`, links `#66ff99` underlined.
- **Buttons:** Win95. Face `#cccccc`, text `#000000`, 2px bevel `#ffffff`/`#666666`. The default button gets an extra 1px `#000000` ring. 24px tall, 8px side padding.
- **Placement:** anchored beside the sprite or marker, toward the page centre. Clamped to the viewport between the bands and the HUD.
- **Keyboard:** focus moves into the card. Esc closes it, and focus returns to the opener.

### Empty states

- **HUD:** `No ghosts here. Suspiciously clean.`
- **Per-kind lines** (popup, and the HUD at 375px):
  - `No vampires. Your blood is safe.`
  - `No tombstones. Every link is alive.`
  - `No curses. This page plays fair.`

### Focus rings (costume)

- **Ring:** `outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000`. The black halo keeps the ring visible on light pages.
- **Win95 buttons:** these also get the classic 1px dotted inner rectangle (ref 04).
- **Scope:** every sprite, marker, card button and HUD control is focusable and shows the ring.

### Contrast (costume)

All overlay text meets 4.5:1:

- `#ffffcc`/`#000033` is 19.5:1.
- `#66ff99`/`#000033` is 15.6:1.
- `#000000`/`#ff9900` is 9.8:1.
- `#000000`/`#cccccc` is 13.1:1.
- `#ffffcc`/`#660000` is 13:1.
- `#ffffcc`/`#330066` is 15.3:1.

## Popup

The modern control room. It is 360px wide, at most 600px tall, and lists scroll inside their own surface.

### Look

- **Canvas and surfaces:** the canvas is `#eef0f4`. Content sits on white `#ffffff` surfaces with radius 18px, floating with a soft shadow `0 1px 2px rgba(17,19,24,.04), 0 8px 24px rgba(17,19,24,.06)` (ref 02).
  - Surfaces are never bordered.
  - Surfaces are never nested inside other surfaces.
  - The gap between surfaces is 12px.
- **Primary action:** exactly one, Haunt or Un-haunt. It is a near-black pill: `#111318` ground, `#ffffff` text, 48px tall, full width, radius 999, 15px semibold.
- **Accent: `#6633cc` spectral violet, the one accent.**
  - It is the costume's ghost-glow colour, so the popup visibly belongs to the crypt.
  - It is web-safe, so it is the same colour in both worlds.
  - It reads as spooky without the danger connotation of red or the success connotation of green.
  - It is 7.2:1 on white, so it works for text links as well as fills.
  - Used only for: links, selection/toggle-on, count emphasis, the Exorcise text button, and focus rings. Nothing else is coloured.
- **Text colours:** ink `#111318` and muted `#5b6170` (6.2:1 on white).
- **Font stack:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Numbers use `font-variant-numeric: tabular-nums`.
- **Status pill** (24px, radius 999, 12px semibold, 10px side padding):
  - Haunted: `#efe9fb`/`#6633cc`.
  - Idle: `#e3e6ec`/`#5b6170`.
  - Restricted: `#fff1e0`/`#8a4600`.
- **Type scale:**

| px | Weight | Use |
|----|--------|-----|
| 12 | 500 | Captions, attribution |
| 13 | 400 | Muted short lines |
| 15 | 500 | Body, row titles, buttons |
| 20 | 650 | Section headings |
| 28 | 700, -0.02em | Screen title |
| 36 | 700, -0.03em | Count numbers |

- **Spacing scale:** 4, 8, 12, 16, 20, 24, 32. The popup padding is 16. Surface inner padding is 20. Rows are 56px tall with 12px between icon and text.
- **Lists** (ref 03): each row is a 32px icon tile (radius 10, canvas fill, pixel sprite at 2x) + kind/name (15px ink) + short line (13px muted), with the action on the right. There are no dividers. Hover is a `#f5f6f8` fill with radius 12.
- **Secondary button:** Exorcise. 32px tall, radius 999, `#f1ecfb` ground, `#6633cc` 13px semibold text.
- **Toggle:** 40×24 track, radius 12. Off is `#d6d9e0`, on is `#6633cc`. The knob is a 20px white circle with `0 1px 2px rgba(17,19,24,.2)`.
- **Focus:** `outline: 2px solid #6633cc; outline-offset: 2px` on every control.

### Screen: idle (not haunted)

```text
[ghost 24] Haunted GeoCities                 ( Idle )
example.org                                    <- 28px title
Neighborhood: Area51/Vault/2049                <- 13px muted
+------------------------------------------+
|  Turn this page into a 1998 crypt.       |  15px ink
|  Ghosts, vampires and dead links show up |  13px muted
|  ( ######## Haunt this page ######## )   |  near-black pill
+------------------------------------------+
+------------------------------------------+
|  Check links to other sites      [o  ]   |
|  Asks Chrome to visit linked sites. Off. |
|  Sound effects                   [o  ]   |
|  Muted                                   |
+------------------------------------------+
Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0   <- 12px muted
```

### Screen: haunted

```text
[ghost 24] Haunted GeoCities              ( Haunted )
example.org
+------------------------------------------+
|  7        1         3         2          |  36px numbers, 2x2 at <340
|  Ghosts   Vampires  Tombstones Curses    |  13px muted, 16px sprite each
|  ( ######### Un-haunt ######### )        |
+------------------------------------------+
+------------------------------------------+
|  Ghosts                           7      |  20px heading, count in accent
|  [g] AdCo Inc                [Exorcise]  |
|      4 domains · Advertising             |
|  [g] PixelTrack             (Exorcised)  |  tinted pill, row at 60% ink
|      2 domains · Analytics               |
|  Vampires                         1      |
|  [v] cdn.example-metrics.net             |
|      Canvas + audio fingerprinting       |
+------------------------------------------+
+--- settings surface (as idle) -----------+
```

- **Legend:** each count tile carries its 16px sprite, and the label under the number names the kind. The tiles are the legend.
- **List order:** ghosts sorted by request count, then vampires.
- **Empty list:** the surface shows `No ghosts here. Suspiciously clean.` (15px ink) and `Trackers that load later will appear here.` (13px muted).

### Screen: restricted page

Applies to `chrome://`, `chrome-extension://`, `edge://`, `about:`, `view-source:`, the Chrome Web Store, the PDF viewer, and `file://` without access.

```text
[ghost 24] Haunted GeoCities           ( Can't haunt )
This page is protected                         <- 28px
+------------------------------------------+
|  Chrome doesn't let extensions draw on   |
|  its own pages. Open any website and     |
|  press Haunt there.                      |  13px muted, no pill shown
+------------------------------------------+
+--- settings surface ---------------------+
```

### Row: "Check links to other sites" (opt-in)

- **Off by default.** Sub-line: `Asks Chrome to visit linked sites. Off.`
- **Turning it on:** calls `chrome.permissions.request` for http/https origins.
  - Granted: the toggle is on and the sub-line reads `Checking links on other sites too.`
  - Denied: the toggle springs back and the sub-line reads `Permission not granted.`
- **Turning it off:** removes the permission.
- **Scope:** same-origin links are always checked.

### Row: audio toggle

- **Default:** `Sound effects`, toggle off, sub-line `Muted`.
- **When on:** the sub-line reads `On · plays only after you click`. Sound starts only from that gesture. There is no ambient loop.

## Haunt moment

**"The Webmaster's Ghost wipe."**

- **The idea:** a 96px pixel ghost glides across the viewport. Behind it the page is 1998; ahead of it the page is still modern. Its trailing edge is a strip of dithered ectoplasm.
- **The screenshot:** the mid-wipe frame, half modern site and half GeoCities crypt, with the ghost at the seam.
- **Total: 2500ms.**
- **How it is built:** the Web Animations API on transform, opacity and clip-path only, all inside the shadow root. The page is untouched.

| t (ms) | Layer | What happens | Easing |
|--------|-------|--------------|--------|
| 0-200 | FX vignette | Radial `#000033` from transparent centre to 40% at edges fades in | `cubic-bezier(.2,.8,.2,1)` |
| 200-1100 | FX ghost + layers 1 and 4 | The 96×96 Webmaster's Ghost travels `translateX(-96px → 100vw)` at mid-viewport height, with one ±6px vertical bob (a single 900ms cycle). The gutter starfield and top bands reveal behind it via `clip-path: inset(0 calc(100% - X) 0 0)`. Ghost and clip share one timing object, so they stay synced. A 32px strip trails the ghost: a 2×2 checker of `#66ff99`/transparent, the dither seam. | `cubic-bezier(.45,0,.2,1)` |
| 1100-1400 | FX | Ghost leaves the right edge. Vignette fades 40% → 0. Marquee starts scrolling. | `cubic-bezier(.2,.8,.2,1)` |
| 1400-2000 | Lanes | Tracker ghosts rise 16px into their slots and fade 0 → 1, each 300ms, staggered 60ms (first 8; the rest arrive with the 8th). | `cubic-bezier(.2,.8,.2,1)` |
| 1400-1700 | HUD | Slides up from `translateY(100%)` to its lifted position | `cubic-bezier(.2,.8,.2,1)` |
| 1700-2300 | HUD odometer | Digits roll from 000000 to the count as continuous `translateY` strips, right digit first, 600ms | `cubic-bezier(.2,.8,.2,1)` |
| 1800-2100 | Vampires | Fade in, then a single glow swell, `drop-shadow` 0 → 6px. One swell, no pulsing. | `cubic-bezier(.2,.8,.2,1)` |
| 2300-2500 | Markers | Tombstones and curse badges fade in, 200ms | linear |

- **Flash safety:** every change is monotonic, and nothing toggles back. The only periodic motion is the 900ms bob (1.1 Hz, position only). Nothing strobes above 3 Hz.
- **Audio:** muted by default. If the user has turned sound on, the wipe plays a 900ms band-passed noise "whoosh" synced to 200-1100ms.
- **Cost:** 1 sprite, 1 dither strip, 1 vignette div. The FX layer is removed at 2500ms.

**Un-haunt (reverse), 1100ms:**

| t (ms) | What happens |
|--------|--------------|
| 0-200 | Markers fade out |
| 200-500 | Sprites sink 16px and fade |
| 300-600 | HUD slides down |
| 500-1100 | The Webmaster's Ghost crosses right → left (600ms). The clip shrinks behind it, handing the page back to the modern world. |
| 1100 | The shadow host and the adopted stylesheet are removed together, so the body padding goes in one reflow. Page markup is byte-identical. |

**prefers-reduced-motion: reduce**

- **Haunt:**
  - No ghost, no wipe, no rise, no roll.
  - The whole overlay root cross-fades opacity 0 → 1 over 300ms, linear.
  - The odometer shows its final value and the marquee is static.
- **Un-haunt:** a 200ms opacity fade, then removal.

## Motion

- **Duration tokens:**

| Token | ms | Use |
|-------|----|-----|
| fast | 120 | Hover, press |
| base | 200 | Card open/close, Hide/Show, fades |
| slow | 300 | HUD slide, sprite rise |
| haunt | 2500 | Haunt moment |
| unhaunt | 1100 | Un-haunt |

- **Easings:**
  - `out` = `cubic-bezier(.2,.8,.2,1)`, for entrances.
  - `inOut` = `cubic-bezier(.45,0,.2,1)`, for the wipe.
  - `linear`, for the marquee and fades.
  - `steps(2)` for the 2-frame under-construction sign.
- **Card open:** opacity 0 → 1 and `scale(.96 → 1)` over 120ms `out`. Close is 120ms, opacity only.
- **Ghost drift:**
  - Bob ±4px vertical over 4000ms, ease-in-out alternate.
  - Sway ±6px horizontal over 7000ms.
  - Phase offset = slot index × 700ms.
  - Peak speed is about 6px/s, and a ghost never leaves its 64px lane slot.
- **Vampire drift:** ±2px vertical over 3000ms. The glow is static.
- **Marquee:** 60px/s linear. It restarts each line from the right edge and pauses while the tab is hidden.
- **Twinkles:** 4-point stars fade 0.4 ↔ 1 over 2000ms (0.5 Hz).
- **Under-construction sign:** 1 Hz.
- **Popup:** toggle knob 160ms `out`. Counts tween to their new value over 200ms. List rows enter with a 120ms opacity fade. No other popup motion.
- **3 Hz ceiling:** no luminance alternation has a period under 1000ms anywhere in this system, so it stays well under the 3 Hz limit.

**Reduced-motion rules** (`prefers-reduced-motion: reduce`, read live through a `matchMedia` change listener):

- `animation: none` on every costume layer.
- Transitions are limited to opacity, 200ms or less.
- The marquee is static. Its first line is shown and truncated with an ellipsis. Lines advance only on Hide/Show.
- Ghosts and vampires sit still at their slot centres. Twinkles are off. The sign shows frame 1.
- The haunt and un-haunt sequences are replaced by the cross-fades above.
- The popup count tween is replaced by an instant value change.

## Tokens

```json
{
  "costume": {
    "palette": {
      "crypt": "#000033",
      "cryptViolet": "#330066",
      "spectral": "#6633cc",
      "ectoplasm": "#66ff99",
      "ghostWhite": "#ffffff",
      "ghostShade": "#ccffff",
      "vampireGlow": "#ff0033",
      "vampireLining": "#660000",
      "bone": "#ffffcc",
      "star": "#ffff66",
      "stone": "#cccccc",
      "stoneShadow": "#666666",
      "moss": "#336633",
      "curse": "#ff9900",
      "ink": "#000000",
      "bevelLight": "#ccccff",
      "bevelDark": "#333366",
      "hudBevelLight": "#9999cc"
    },
    "hemTints": ["#ff99cc", "#99ccff", "#ccff99", "#ffcc99", "#cc99ff", "#99ffcc"],
    "fonts": ["Comic Sans MS", "Times New Roman"],
    "pixel": { "spriteScale": 3, "iconScale": 2 },
    "sprites": {
      "ghost": [48, 48],
      "vampire": [48, 54],
      "webmasterGhost": [96, 96],
      "tombstoneMarker": [16, 20],
      "badgeIcon": [12, 12],
      "hudIcon": [16, 16]
    },
    "layout": {
      "laneWidth": 64,
      "slotPitch": 72,
      "neighborhoodBar": 24,
      "marquee": 24,
      "hudMinHeight": 40,
      "hudMaxWidth": 720,
      "hudWrapBelow": 400,
      "cardWidth": 248,
      "tombstoneWidth": 176,
      "starTile": 64,
      "minText": 11
    },
    "hardShadow": "4px 4px 0 #000000",
    "focusRing": "2px dotted #ffff66, halo 0 0 0 5px #000000"
  },
  "popup": {
    "width": 360,
    "canvas": "#eef0f4",
    "surface": "#ffffff",
    "ink": "#111318",
    "muted": "#5b6170",
    "accent": "#6633cc",
    "accentTint": "#efe9fb",
    "pill": "#111318",
    "pillInk": "#ffffff",
    "hover": "#f5f6f8",
    "toggleOff": "#d6d9e0",
    "statusIdle": ["#e3e6ec", "#5b6170"],
    "statusHaunted": ["#efe9fb", "#6633cc"],
    "statusRestricted": ["#fff1e0", "#8a4600"],
    "radius": 18,
    "radiusTile": 10,
    "typeScale": [12, 13, 15, 20, 28, 36],
    "spacing": [4, 8, 12, 16, 20, 24, 32],
    "shadow": "0 1px 2px rgba(17,19,24,.04), 0 8px 24px rgba(17,19,24,.06)",
    "pillHeight": 48,
    "rowHeight": 56
  },
  "motion": {
    "fast": 120,
    "base": 200,
    "slow": 300,
    "haunt": 2500,
    "unhaunt": 1100,
    "reducedHaunt": 300,
    "reducedUnhaunt": 200,
    "easeOut": "cubic-bezier(.2,.8,.2,1)",
    "easeInOut": "cubic-bezier(.45,0,.2,1)",
    "ghostBob": { "px": 4, "ms": 4000 },
    "ghostSway": { "px": 6, "ms": 7000 },
    "marqueePxPerSec": 60,
    "twinkleMs": 2000
  }
}
```
