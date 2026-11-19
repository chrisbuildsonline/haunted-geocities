# Haunted GeoCities: Design System

Every UI feature cites this file. There are two worlds, and they are deliberately different:

- **The costume:** a 1998 GeoCities crypt drawn over any page. Only the 216 web-safe colours, Comic Sans MS / Times New Roman, original pixel art, bevels and hard edges. The comic stack is `"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive`; Comic Neue (SIL OFL, close to Comic Sans in shape and width) is installed in the test Docker image (`fonts-comic-neue`, the build fails without it), so the visual baselines show a comic face where the copy says Comic Sans, never a serif fallback.
- **The popup:** a Windows 95 window, 360px wide: the same era as the crypt, kept clean and scannable.

Both worlds share the web-safe violet `#6633cc`. In the costume it is the spectral glow. In the popup it is only the focus ring. Exact values are in the `## Tokens` JSON. Where prose and JSON disagree, the JSON wins.

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
- The only document-level change is one adopted stylesheet, the page sheet. It holds the body padding, the HUD lift variable, the content column restyle (fonts and links), and the parchment tint and guestbook frame drawn as `html::before` / `html::after` (see "Content column costume"). Un-haunt removes it together with the host.

Layers, bottom to top:

| z | Layer | pointer-events | Notes |
|---|-------|----------------|-------|
| 0 | Page sheet: parchment tint, then guestbook frame | none | `html::before` / `html::after` at z-index 2147483646, one under the host, so every layer below sits above them |
| 1 | Gutter starfield, or the 12px edge frame in full-overlay mode | none | The tile is never over the column's text (see below) |
| 2 | Lanes: ghosts, vampires | sprites `auto`, lane `none` | Left/right gutter lanes, 64px wide |
| 3 | Markers: tombstones, curse badges | marker `auto` | Pinned beside page elements |
| 4 | Top bands: neighborhood bar + marquee | bar links `auto` | 24px + 24px |
| 5 | HUD, and the graveyard strip above it | `auto` on their own boxes | Bottom control strip; the graveyard is drawn only in full-overlay mode, 4px above the HUD |
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
| Parade ghost, near / far (haunt moment only) | 16×16 | 144×144 / 96×96; 48×48 / 32×32 at 400px or less (9, 6, 3 and 2 CSS px per art pixel; the 9, 6 and 2 are the only exceptions to the 3px rule) |
| Tombstone marker | 8×10 | 16×20 |
| Curse badge icon | 6×6 | 12×12 |
| HUD icons | 8×8 | 16×16 |
| Under-construction sign | 24×12 | 48×24 |

Each ghost body is `#ffffff` with `#ccffff` shade and `#000033` eyes. Its 2-art-px hem is tinted per company, so ghosts side by side never share a hem colour:

- **Base tint:** hash(company) mod 6 over `#ff99cc #99ccff #ccff99 #ffcc99 #cc99ff #99ffcc` (`hemTint`).
- **Neighbours differ:** tints are handed out in ghost order (most requests first, then by name; vampires are not in it). A ghost whose base tint equals the tint of either of the two ghosts before it moves on to the next tint in the list (wrapping from the last to the first) until it differs from both. The first ghost keeps its base tint. With two lanes the slots alternate sides, so two back is the ghost just above in the same lane; with one lane it is one back (`assignTints` in `src/content/costume/ghosts.ts`).
- **Same tint everywhere:** the lanes and the popup ghost rows use the same `assignTints` over the same order, so a company has one hem colour in both. A ghost whose tint changes on an update keeps its element, focus and label; only its sprite is redrawn.

### Starfield (tiled, never over text)

- **Tile:** 64×64, painted once to a canvas and used as a tiled `background-image`. Ground is `#000033`. Add 6 single `#ffffff` pixels, 2 `#ffff66` 2×2 stars and one 5×5 `#ffffcc` 4-point twinkle.
- **Content column:**
  1. Start from the bounding box of `main`/`article`. If neither exists, use the widest block holding more than 50% of the page's text.
  2. Widen it to cover every text node rect grown by 12px on each side, so no text sits closer than 16px to the guestbook frame's inner edge (the 12px plus its 4px gap). Text the box already pads by 12px or more widens nothing; text wider than the box, such as a site header above the article, pushes the column out.
- **Gutters:** the gutters are everything left and right of the column. Fill them with the tile at opacity 0.92. A 16px edge toward the column is 2×2-checker dithered (1998 dithering, no gradients). The gutters stop 11px short of the column, where the guestbook frame's line is.
- **Narrow pages (full-overlay mode):** with no gutter of 64px or more (phones, full-width pages), there are no gutters. The starfield appears inside the top bands, the HUD and a 12px edge frame fixed inside the viewport edges, whose inner 4px is 2×2-checker dithered. The whole page width is tinted and restyled, and the page sheet adds 12px to the body's inline padding so no text sits under the edge frame. The ghosts and vampires stand in the docked graveyard strip above the HUD (see "Docked graveyard"), not in the HUD count alone. The page body stays fully visible and clickable.

### Content column costume

The costume dresses the page itself, not only its edges. Everything here is rules in the page sheet, so no page element, attribute or inline style changes, and un-haunt takes it all away in one reflow.

- **Restyle:**
  - Body text in Times New Roman; `h1`, `h2` and `h3` (and what is inside them) in Comic Sans MS. `!important`, with `:where()` so the heading rule wins over the body rule.
  - Kept as they are, with everything inside them: form controls (`input`, `textarea`, `select`, `button`), code (`pre`, `code`, `kbd`, `samp`, `tt`, `var`), `svg`, `math`, `i`, and icon fonts (`[class*="icon"]`, `fa-`, `material`, `glyph`, `[data-icon]`, `[aria-hidden="true"]`).
  - Links underlined. Light pages: `#0000ff`, visited `#990099`, hover `#ff0000`. Dark pages: `#66ccff`, visited `#cc99ff`, hover `#ff0000`. No colour transition under reduced motion.
  - Site chrome keeps its link colours, because it often sits on its own dark bar: links in `nav`, in a `header` or `footer` outside `main`/`article`, in the banner, navigation and contentinfo roles, and links dressed as buttons (`[role="button"]`, `[class*="btn"]`, `[class*="button"]`).
  - Visited is `#990099`, the web-safe neighbour of the classic `#800080`.
- **Light or dark:** the page is dark when the WCAG relative luminance of the body background (else `html`, else white) is under 0.4. It is checked again on resize, on a `prefers-color-scheme` change and when `class` or `style` changes on `html` or `body`.
- **Contrast:** every link colour must reach 4.5:1 on what it sits on: the page background, multiplied by `#ffffcc` where the tint is drawn. A colour that misses moves to the nearest web-safe colour (RGB distance) that reaches it. On white the hover `#ff0000` (3.9:1 on parchment) becomes `#cc0000` (5.7:1).
- **Parchment tint (light pages only):** `#ffffcc` with `mix-blend-mode: multiply` over the column, so white turns to old paper and black text stays black. It is `html::before` in the page sheet, not a shadow-root node: a blend inside the fixed `<hg-crypt>` host only blends with the host's own stacking context and would paint a flat yellow sheet over the text.
- **Guestbook frame:** `html::after`, around the tint: a 6px ridge (an outer 3px band `#9999cc` top-left / `#333366` bottom-right, an inner 3px band reversed), a 1px `#000000` line and a `0 0 6px 1px #6633cc` glow, 4px clear of the column. Not drawn in full-overlay mode.
- **Placement:** tint and frame are in document coordinates and run the full height of the document, like a 1998 page-long centred table. Their top is under the bands, so no strip of the modern page shows above them, and they scroll with the page on the compositor, so they never lag it. The column is measured again after the restyle lands and when web fonts load, because new fonts move the text.
- **Pointer and focus:** every layer here has `pointer-events: none` and takes no focus; the edge frame is `aria-hidden`.
- **Motion:** none of these layers animates. In the haunt moment the restyle lands at t=0 with the padding (one reflow), and the tint and frame wipe in behind the ghost with layer 1. Hide fades the tint and frame (200ms, instant under reduced motion); the restyle stays while hidden, because Hide keeps the haunt.

### Top bands: neighborhood bar + marquee

- **Neighborhood bar (24px):**
  - 24px tall, one line. Colours: `#330066` ground, Times New Roman 13px, `#ffffcc` text, a 1px `#6633cc` bottom edge.
  - Left side: `You are in: SiliconValley/Heights/2049`, the address in bold. Every host gets a neighborhood address `Neighborhood/Suburb/NNNN` from `src/data/neighborhoods.json` (`resolveNeighborhood` in `src/data/neighborhood.ts`): keyword and TLD rules first, else a stable hash. `localhost` is `Heartland/Homestead/1998`, an IP address is `Area51/Hangar/1998`. The address is never cut.
  - Middle: the neighborhood's tagline (e.g. `Where the webmasters code all night.`), same colour and font as the address, 12px from each side. It takes the space left, stays on one line and is cut with an ellipsis. Hidden under 480px wide.
  - Right side: the 48×24 under-construction sign. It is static, or 2 frames at 1 Hz with motion allowed.
- **Marquee (24px):** `#000033` ground, Comic Sans MS 14px, `#66ff99` text. It cycles lines such as `~*~ Welcome to my haunted homepage!!! ~*~ 7 ghosts are watching you ~*~ Best viewed at 800x600 ~*~`. Implemented as a CSS `translateX` keyframe. Never `<marquee>`.
  - **Stars never touch the text:** the band carries the starfield tile, but the line rides on a solid `#000033` plaque: the text box plus an 8px `#000033` border at each end (`background-clip: content-box`, so the 100% lead-in padding stays clear and the band's stars show around the line). Under reduced motion the plaque shrinks to the line, flush left, cut with an ellipsis.
- **Placement:** the bands sit at `top: 0`. If page UI is fixed or sticky at y=0 (sampled with `elementsFromPoint` along the top row), the bands sit just below it.

### HUD (guestbook / hit-counter strip)

- **Position:** fixed bottom, `left/right: 8px`, `bottom: calc(8px + var(--hg-lift))`, max-width 800px, centred, min-height 40px. 800 (not 720) so the empty state and the hit-counter labels are whole in a real comic face, which is wider than a serif fallback.
- **Lift:** `--hg-lift` is the height of any page UI fixed to the bottom (cookie bars, chat buttons). It is sampled with `elementsFromPoint` along the bottom 80px and re-checked on resize and on mutation.
- **Frame:**
  - Ground `#000033` with the starfield tile at 30%.
  - 2px bevel: `#9999cc` top-left, `#333366` bottom-right.
  - 1px `#000000` outer line and a hard shadow `4px 4px 0 #000000` (refs 04, 06).
- **Order (controls first, DOM order = visual order):**
  1. `[Hide]` Win95 button.
  2. Counts: `[ghost] 7 [vampire] 1 [tomb] 3 [curse] 2`, each a 16px icon + Comic Sans 13px `#ffffcc`. Ghosts and vampires count the companies still haunting: Exorcise lowers the number by one and Let it back raises it (the popup lists every company found, exorcised ones with their `Exorcised` tag). A number that changes on Exorcise or Let it back ticks: it drops 8px into place, 0 → 1 opacity, `#66ff99` → `#ffffcc`, over 300ms (`slow`, `out`); the other numbers stay still. Under reduced motion it changes in place.
  3. Hit counter: the label `Souls counted` (12px `#ffffcc`) with the sub-label `tracker requests blocked or seen` (12px `#ccccff`, 13:1 on `#000033`) under it, then the 6-digit odometer. Cells are 10×16, `#000000` ground, `#66ff99` pixel digits from an original 5×7 font. The value is total tracker requests seen; exorcised requests are the same requests blocked, so one number covers both and Exorcise never lowers it. The counter is a `role="group"` (not an image: it is a number with a label) with `title="tracker requests blocked or seen"` and the accessible name `Souls counted: 000123, tracker requests blocked or seen`; the visible label and digits are `aria-hidden` under it. At zero (no tracker request seen, e.g. a clean page) the six zeros are not drawn: the odometer cell holds the caption `No souls yet.` (Comic Sans MS 12px `#66ff99` on `#000000`, 16.3:1, in the odometer's sunken 1px frame, 22px tall like it) and the accessible name reads `Souls counted: none yet, tracker requests blocked or seen`. The first request swaps the caption for the digits. At 400px or less the sub-label is visually hidden (it stays in the title and the accessible name) so the HUD keeps to two rows; where the HUD is short of room above that, the two label lines end in an ellipsis.
  4. Web ring: `« prev | Haunted WebRing | next »`. It moves focus to the previous/next sprite on the page. At 400px or less the name drops its first word and reads `« prev | WebRing | next »`, so it stays whole beside the odometer in a real comic face (the `Souls counted` label is wider than in a serif fallback); the ring's accessible name stays `Haunted WebRing`. The name is never cut with an ellipsis, at 375, 700 or 1280.
- **Hide/Show:** Hide fades every costume layer out (200ms) and leaves a 40×40 `[Show]` tab bottom-right with the ghost icon. Haunt state is kept.
- **At 375px:**
  - At viewport width 400px or less, insets drop to 4px and the strip uses `flex-wrap: wrap; row-gap: 4px`.
  - Row 1 holds Hide + counts. Row 2 holds the hit counter + web ring.
  - Never more than 2 rows (88px) and never horizontal scroll.
- **Body padding:**
  - The page sheet sets body `padding-top` to the original computed value + 48px, and `padding-bottom` to the original + HUD height + 16px + lift, plus the graveyard strip's height + 4px while the strip is drawn. In full-overlay mode it also sets `padding-left` and `padding-right` to the original + 12px.
  - They are computed at haunt and again when the HUD wraps, the lift changes or the mode changes.
  - The sheet is removed on Un-haunt, so page content is never trapped under the costume.
- **Empty state:** when nothing is found, the counts are replaced by `No ghosts here. Suspiciously clean.` A page whose every company is exorcised is not clean: it keeps the counts, at zero.

### Ghosts (one per tracker company)

- **Lanes:**
  - A lane exists on a side only if that gutter is 64px or wider. Slots run at a 72px pitch (48 sprite + 24 label), between the top bands and the HUD.
  - IntersectionObserver re-checks each slot. Any slot intersecting a text rect is skipped.
  - When slots run out, the last slot becomes a `+N` stack token.
  - With no lane at all (phones, full-width pages: full-overlay mode), the lanes stay empty and every ghost and vampire docks in the graveyard strip above the HUD instead (see "Docked graveyard"). A company is never in a lane and the strip at once; widening the page moves them back into the lanes. Ghosts are never drawn over page text.
- **Glow:** `filter: drop-shadow(0 0 6px #6633cc) drop-shadow(0 0 2px #ccffff)`. This is the cool spectral backlight (ref 07).
- **Label:** under the sprite. Comic Sans 12px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis. Exorcised, the label text is `#ccccff`.
- **Card** (click or Enter):
  - Title bar: company name.
  - Body: category, `Haunts these domains:` (Times New Roman 13px list), `Seen 12 times on this page`.
  - Then the `[Exorcise]` default button.
  - Footnote: `Blocked on this tab until you un-haunt or leave the page.` (the block is a session rule for this tab; it goes on Un-haunt, reload, navigation or tab close).
  - After Exorcise, the sprite fades to 40% opacity with an `EXORCISED` stamp, and the button becomes `[Let it back]`.
  - **Exorcise moment:** the sprite spirals out once: a full turn over 400ms (`exorcise`, `inOut`), shrinking to half size at the half-turn and back to full, while its opacity falls from its look (1, or .6 for a known vampire) to 40%, only ever down. The stamp slams on over the second half: 200ms after 200ms, from `scale(1.5)` and opacity 0 to its resting tilt, `out`. The label and the button do not move; the HUD count ticks at the same time. It plays once, only on the change, in a lane or in the graveyard strip: a sprite drawn already exorcised, Let it back, and the haunt moment itself play nothing. Under reduced motion it is instant: no turn, no slam, and the sprite has no opacity transition, so the 40% look and the stamp are there at once.

### Docked graveyard

On a page with no gutter of 64px (full-overlay mode) the ghosts and vampires stand in a strip docked above the HUD, so a phone shows them too.

- **Place:** `#graveyard`, a direct child of `#crypt-root` after `#hud`, layer 5 with the HUD (under the cards). Fixed, with the HUD's insets, max-width (800px) and centring, its bottom 4px (`LAYOUT.graveyardGap`) above the HUD's top: `bottom: calc(8px + var(--hg-lift) + var(--hg-hud-h) + 4px)`. `--hg-hud-h` is the HUD's measured height, so the strip follows the lift and the HUD's two-row wrap. Hidden in lane mode.
- **Frame:** the HUD's: `#000033` ground (flat, no starfield, so the silhouettes read), 2px bevel `#9999cc`/`#333366`, 1px `#000000` line, hard shadow `4px 4px 0 #000000`. No radius, no blur.
- **Label bar:** 16px tall: the 16px tombstone icon and `Graveyard` in Comic Sans MS 12px `#ffffcc`, a 1px `#333366` line under it.
- **Stones row:** one `<button>` per company in the lane order (ghosts by requests then name, then vampires by name), 12px apart, 6px/18px padding, over a strip of `#336633` moss pixels along the base. Each docked sprite wears its name tag under it (the lane label, 4px below the sprite), and its button is as wide as the wider of the 48px sprite and the tag (at most 12ch, then an ellipsis), so neighbouring tags never touch: the 12px gap is always between them. Tags sit bottom-aligned on the moss and the row is one sprite and one tag tall, so no tag is clipped. When they do not fit, the row scrolls sideways (`overflow-x: auto`, `overscroll-behavior-x: contain`, never smooth), never the page, and Tab scrolls the focused sprite into view. No `+N` stack.
- **Sprites:** the lane sprites, labels, cards and exorcised look (40% opacity and the `EXORCISED` stamp). A card opened from a docked sprite stands above the strip, 8px inside the viewport, and focus returns to the sprite on close.
- **Empty state:** with no tracker found the strip is not drawn (zero height, no padding): the HUD's `No ghosts here. Suspiciously clean.` already says it, and a tracker-free phone page keeps its room. The strip still carries `No graves yet.` (Comic Sans MS 13px `#ffffcc`) for the moment its last company leaves.
- **Region:** `role="region"`, `aria-label="Graveyard of trackers"`; DOM order is the visual order. Only the strip's own box takes pointer events.
- **Motion:** the lane float (bob, sway, drift), all under 3 Hz. In the haunt moment the strip slides up with the HUD (same delay, duration and easing) and slides down with it on un-haunt; it has no phase of its own and its sprites do not rise then. Under reduced motion nothing in it moves. Hide fades it with the HUD.

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
- **Card is the stone:** a 208×248 `#cccccc` slab with a 104px top radius (a full arched headstone, no blur), a 2px bevel `#ffffff`/`#666666`, a hard shadow `4px 4px 0 #000000`, and moss pixels `#336633` along the base. It is the costume's one big light object on the dark crypt, so it is the high-contrast moment of a dead-link click. The inscription is pinned to the stone face (absolute: 64px from the top, 32px from each side, 28px from the base) in Times New Roman `#000000`:
  - `HERE LIES`: bold 16px/20px, letter-spacing 3px, carved: a 1px `#ffffff` highlight under-right of each letter (`text-shadow: 1px 1px 0`) over a carved rule (1px `#666666` groove with a 1px `#ffffff` lip, 12px in from each side, 6px under the letters).
  - The path, e.g. `/blog/2019/old-post.html`, at 13px. The minimum anywhere is 12px.
  - `404 · Not Found` (12px).
  - The inscription sits under the 24×24 `[x]` close button (32px from the top, 40px from the right, so its corner stays inside the arch).
- **Drop-in:** the stone falls into place instead of the cards' scale-in: class `drop-in`, `hg-drop` over 300ms (`slow`), played once. It falls 48px while fading 0 → 1 (ease-in, the first 60%), bounces 4px up and settles (ease-out then ease-in), landing with the stone thud. Under reduced motion there is no class and no animation: the stone is simply there in its final place, opacity 1.
- **Path wrapping:** the path clamps at 3 lines of 13px/17px (`-webkit-line-clamp: 3`, `max-height: 51px`). Insert `<wbr>` after every `/`. Set `overflow-wrap: normal; word-break: keep-all`, and make each segment one atomic box, so lines break at `/` and a segment that fits a line is never broken.
- **A segment wider than a line** (a long filename) wraps inside itself onto at most 2 lines (at its hyphens, else anywhere). If it needs more, its start is cut: characters are dropped from the front behind a `…` until it fits, so the end (`…long-haunted-filename-` / `that-must-not-break.html`) stays readable. If the path would then run past 3 lines, the segment gets 1 line instead of 2. The whole segment stays in a visually hidden copy for screen readers, and the path element carries `title` with the full path for hover.

### Cursed badges (dark patterns)

- **Badge:** `CURSED!` with a 12px skull icon. Comic Sans 12px bold `#000000` on `#ff9900`, 1px `#000000` border, hard shadow `2px 2px 0 #000000`, 18px tall.
- **Compact badge:** the same badge without its skull: the word `CURSED!` alone, 63px wide. The word is never hidden, so a badge is never an unlabelled glyph. Its accessible name stays `Cursed: <kind>: <snippet>`.
- **Placement:**
  - First choice: 4px right of the element's last line box.
  - If the full badge would cross text or the viewport edge there, the compact badge in the same spot, so on a 375px page the badge stays on its sentence's last line instead of jumping above it.
  - If that would cross text or the viewport edge (a line ending within about 67px of the edge), 4px above-left in the element's margin.
  - Otherwise, in the gutter lane at the same y.
  - Never over the text.
- **Card:** titled `Cursed: Fake scarcity` (or `Countdown`, `Confirmshaming`, `Pre-checked opt-in`). Body: the quoted snippet (60 chars max) and one line on the trick.

### Card style (ghost, vampire, tombstone frame, badge)

- **Frame:**
  - 248px wide, max-height 320px, scroll inside.
  - Ground `#000033`, 2px outset bevel `#ccccff`/`#333366`, `4px 4px 0 #000000` hard shadow.
  - Radius 0, the era rule. Only the headstone arch is rounded.
- **Title bar:** 28px tall, `#330066` (vampire `#660000`), Times New Roman bold 14px `#ffffcc`, and a 24×24 `[x]` Win95 close button (bold 13px) on the right: a 24px hit target.
- **Body:** 12px padding, Comic Sans 13px `#ffffcc`, links `#66ff99` underlined. The category tag is 12px; the footnote and the vampire's one line on fingerprinting are 12px `#ccccff` (13:1).
- **Smallest text:** 12px anywhere in the costume and the popup (`minText`).
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

A Windows 95 window, the same era as the crypt. It is 360px wide and at most 600px tall: the title bar and the status bar stay put, and the client area between them scrolls.

**The era costume wins over the old modern-dashboard rules.** This is a Costume Contest entry, and the judges said a 2024 flat popup broke the costume. Where the earlier popup rules (borderless floating cards, no nesting, rounded corners, soft blurred shadows, a near-black primary button, the system font) disagree with this section, this section wins. The popup keeps what made it scannable: one primary action, a fixed type scale, 4.5:1 contrast, the focus ring and the reduced-motion rule. The Win95 system greys (`#c0c0c0`, `#dfdfdf`, `#808080`) are not web-safe colours. They are exempt from the web-safe rule in `era-accuracy.md`, which governs the page costume, not the extension's own UI.

### Look

- **Window:** `#c0c0c0` face with a 2px raised bevel: `#ffffff` outer and `#dfdfdf` inner on the top-left, `#000000` outer and `#808080` inner on the bottom-right. 3px between the bevel and the title bar.
- **Title bar:** 24px, solid `#000080`, the 16px pixel ghost in white and `Haunted GeoCities` in bold white 13px. No status in it.
- **Bevels are box-shadows:** every bevel is an inset `box-shadow` with `0` blur, so corners stay square. Radius is `0` everywhere. Nothing has a blurred shadow or a gradient.
  - Raised (window, push buttons): `inset -1px -1px 0 #000000, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf`.
  - Sunken (list box, checkbox): `inset -1px -1px 0 #ffffff, inset 1px 1px 0 #808080, inset -2px -2px 0 #dfdfdf, inset 2px 2px 0 #000000`.
  - Status field: 1px only, `inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff`.
- **Group boxes:** content sits in etched group boxes (`<fieldset>` with a bold `<legend>`), never in floating cards. The etch is 2px: a 1px `#808080` border plus `1px 1px 0 #ffffff, inset 1px 1px 0 #ffffff`, with a 1px margin for the outer white line. 8px between group boxes, 8px window padding, 12px inside a group box.
- **Primary action:** exactly one, Haunt or Un-haunt, drawn as the Win95 default push button: full width, 40px, `#c0c0c0` face, the raised bevel, an extra 1px `#000000` frame (`0 0 0 1px #000000`) and a bold 13px `#000000` label. Pressed, the bevel inverts and the frame stays. While the answer is on its way the button is disabled: label `#808080` with the white emboss `1px 1px 0 #ffffff`.
- **Small push buttons:** Exorcise and Let it back, 24px, the raised bevel, 12px `#000000` label. Pressed, the bevel inverts.
- **Checkboxes:** each setting is a Win95 checkbox left of its label: a 13px sunken white box with a 7px black pixel check when on. The sub-line sits under the label.
- **Status bar:** two sunken status fields at the bottom of the window: the state (`Idle`, `Haunted` or `Can't haunt`) and the Tracker Radar attribution line. 12px.
- **Accent: `#6633cc` spectral violet** is the focus ring (`outline: 2px solid #6633cc; outline-offset: 2px` on every control) and the toolbar badge ground. Nothing else in the popup uses it.
- **Links:** `#0000ff`, visited `#800080`, underlined.
- **Text colours:** `#000000` ink, `#222222` sub-lines and attribution (8.7:1 on the face, so the 12px lines reach AAA).
- **Fonts:** UI text in `'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, Geneva, sans-serif`. The site title in Times New Roman (`"Times New Roman", Times, serif`). The hit-counter digits in Courier New (`"Courier New", Courier, monospace`) with `font-variant-numeric: tabular-nums`. No web fonts.
- **Type scale:**

| px | Weight | Use |
|----|--------|-----|
| 12 | 400 | Sub-lines, attribution, status bar, small buttons, count labels |
| 13 | 400 | Body text, setting labels |
| 13 | 700 | Title bar, primary label, group legends, row names |
| 24 | 700 | Site title (Times New Roman), hit-counter digits (Courier New) |

### Screen: idle (not haunted)

```text
+==[ghost16] Haunted GeoCities========== (title #000080, bold white 13) =+
| example.org                          <- Times New Roman bold 24        |
| +- Haunt -----------------------------------------------------------+ |
| | Turn this page into a 1998 crypt.                                  | |
| | Ghosts, vampires and dead links show up.            <- 12px #333   | |
| | [#### Haunt this page ####]  <- default push button, 40px          | |
| +--------------------------------------------------------------------+ |
| +- Settings ---------------------------------------------------------+ |
| | [ ] Check links to other sites                                     | |
| |     Asks Chrome to visit linked sites. Off.                        | |
| | [ ] Sound effects                                                  | |
| |     Muted                                                          | |
| +--------------------------------------------------------------------+ |
| [ Idle ]  [ Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0 ]  | <- sunken status bar
+========================================================================+
```

### Screen: haunted

```text
+==[ghost16] Haunted GeoCities============================================+
| example.org                                        <- 24px bold serif   |
| TimesSquare/Midway/7315                            <- address line, 12px|
| +- Found on this page -----------------------------------------------+ |
| | [ 0007 ]  [ 0001 ]  [ 0003 ]  [ 0002 ]  <- #000 cells, #33ff33 digits | |
| |  [g]       [v]       [t]       [c]       <- 16px sprite              | |
| |  Ghosts    Vampires  Tombstones Curses   <- kind label under each     | |
| | [#### Un-haunt ####]                                                  | |
| +--------------------------------------------------------------------+ |
| +- Ghosts (7) --------------------------------------------------------+ |
| | +-sunken white list box-------------------------------------------+ | |
| | | [g32] AdCo Inc                                      [Exorcise]  | | |
| | |       4 domains · Advertising                                   | | |
| | | [g32] PixelTrack                         (Exorcised) [Let it back]| | |
| | +-----------------------------------------------------------------+ | |
| +--------------------------------------------------------------------+ |
| +- Vampires (1) / Tombstones / Curses: same list box, same rows ------+ |
| +- Settings (as idle) ------------------------------------------------+ |
| [ Haunted ]  [ Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0 ] |
+========================================================================+
```

- **Hit counters:** each count is a black `#000000` cell with `#33ff33` Courier New bold 24px digits, padded with zeros to four digits like a 1998 hit counter. The zeros are drawn by CSS (`content: attr(data-pad) / ""`), so a screen reader reads `7 Ghosts`, not `0007`. The 16px sprite and the kind label sit under each cell. Four in a row, a 2x2 grid under 340px.
- **Address line:** the page host's neighborhood address (the same one the costume's bar shows) as one 12px `#222222` line under the title, `.address` with `margin-top: -6px` so it reads with the title. It may break anywhere rather than overflow. Haunted screen only, and only when the URL has a host.
- **Lists:** a group box per kind (`Ghosts (7)`, `Vampires (1)`, `Tombstones (3)`, `Curses (2)`), each holding a sunken white list box that scrolls at 280px. Ghosts by request count, then vampires by name, then tombstones and curses in the order reported.
- **Rows:** a 32px square sprite tile + the name in bold 13px + a 12px sub-line, the action on the right. Hover is a `#ccccff` ground. Exorcised rows keep full contrast: the `Exorcised` tag and the `Let it back` button already say the state.
- **Ghost row tiles:** each ghost sprite wears the same hem tint as its lane ghost (see the hem tint rule under Pixel-art grid), so neighbouring rows never share a hem colour.
- **Vampire rows:** a caught vampire has the `Caught` tag and what it read (`Canvas readback · font probing`). A known vampire (on the list, not caught here) has the `Known` tag and the line `On the Tracker Radar fingerprint list`.
- **Tags:** square, a 1px `#000000` border, 12px bold. Ground / text: Caught `#ccccff`/`#330099`, Known `#cccccc`/`#000000`, 404 `#ffcccc`/`#660000`, 410 `#ffcc99`/`#663300`, Exorcised `#cccccc`/`#333333`.
- **Empty states:** a kind with nothing found shows one line instead of its list box. The lines of every empty kind share one `Nothing found` group box at the head of the list, in kind order, before the group boxes of the kinds that were found. So a clean page stays short, and the lines are whole on screen as the popup opens however long the lists below them run: `No ghosts here. Suspiciously clean.` (13px ink) and `Trackers that load later will appear here.`, `No vampires. Your blood is safe.`, `No tombstones. Every link is alive.`, `No curses. This page plays fair.` (12px `#222222`).
- **Scrolling:** the client area between the title bar and the status bar is the one scroller (`flex: 1 1 auto; min-height: 0; overflow-y: auto`); the status bar is `flex: none`, so the lists scroll above it and nothing ever runs under it.

### Screen: restricted page

Applies to `chrome://`, `chrome-extension://`, `edge://`, `about:`, `view-source:`, the Chrome Web Store, the PDF viewer, and `file://` without access.

```text
+==[ghost16] Haunted GeoCities============================================+
| This page is protected                             <- 24px bold serif   |
| +- Why not -----------------------------------------------------------+ |
| | Chrome doesn't let extensions draw on its own pages. Open any website | |
| | and press Haunt there.                  (no primary push button)      | |
| +--------------------------------------------------------------------+ |
| +- Settings (as idle) ------------------------------------------------+ |
| [ Can't haunt ]  [ Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0 ] |
+========================================================================+
```

The Settings group box stays on this screen, as it always has, so link checks and sound can be set from any tab.

### Row: "Check links to other sites" (opt-in)

- **Off by default.** Sub-line: `Asks Chrome to visit linked sites. Off.`
- **Ticking it:** opens `permissions.html` in a new tab. The popup never asks Chrome itself, because Chrome's permission dialog closes the toolbar popup before it answers. The checkbox clears again and the sub-line reads `Finish on the page that just opened.`
- **On:** whenever the popup opens (and while it stays open) the checkbox follows `chrome.permissions.contains`. When granted the sub-line reads `Checking links on other sites too.`
- **Clearing it:** removes the permission from the popup directly.
- **Scope:** same-origin links are always checked.
- The control is a native checkbox with `role="switch"`, so assistive tech announces an on/off setting.

### Page: `permissions.html` (link-check permission)

A tab, not a popup: one Win95 dialog on an empty `#008080` desktop. The body is not fixed at 360px. Nothing on it animates or transitions, and nothing changes on hover.

```text
#008080 desktop, nothing else on it
          +==[ghost16] Check links to other sites===================+
          |  [tomb48]  Haunted GeoCities will send cookie-free      |
          |            requests to the sites a haunted page links   |
          |            to, to find dead links. Chrome words this    |
          |            as access to all websites.                   |
          |  [#### Allow link checks ####]  <- default push button  |
          |  [# Link checks are on. You can close this tab. ]       | <- sunken status field,
          +=========================================================+    hidden until answered
```

- **Dialog:** at most 440px wide, centred, 12vh from the top (32px under 480px wide), the window bevel. The title bar text is the page's `h1`, `Check links to other sites`.
- **Body:** a message box. The 48px headstone sprite left of the explanation, which is exactly: `Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites.`
- **Button:** `Allow link checks`, the default push button, full width. It calls `chrome.permissions.request` straight from the click. Once granted it is disabled: label `#808080` with the white emboss `1px 1px 0 #ffffff`. After a refusal it stays enabled so the user can try again.
- **Status field** (`role="status"`, polite): 12px, 1px sunken, a square 6px marker in the text colour.
  - Granted: `#000000` on `#ffffff`, `Link checks are on. You can close this tab.` (or `Link checks are already on.` when the page opens after a grant).
  - Refused: `#660000` on `#ffcccc`, `Chrome didn't allow it. Link checks stay off.`
- **Focus:** the popup ring, `2px solid #6633cc`, offset 2px.

### Contrast (popup)

| Text | Ground | Ratio |
|------|--------|-------|
| `#000000` body, labels, legends | `#c0c0c0` face | 11.5:1 |
| `#222222` sub-lines, attribution | `#c0c0c0` face | 8.7:1 |
| `#000000` / `#222222` | `#ffffff` list box, status field | 21:1 / 15.9:1 |
| `#000000` / `#222222` | `#ccccff` row hover | 13.6:1 / 10.4:1 |
| `#ffffff` title bar text | `#000080` | 16.0:1 |
| `#33ff33` counter digits | `#000000` | 15.5:1 |
| `#0000ff` link / `#800080` visited | `#c0c0c0` | 4.7:1 / 5.2:1 |
| Tags and the refused status | their grounds | 7.0:1 or more |
| `#6633cc` focus ring (not text, 3:1 needed) | `#c0c0c0` / `#ffffff` | 4.0:1 / 7.2:1 |

Disabled controls are the one exception: the granted `Allow link checks` label at `#808080` on `#c0c0c0` is 2.2:1. WCAG 1.4.3 exempts inactive components, and the status field next to it states the result at 21:1.

### Toolbar badge

While a tab is haunted, the extension icon carries that tab's total: ghosts (vampires included) + tombstones + curses, the same sum as the popup's hit counters.

- Text: empty at 0, `1` to `99`, then `99+`.
- Colours: `#6633cc` ground, `#ffffff` text (7.1:1), the one accent.
- Always set per tab. Cleared on Un-haunt, on a reload or navigation, and when the tab closes.

### Row: audio toggle

- **Default:** `Sound effects`, checkbox clear, sub-line `Muted`.
- **When on:** the sub-line reads `On · plays only after you click`. Sound starts only from that gesture. There is no ambient loop.
- **What plays:** the Haunt click plays the whoosh (see "Haunt moment"). Opening a card plays one short sound: a ghost card a soft "ooo", a vampire card a low organ stab, a tombstone card a stone thud, a curse card a short sting. Closing a card, or clicking the marker of the card already open, plays nothing.

## Haunt moment

**"The page dies into 1998."** (Hero haunt moment, `MOTION.hero` in the tokens.)

- **The idea:** the modern page switches off like a 1998 CRT: scanlines, the picture closes to a bright line, the line shrinks to a dot. The tube comes back on with its picture rolling once, and a 96px pixel ghost glides across the viewport. Behind it the page is 1998; ahead of it the page is still modern. Its trailing edge is a strip of dithered ectoplasm. While it crosses, the whole page is overrun: six big tracker ghosts (the parade, the page's own tracker companies with their names) stream up through it from the bottom edge to the top (on a phone they ride the top bands instead, off the text), and a caption, `Trackers found: 6`, brings up the rear. Then the tracker ghosts rise into their lanes one by one, each with its company name tag.
- **The clip:** it reads in three seconds: dark line, wipe with the parade streaming through the page and its count at the end, ghosts rising with names.
- **The parade (the scene-wide beat):** six 16×16 tracker ghosts drawn big: three near ones at 144×144 (9 CSS px per art pixel, opacity .92) and three far ones at 96×96 (6 CSS px, opacity .6), so the flock has depth. They are the only sprites off the 3px grid: a close-up, still on integer pixels with `image-rendering: pixelated`. Each starts just below the viewport and ends just above it (a ghost with a name tag ends with the tag above it too, 26px higher, so no tag is left hanging at the top edge), sliding 32-40px sideways as it rises so the flock fans out; their x positions spread over the whole width (6%, 74%, 40%, 96%, 22% and 70% of the free width, in start order). They wear the lane ghost's glow, a little wider (`drop-shadow(0 0 8px #6633cc) drop-shadow(0 0 2px #ccffff)`). They sit in `#fx` under the Webmaster's Ghost, so they cross the page text only while the moment plays; no resting ghost is ever over text.
- **Who marches:** the page's own tracker companies, so "each ghost is a tracking company" is true. The first six in lane order (ghosts by request count, then vampires by name), as the scanner has them at the Haunt click (it reads the requests the page already made at once). Each wears its lane ghost's hem tint (a vampire company its base hem tint) and carries its company name under it: a tag in the lane-tag look, 14px/18px Comic Sans `#ffffcc` on `#000033` with a 1px `#6633cc` border, 4px below the sprite. With fewer than six companies, decorative fillers (`data-filler`, no name) make up six, in the hem tints the real ones left over; a page with no trackers gets six fillers, one per hem tint.
- **On a phone (400px wide or less, the HUD's wrap width):** the page's text fills the screen, so the parade keeps off it. The same six ride the top bands (the neighbourhood bar and the marquee) left to right as a ghost train instead of rising through the page: near ones 48×48 (the lane ghost's own 3px grid) and far ones 32×32 (2 CSS px), each centred in the band strip, starting 200ms apart and crossing in 1200ms, so they stay 70px apart and never clump. No name tags there (the band has no room); the tint still matches the lane ghost. The train rides over the neighbourhood bar, so the bar's address waits for it: it is unveiled behind the last ghost, 8px behind its left edge (clear of its glow), by a `clip-path: inset(0 <right> 0 0)` on the same timing as that ghost's ride (held hidden before it, dropped after it), the way the Webmaster's Ghost wipes 1998 in. Nothing in the parade is ever over the page's text or the bar's address at 375 (`e2e/haunt-parade.spec.ts` checks every line box throughout).
- **The caption:** the parade ends on `Trackers found: N`, where N is every tracker company the scanner has at the Haunt click (the same list the parade ghosts come from, so it can be more than the six that march; a clean page says `Trackers found: 0`). One line in the name-tag look: Comic Sans 14px/18px `#ffffcc` on `#000033` with a 1px `#6633cc` border and 1px/6px padding, 22px tall, no wrap. It is the only text in the parade on a phone, where the ghosts drop their name tags.
  - **Wide (over 400px):** it rises in the first ghost's column (that ghost's x), from just below the bottom edge to just above the top, starting at 1500 (two beats after the last ghost) and leaving at 3000. It travels less than the ghosts in the same time, so they draw away from it and it is the last thing in the parade on screen.
  - **Phone (400px or less):** it rides the marquee band, under the neighbourhood bar's text and centred in the band's 24px, one beat behind the last ghost (from 2000) at the 48px ghosts' speed, so the gap to that ghost holds all the way across; it leaves the right edge last.
- **Skip:** a click (pointerdown) or any key press anywhere on the page during the moment skips it: every animation jumps to its end at once, `#fx` is removed, and the page is the settled costume. The two listeners sit on the window in the capture phase (a page that stops propagation cannot keep the moment playing) and are removed when the moment ends, skipped or not. No timers. Under reduced motion the same click or key ends the 300ms fade.
- **The roll:** as the lids open, one 48px band of 2px `#6633cc` scanlines every 3px (opacity .7) with a 2px `#66ff99` leading edge rolls down the whole page once: the vertical hold slipping as the tube warms up. The violet lines read on white pages and the green edge on dark ones.
- **Total: 3000ms** with up to four ghost companies. Each ghost after the 4th adds 250ms (8 ghosts end at 3850ms). On a phone the caption is the last to leave the band, about 3450ms at 375 (the rest of the costume has settled by 3000).
- **How it is built:** the Web Animations API on transform, opacity and clip-path only, all inside the shadow root. The page is untouched. `#fx` carries `data-phase`: `crt`, then `wipe` at 700ms, then `rise` at 1700ms, moved by two marker animations that animate nothing (no timers).

| t (ms) | Layer | What happens | Easing |
|--------|-------|--------------|--------|
| 0-150 | FX scanlines | A full-viewport tile of 1px `#000033` lines every 3px (a 4×3 pixel tile, no gradient) fades in | linear |
| 0-200 | FX vignette | Radial `#000033` from transparent centre to 40% at edges fades in | `cubic-bezier(.2,.8,.2,1)` |
| 150-450 | FX lids | Two `#000000` lids, each half the viewport, slide in from the top and bottom (`translateY(∓100%)` → 0) and meet at mid-height | `cubic-bezier(.45,0,.2,1)` |
| 450-600 | FX phosphor line | A 2px `#ccffff` line across the middle shrinks `scaleX(1)` → `scaleX(0)`, to a dot. It is only there in this window. | `cubic-bezier(.2,.8,.2,1)` |
| 600-800 | FX lids | The lids slide open again on the page | `cubic-bezier(.45,0,.2,1)` |
| 800-1400 | FX roll | The roll band travels `translateY(-100%)` → `translateY(<viewport height>px)`, top to bottom, once | linear |
| 800 + 100·i, 1600ms | FX parade | Parade ghost i travels `translate(0, <viewport height>px)` → `translate(±32-40px, -<size>px)` (`-(<size> + 26)px` with a name tag): from under the bottom edge to over the top edge. The last one leaves at 2900. | linear |
| 1500-3000 | FX caption | `Trackers found: N` rises `translate(0, <viewport height>px)` → `translate(0, -100%)` in the first ghost's column. | linear |
| 800 + 200·i, 1200ms | FX parade (400px or less) | Parade ghost i rides the band strip `translate(-<size>px, 0)` → `translate(<viewport width>px, 0)`: in at the left edge, out at the right. The last one leaves at 3000. | linear |
| 1800-3000 | Neighbourhood bar address (400px or less) | Unveiled left to right 8px behind the last parade ghost's left edge, on that ghost's timing. | linear |
| 2000, at the train's speed | FX caption (400px or less) | `Trackers found: N` rides the marquee band `translate(-100%, 0)` → `translate(<viewport width>px, 0)`, one beat behind the last ghost (about 1430ms at 375). | linear |
| 700-1600 | FX ghost + layers 1 and 4 | The 96×96 Webmaster's Ghost travels `translateX(-96px → 100vw)` at mid-viewport height, with one ±6px vertical bob (a single 900ms cycle). The gutter starfield (or edge frame), the parchment tint, the guestbook frame and the top bands reveal behind it via `clip-path: inset(0 calc(100% - X) 0 0)`. Ghost and clip share one timing object, so they stay synced. A 32px strip trails the ghost: a 2×2 checker of `#66ff99`/transparent, the dither seam. | `cubic-bezier(.45,0,.2,1)` |
| 1600-1900 | FX | Ghost leaves the right edge. Scanlines 1 → 0 and vignette 40% → 0. | `cubic-bezier(.2,.8,.2,1)` |
| 1700 + 250·i | Lanes | Tracker ghost i rises 48px into its slot and fades 0 → 1 over 400ms, one by one in lane order (first 8; the rest arrive with the 8th). | `cubic-bezier(.2,.8,.2,1)` |
| ghost start + 200 | Name tags | The ghost's company name tag pops in: opacity 0 → 1, `scale(.6)` → `scale(1)` from its top edge, 200ms. A tag never shows before its ghost. | `cubic-bezier(.2,.8,.2,1)` |
| 1900-2200 | HUD | Slides up from `translateY(100%)` to its lifted position (the graveyard strip with it) | `cubic-bezier(.2,.8,.2,1)` |
| 2200-2800 | HUD odometer | Digits roll from 000000 to the count as continuous `translateY` strips, right digit first, 600ms | `cubic-bezier(.2,.8,.2,1)` |
| 2300-2900 | Vampires | Fade in (300ms), then a single glow swell, `drop-shadow` 0 → 6px. One swell, no pulsing. | `cubic-bezier(.2,.8,.2,1)` |
| 2800-3000 | Markers | Tombstones and curse badges fade in, 200ms | linear |

- **Flash safety:** the screen goes dark once (the lids, 150-450ms) and comes back once (600-800ms): one dark-then-light change over 800ms, not a flicker. Every other change is monotonic, and nothing toggles back. The roll, the parade and its caption move position only (no opacity or colour change), and the phone's address is unveiled once, left to right, like the wipe: the roll passes any point of the page once, in under 100ms, and never comes back. The only periodic motion is the 900ms bob (1.1 Hz, position only). Nothing strobes above 3 Hz.
- **Graveyard strip:** on pages where the sprites dock above the HUD, they slide up with it and do not rise; the CRT and the wipe still play.
- **Audio:** muted by default. If the user has turned sound on, the popup plays a 900ms band-passed noise "whoosh" from the Haunt click itself, so it runs alongside the wipe. The page plays nothing during the haunt moment.
- **Cost:** 7 sprites (the Webmaster's Ghost and the six parade ghosts), 1 caption, 1 dither strip, 1 vignette, 2 scanline tiles (the screen and the roll), 2 lids, 1 line. Transform and opacity only, so it composites. The FX layer is removed when the moment ends, so the settled costume is the same with or without the parade.
- **Layout:** every FX element is absolutely placed inside `#fx` (`overflow: hidden`) in the fixed host, so nothing in the moment can widen or scroll the page at 375, 700 or 1280 (`e2e/haunt-parade.spec.ts` checks `scrollWidth` throughout).

**Un-haunt (reverse), 1100ms:**

| t (ms) | What happens |
|--------|--------------|
| 0-200 | Markers fade out |
| 200-500 | Sprites sink 16px and fade |
| 300-600 | HUD slides down |
| 500-1100 | The Webmaster's Ghost crosses right → left (600ms). The clip shrinks behind it, handing the page back to the modern world. |
| 1100 | The shadow host and the page sheet are removed together, so the body padding, fonts and link colours go in one reflow. Page markup is byte-identical. |

**prefers-reduced-motion: reduce**

- **Haunt:**
  - No CRT (no scanlines, lids, line or roll band), no ghost, no parade, no wipe, no rise, no stagger, no odometer roll, no `#fx`. Name tags show at once.
  - The settled costume is the same as after the full moment: the parade and the roll live only in `#fx`.
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
| haunt | 3000 | Haunt moment (up to four ghosts) |
| unhaunt | 1100 | Un-haunt |
| exorcise | 400 | Exorcise moment (sprite spiral, stamp slam in its second half) |

- **Easings:**
  - `out` = `cubic-bezier(.2,.8,.2,1)`, for entrances.
  - `inOut` = `cubic-bezier(.45,0,.2,1)`, for the wipe.
  - `linear`, for the marquee and fades.
  - `steps(2)` for the 2-frame under-construction sign.
- **Card open:** opacity 0 → 1 and `scale(.96 → 1)` over 120ms `out`. Close is 120ms, opacity only. The tombstone card drops in instead (see "Tombstones"): 300ms, once, a 48px fall and a 4px bounce.
- **Ghost drift:**
  - Bob ±4px vertical over 4000ms, ease-in-out alternate.
  - Sway ±6px horizontal over 7000ms.
  - Phase offset = slot index × 700ms.
  - Peak speed is about 6px/s, and a ghost never leaves its 64px lane slot.
- **Vampire drift:** ±2px vertical over 3000ms. The glow is static.
- **Marquee:** 60px/s linear. It restarts each line from the right edge and pauses while the tab is hidden.
- **Twinkles:** 4-point stars fade 0.4 ↔ 1 over 2000ms (0.5 Hz).
- **Under-construction sign:** 1 Hz.
- **Popup:** none. The Win95 window does not move: no transitions, no animations, and the counts change in place.
- **3 Hz ceiling:** no luminance alternation has a period under 1000ms anywhere in this system, so it stays well under the 3 Hz limit.

**Reduced-motion rules** (`prefers-reduced-motion: reduce`, read live through a `matchMedia` change listener):

- `animation: none` on every costume layer.
- Transitions are limited to opacity, 200ms or less.
- The marquee is static. Its first line is shown on its plaque and truncated with an ellipsis. Lines advance only on Hide/Show.
- Cards open in place: no scale-in, and the tombstone card has no drop.
- Exorcise is instant: no spiral or slam, no opacity transition on the sprite, and the HUD numbers change in place.
- Ghosts and vampires sit still at their slot centres. Twinkles are off. The sign shows frame 1.
- The haunt and un-haunt sequences are replaced by the cross-fades above.
- The popup has no motion to reduce; its `prefers-reduced-motion: reduce` block stays as a guard.

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
      "hudBevelLight": "#9999cc",
      "phosphor": "#ccffff"
    },
    "page": {
      "link": "#0000ff",
      "visited": "#990099",
      "hover": "#ff0000",
      "hoverFallback": "#cc0000",
      "darkLink": "#66ccff",
      "darkVisited": "#cc99ff",
      "parchment": "#ffffcc",
      "frameLight": "#9999cc",
      "frameDark": "#333366",
      "frameLine": "#000000",
      "glow": "#6633cc"
    },
    "hemTints": ["#ff99cc", "#99ccff", "#ccff99", "#ffcc99", "#cc99ff", "#99ffcc"],
    "fonts": ["Comic Sans MS", "Times New Roman"],
    "pixel": { "spriteScale": 3, "iconScale": 2 },
    "sprites": {
      "ghost": [48, 48],
      "vampire": [48, 54],
      "webmasterGhost": [96, 96],
      "paradeGhost": [144, 144],
      "paradeGhostFar": [96, 96],
      "paradeGhostPhone": [48, 48],
      "paradeGhostPhoneFar": [32, 32],
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
      "hudMaxWidth": 800,
      "hudWrapBelow": 400,
      "cardWidth": 248,
      "tombstoneWidth": 208,
      "starTile": 64,
      "minText": 12,
      "frameBevel": 6,
      "frameGap": 4,
      "edgeFrame": 12,
      "edgeDither": 4,
      "darkLuminance": 0.4,
      "minContrast": 4.5,
      "graveyardGap": 4
    },
    "hardShadow": "4px 4px 0 #000000",
    "focusRing": "2px dotted #ffff66, halo 0 0 0 5px #000000"
  },
  "popup": {
    "width": 360,
    "maxHeight": 600,
    "face": "#c0c0c0",
    "hilite": "#ffffff",
    "light": "#dfdfdf",
    "shadow": "#808080",
    "dark": "#000000",
    "title": "#000080",
    "titleInk": "#ffffff",
    "field": "#ffffff",
    "ink": "#000000",
    "sub": "#222222",
    "hover": "#ccccff",
    "counter": "#000000",
    "counterInk": "#33ff33",
    "link": "#0000ff",
    "visited": "#800080",
    "desktop": "#008080",
    "accent": "#6633cc",
    "tags": {
      "caught": ["#ccccff", "#330099"],
      "known": ["#cccccc", "#000000"],
      "dead404": ["#ffcccc", "#660000"],
      "dead410": ["#ffcc99", "#663300"],
      "exorcised": ["#cccccc", "#333333"]
    },
    "radius": 0,
    "blur": 0,
    "fonts": {
      "ui": ["MS Sans Serif", "Microsoft Sans Serif", "Tahoma", "Geneva", "sans-serif"],
      "title": ["Times New Roman", "Times", "serif"],
      "counter": ["Courier New", "Courier", "monospace"]
    },
    "typeScale": [12, 13, 24],
    "spacing": [4, 8, 12],
    "titleBar": 24,
    "primaryHeight": 40,
    "buttonHeight": 24,
    "checkbox": 13,
    "rowTile": 32,
    "listMaxHeight": 280,
    "dialogMaxWidth": 440
  },
  "motion": {
    "fast": 120,
    "base": 200,
    "slow": 300,
    "haunt": 3000,
    "unhaunt": 1100,
    "reducedHaunt": 300,
    "reducedUnhaunt": 200,
    "exorcise": 400,
    "easeOut": "cubic-bezier(.2,.8,.2,1)",
    "easeInOut": "cubic-bezier(.45,0,.2,1)",
    "ghostBob": { "px": 4, "ms": 4000 },
    "ghostSway": { "px": 6, "ms": 7000 },
    "marqueePxPerSec": 60,
    "twinkleMs": 2000,
    "hero": {
      "scanIn": 150,
      "lidsClose": [150, 450],
      "line": [450, 600],
      "lidsOpen": [600, 800],
      "wipeStart": 700,
      "roll": [800, 1400],
      "paradeStart": 800,
      "paradeStagger": 100,
      "paradeMs": 1600,
      "paradePhoneStagger": 200,
      "paradePhoneMs": 1200,
      "captionStart": 1500,
      "captionPhoneStart": 2000,
      "fxOut": [1600, 1900],
      "riseStart": 1700,
      "riseStagger": 250,
      "riseMs": 400,
      "risePx": 48,
      "tagDelay": 200,
      "tagMs": 200,
      "hud": 1900,
      "odometer": [2200, 2800],
      "vampires": 2300,
      "markers": 2800
    }
  }
}
```
