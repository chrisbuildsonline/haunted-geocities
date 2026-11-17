# Requirements: Costume Renderer (R4)

## Overview

This spec covers the **costume renderer**: the visual costume that draws the 1998 GeoCities crypt overlay inside the existing closed Shadow DOM host from `src/content/overlay.ts`. It renders the static structural layers — gutter starfield, neighborhood bar + marquee bands, bottom HUD with Hide/Show, hit-counter odometer, and web ring — plus the Webmaster's Ghost haunt-moment animation and the un-haunt reverse. It does **not** render tracker ghosts, vampires, tombstones, or dark-pattern curse badges; those are later specs that render sprites and markers into the layers established here.

The renderer builds every layer from the `## Tokens` JSON in `design/DESIGN.md`. Colours are web-safe only, fonts are Comic Sans MS and Times New Roman, and every pixel-art asset is original. The costume lives inside the shadow root, plus one document-level change: a single adopted stylesheet (the "page sheet", `addPageSheet` in `body-padding.ts`). The page sheet holds the body padding, the `--hg-lift` variable and the content-column restyle (see "Content Column Costume"). It is removed together with the shadow host on un-haunt, so the page returns byte-identical to its pre-haunt state.

**Docked graveyard.** Requirements 91-113 add a strip above the HUD that shows ghosts and vampires in full-overlay mode, where there are no gutter lanes, and make the odometer label say plainly what it counts. Requirements 4, 12 and 32 were amended for it and are marked `[Amended]`.

**Design change (judges' request).** The costume must transform the page's content column itself, not only frame it with gutter starfield. Requirements 71-90 ("Content Column Costume") add that. Requirements 2, 3, 4, 8, 12, 52 and 53 were amended so they no longer contradict it. Amended lines are marked `[Amended]`.

## EARS Acceptance Criteria

### Overlay Structure

1. The costume renderer shall render all layers inside the closed Shadow DOM root returned by `haunt()` from `src/content/overlay.ts`, never touching any page DOM node.
2. [Amended] The costume shall establish layers with the z-index order: starfield (1), lanes (2), markers (3), top bands (4), HUD (5), cards (6), haunt-moment FX (7), matching `design/DESIGN.md`. The content-column tint, guestbook frame and full-overlay frame (requirements 71-90) are sub-layers of layer 1, drawn in that order (tint, then frame), so lanes, markers, bands, HUD and cards always sit above them.
3. [Amended] The only document-level change outside the shadow root shall be one `CSSStyleSheet` appended to `document.adoptedStyleSheets` (the page sheet). It holds the `--hg-lift` variable, body `padding-top` and `padding-bottom`, body inline padding in full-overlay mode, and the content-column restyle rules of requirement 71. No page `<style>` or `<link>` element, attribute or inline style shall be modified.
4. [Amended] The page sheet shall set `padding-top` to the page's original computed value plus 48px, and `padding-bottom` to the original value plus HUD height + 16px + `--hg-lift`, plus the graveyard strip's height + 4px while the strip is drawn (requirement 94).
5. The page-sheet values shall be recomputed when the HUD wraps (below 400px viewport width) and when the HUD lift changes.
6. Un-haunt shall remove the shadow host and the page sheet together, so body padding and the restyle change in one reflow.

### Starfield

7. The renderer shall paint a 64×64 starfield tile to a canvas with ground `#000033`, six single `#ffffff` pixels, two `#ffff66` 2×2 stars, and one 5×5 `#ffffcc` 4-point twinkle.
8. [Amended] The starfield tile shall be used as a tiled CSS `background-image` at opacity 0.92 in the gutters, everything left and right of the content column. The starfield tile shall never be drawn over the content column's text. The only layers allowed over the content column are the parchment tint (requirement 77) and the guestbook frame (requirement 75), both of which leave text readable, and, in full-overlay mode only, the 12px edge frame (requirement 80).
9. A 16px edge of the starfield toward the content column shall use a 2×2 checker dither (no gradients).
10. The content column shall start from the bounding box of `main` or `article`; if neither exists, from the widest block holding more than 50% of the page's text.
11. The content column shall be widened to cover every text-node rect plus 12px on each side, so no text sits closer than 16px to the guestbook frame.
12. [Amended] When no gutter is 64px or wider (phones, full-width pages), the renderer shall enter full-overlay mode (requirements 80-81) instead of drawing gutters. The starfield shall then appear inside the top bands, the HUD and the 12px edge frame, and nowhere else, except the graveyard strip (requirements 91-113), which holds the company sprites. The page body shall remain fully visible and clickable.

### Top Bands: Neighborhood Bar + Marquee

13. The renderer shall render a 24px neighborhood bar with `#330066` ground, Times New Roman 13px, `#ffffcc` text.
14. The neighborhood bar shall display `You are in: <Neighborhood>` on the left side, where the neighborhood is the per-host address from the neighborhoods spec (`.kiro/specs/neighborhoods/`), not a placeholder.
15. The neighborhood bar shall display the 48×24 under-construction sign on the right side.
16. The under-construction sign shall be static, or 2 frames at 1 Hz with motion allowed.
17. The renderer shall render a 24px marquee band below the neighborhood bar with `#000033` ground, Comic Sans MS 14px, `#66ff99` text.
18. The marquee shall cycle lines via a CSS `translateX` keyframe animation, never using the `<marquee>` element.
19. The marquee speed shall be 60px/s linear.
20. The marquee shall pause while the tab is hidden and restart from the right edge.
21. The top bands shall sit at `top: 0`, or just below page UI that is fixed or sticky at y=0 (sampled via `elementsFromPoint` along the top row).

### HUD

22. The HUD shall be fixed at bottom, `left/right: 8px`, `bottom: calc(8px + var(--hg-lift))`, max-width 720px, centred, min-height 40px.
23. `--hg-lift` shall be the height of page UI fixed to the bottom (cookie bars, chat buttons), sampled with `elementsFromPoint` along the bottom 80px and re-checked on resize and mutation.
24. The HUD frame shall use `#000033` ground with the starfield tile at 30%, a 2px bevel (`#9999cc` top-left, `#333366` bottom-right), a 1px `#000000` outer line, and a hard shadow `4px 4px 0 #000000`.
25. The HUD controls in DOM order shall be: `[Hide]` Win95 button, then counts (16px icon + Comic Sans 13px `#ffffcc` each), then the hit counter, then the web ring.
26. The `[Hide]` button shall be a Win95-style button (face `#cccccc`, text `#000000`, 2px bevel `#ffffff`/`#666666`, 24px tall, 8px side padding).
27. At viewport width 400px or less, the HUD insets shall drop to 4px and the strip shall use `flex-wrap: wrap; row-gap: 4px`, with row 1 holding Hide + counts and row 2 holding the hit counter + web ring, never exceeding 2 rows (88px) or causing horizontal scroll.

### Hide / Show

28. When Hide is activated, every costume layer shall fade out over 200ms and a 40×40 `[Show]` tab shall appear bottom-right with the ghost icon.
29. The Show tab shall restore all costume layers with a 200ms fade-in.
30. Haunt state shall be preserved across Hide/Show — the overlay host and adopted stylesheet remain; only costume-layer visibility changes.
31. The Show tab shall be keyboard reachable with a visible focus indicator.

### Hit Counter (Odometer)

32. [Amended] The hit counter shall display a label `Souls counted` with a sub-label (requirements 104-106) and a 6-digit odometer.
33. Each odometer cell shall be 10×16px, `#000000` ground, with `#66ff99` pixel digits from an original 5×7 font.
34. The odometer value shall be the total tracker requests seen (zero in this spec, since trackers are out of scope).
35. During the haunt moment, the odometer digits shall roll from `000000` to the count as continuous `translateY` strips, right digit first, over 600ms.

### Web Ring

36. The web ring shall display `« prev | Haunted WebRing | next »` with the prev/next links focusable.
37. The prev/next links shall move focus to the previous/next sprite on the page (no sprites in this spec, so they are present but inert).

### Empty State

38. When nothing is found (all counts zero), the counts area shall be replaced by the text `No ghosts here. Suspiciously clean.` in Comic Sans 13px `#ffffcc`.

### Haunt Moment

39. The haunt moment shall be a 2500ms sequence driven entirely by the Web Animations API on transform, opacity, and clip-path, all inside the shadow root.
40. At 0–200ms, a radial `#000033` vignette shall fade in from transparent centre to 40% at edges, easing `cubic-bezier(.2,.8,.2,1)`.
41. At 200–1100ms, a 96×96 Webmaster's Ghost sprite shall travel `translateX(-96px → 100vw)` at mid-viewport height with a ±6px vertical bob (single 900ms cycle), easing `cubic-bezier(.45,0,.2,1)`.
42. During 200–1100ms, the gutter starfield and top bands shall reveal behind the ghost via a synchronized `clip-path: inset(0 calc(100% - X) 0 0)`.
43. A 32px dither strip of 2×2 `#66ff99`/transparent checker shall trail the ghost as the ectoplasm seam.
44. At 1100–1400ms, the ghost shall leave the right edge, the vignette shall fade 40% → 0, and the marquee shall start scrolling, easing `cubic-bezier(.2,.8,.2,1)`.
45. At 1400–2000ms, the HUD shall slide up from `translateY(100%)` to its lifted position, easing `cubic-bezier(.2,.8,.2,1)`.
46. At 1700–2300ms, the odometer digits shall roll from `000000` to the count as continuous `translateY` strips, right digit first, over 600ms, easing `cubic-bezier(.2,.8,.2,1)`.
47. At 2300–2500ms, any markers (none in this spec) shall fade in over 200ms linear.
48. The FX layer (vignette div, ghost sprite, dither strip) shall be removed at 2500ms.
49. Every change in the haunt moment shall be monotonic; no value toggles back. The only periodic motion is the 900ms bob (1.1 Hz, position only). Nothing strobes above 3 Hz.
50. Audio shall be muted by default; if the user has turned sound on, the 900ms band-passed noise whoosh that goes with the wipe (200–1100ms) shall be played by the popup on the Haunt click, not by the content script, and the haunt moment itself shall make no sound. Audio is specified in `.kiro/specs/sound-effects/` (R9) and is out of scope for this spec's tests.

### Un-haunt (Reverse)

51. Un-haunt shall be an 1100ms reverse sequence: markers fade out (0–200ms), sprites sink 16px and fade (200–500ms), HUD slides down (300–600ms), then the Webmaster's Ghost crosses right → left (500–1100ms) with the clip shrinking behind it.
52. [Amended] At 1100ms, the shadow host and the page sheet (padding and restyle) shall be removed together, so the body padding and the page's fonts and link colours change in one reflow.
53. After un-haunt, page markup shall be byte-identical to its pre-haunt state, and `document.adoptedStyleSheets` shall hold exactly the sheets it held before haunt, in the same order (see requirement 87).

### Reduced Motion

54. When `prefers-reduced-motion: reduce` is active, the haunt moment shall be replaced by a 300ms linear cross-fade of the whole overlay root opacity 0 → 1, with the odometer showing its final value and the marquee static.
55. When `prefers-reduced-motion: reduce` is active, un-haunt shall be a 200ms opacity fade followed by removal.
56. The renderer shall read `prefers-reduced-motion` live through a `matchMedia` change listener and apply `animation: none` to every costume layer when reduced motion is active.
57. Under reduced motion, transitions shall be limited to opacity, 200ms or less.
58. Under reduced motion, the marquee shall be static, showing its first line truncated with an ellipsis; lines advance only on Hide/Show.
59. Under reduced motion, twinkles shall be off and the under-construction sign shall show frame 1.

### Colour Tokens

60. [Amended] Every costume colour shall come from the `## Tokens` JSON in `design/DESIGN.md` (the `costume.palette` object, the `costume.hemTints` array and the `costume.page` object added by requirement 89). No hard-coded colour outside these tokens shall appear in the costume CSS.
61. All costume palette colours shall be web-safe (each channel value in `{00, 33, 66, 99, cc, ff}`).

### Accessibility

62. All costume interactive elements (HUD buttons, Show tab, web-ring links) shall be keyboard reachable with visible focus indicators.
63. The costume focus ring shall be `outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000`.
64. Win95 buttons shall also show the classic 1px dotted inner rectangle.
65. HUD and overlay text shall meet 4.5:1 contrast ratio against its background.
66. No flashing, blinking, or strobing faster than 3 Hz shall occur anywhere in the costume.

### Non-Destructive DOM

67. The renderer shall never modify any page DOM node outside the shadow host.
68. Page scripts shall never be edited, blocked, or reordered.
69. Never change form behaviour — no adding, removing, or modifying form elements, handlers, or submission logic.
70. After un-haunt, `document.documentElement.outerHTML` shall be byte-identical to its pre-haunt value.

### Content Column Costume

These requirements make the costume transform the page's content column itself. "Content column" is the rect from `computeContentColumn` (requirements 10-11). "Light page" and "dark page" are defined by requirement 73. All colours below are web-safe and are added to the tokens by requirement 89.

71. The page sheet (the existing single adopted `CSSStyleSheet`, which stays the only document-level change) shall, while the page is haunted, restyle the page so that body text is set in `Times New Roman`, `h1`, `h2` and `h3` are set in `Comic Sans MS`, unvisited links are `#0000ff` and underlined, visited links are `#800080`, and hovered links are `#ff0000`.
72. Where the page is a dark page, the page sheet shall instead set unvisited links to `#66ccff` and visited links to `#cc99ff`; links shall stay underlined, and hovered links shall follow requirement 71.
73. The renderer shall classify the page as dark when the relative luminance (WCAG 2.x definition) of the computed background colour of `body` is below 0.4, taking the background of `html` when the body background is transparent and white when both are transparent; otherwise the page is light. The classification shall be recomputed on viewport resize, on `prefers-color-scheme` change, and when a read-only `MutationObserver` sees `class` or `style` attribute changes on `html` or `body`.
74. Every text and link colour the page sheet sets shall have a WCAG contrast ratio of at least 4.5:1 against the page's effective background (the page background multiplied by `#ffffcc` where the tint of requirement 77 is drawn). If a colour named in requirement 71 or 72 falls below 4.5:1 against that background, the renderer shall use the nearest web-safe colour (by RGB distance) that reaches 4.5:1 instead. Known case: hover `#ff0000` is 4.0:1 on `#ffffff` and 3.9:1 on `#ffffcc`, so on light pages hover resolves to `#cc0000` (5.9:1 and 5.7:1).
75. While the page is haunted, the renderer shall draw a guestbook frame in the shadow root around the content column rect: a 6px ridge bevel with `#9999cc` on the top and left edges and `#333366` on the bottom and right edges, a 1px `#000000` outer line, and a `#6633cc` glow.
76. The guestbook frame shall track the content column rect through page scroll and viewport resize, shall be clipped to the viewport rather than moving the column, and shall have `pointer-events: none`.
77. Where the page is a light page, the renderer shall draw a parchment tint layer in the shadow root over the content column rect, with `background: #ffffcc` and `mix-blend-mode: multiply`, so that white reads as old paper and dark text keeps its contrast. The tint shall have `pointer-events: none` and shall track scroll and resize like the frame.
78. Where the page is a dark page, the renderer shall not draw the tint layer.
79. If the tint layer does not multiply with the page (browser stacking-context isolation of the overlay host can prevent it), the renderer shall not ship a normal-blend `#ffffcc` overlay. The spike in task 17.1 shall decide the mechanism, and an e2e test shall prove that a `#ffffff` page pixel inside the column renders as `#ffffcc` while a `#000000` text pixel stays `#000000`.
80. Where no gutter is 64px or wider (`gutterWidths` returns null), the renderer shall draw a 12px starfield frame fixed inside the viewport edges, using the starfield tile, with its inner 4px edge dithered as a 2×2 checker (no gradients). The frame shall have `pointer-events: none`.
81. In full-overlay mode, the tint (on light pages) and the restyle of requirements 71-74 shall still apply, and the guestbook frame shall not be drawn (the 12px edge frame takes its place). The page sheet shall add body `padding-left` and `padding-right` equal to the original value plus 12px so no text sits under the edge frame. The page body shall stay fully readable and clickable: `elementFromPoint` at the viewport centre and at every link, button and form control of the page shall return the page's own element, never the costume host.
82. After the page sheet is applied, and whenever the restyle changes text metrics (fonts load, viewport resize), the renderer shall recompute the content column, and gutters, lanes, frame and tint shall use the recomputed rect.
83. When `prefers-reduced-motion: reduce` is active, none of the layers in this section (restyle, guestbook frame, parchment tint, 12px edge frame) shall animate or transition; the link hover colour shall change instantly.
84. The renderer shall apply requirement 83 live through the existing `matchMedia` change listener (requirement 56), so toggling the preference while haunted takes effect without a reload.
85. When Hide is activated, the frame, tint and edge frame shall fade out with the other costume layers (requirement 28). The page sheet, including the restyle, shall remain applied while hidden, because Hide preserves haunt state (requirement 30).
86. On un-haunt, the shadow host (with the frame, tint and edge frame in it) and the page sheet (with the restyle) shall be removed together in one reflow.
87. After un-haunt, `document.documentElement.outerHTML` shall be byte-identical to its pre-haunt value, and `document.adoptedStyleSheets` shall equal its pre-haunt contents in the same order.
88. The restyle shall be expressed only as rules in the page sheet. The renderer shall not add, remove or change any page element, attribute, class, inline style or event handler to apply it.
89. The colours of requirements 71-80 shall be added to `design/DESIGN.md` under `## Tokens` as `costume.page` (links `#0000ff`, visited `#800080`, hover `#ff0000`, hover fallback `#cc0000`, dark links `#66ccff`, dark visited `#cc99ff`, parchment `#ffffcc`, frame `#9999cc`, `#333366`, `#000000`, glow `#6633cc`), each web-safe, and mirrored in `tokens.ts`.
90. Every layer in this section shall have `pointer-events: none` and `aria-hidden="true"`, and shall not take focus.


### Docked Graveyard (no gutters)

Today `gutterWidths` returns null on 375px pages and full-width pages (full-overlay mode, requirements 80-81), `planSlots` returns no slots, and ghosts and vampires are not shown at all. Only the HUD odometer counts them. These requirements add a docked graveyard strip that shows them in that mode. "Company sprite" means a ghost or vampire, one per tracker company, as in the lanes. Lane mode (a gutter of 64px or wider) is unchanged and shows no strip.

**Strip and order**

91. Where the renderer is in full-overlay mode and at least one tracker company has been found, the renderer shall draw a graveyard strip in the shadow root, fixed at the bottom of the viewport directly above the HUD (4px between the strip's bottom edge and the HUD's top edge), with the same left and right insets, max-width and centring as the HUD.
92. The graveyard strip shall hold one 48px-wide company sprite per company, in the same order as the lanes: ghosts by request count (most first, then by name), then vampires by name.
93. Where the sprites do not fit the strip's width, the strip shall scroll horizontally (`overflow-x: auto`, no vertical scroll, no wrapping), a focused sprite shall scroll into view, and the strip shall never cause horizontal scroll of the page.
94. The graveyard strip shall not cover page text more than the HUD already does: the page sheet shall add the strip's height plus its 4px gap to body `padding-bottom` (extending requirement 4), and shall remove it again when the strip is hidden or removed.
95. The graveyard strip shall hide and show together with the HUD: when Hide is activated it shall fade out with the other costume layers (requirement 28) and take no pointer events, and the Show tab (requirement 29) shall restore it. The strip's position shall follow `--hg-lift` and the HUD's height, including the HUD's two-row wrap at 400px or less (requirement 27).
96. When the renderer leaves full-overlay mode (for instance the viewport is widened until a gutter of 64px exists), the strip shall be removed and the ghosts and vampires shall return to the lanes. The reverse also applies. Company sprites shall never be shown in the lanes and the strip at the same time.

**Sprites as buttons**

97. Each company sprite in the strip shall be a `<button type="button">` that is keyboard focusable, with the costume focus ring (requirement 63), and that opens the same card as the company's lane ghost (same `onOpen(company, opener)` path, same card content, same exorcise action, same focus return to the sprite on close) on click, `Enter` or `Space`.
98. Each company sprite shall have an `aria-label` naming the company and its request count in the same words as the lane ghost's label: `<company>, tracker ghost, seen <n> time(s)` for a ghost, and `<company>, vampire, caught doing <what>` or `<company>, vampire, known to fingerprint` for a vampire.
99. A company that is exorcised shall be shown the same way as in the lanes: the `exorcised` state class and the `EXORCISED` stamp on its sprite, and the card shall show its exorcised state. Un-exorcising (from the card or the popup) shall remove both.
100. Each company's sprite element shall be reused across updates, so a focused sprite keeps focus when counts, order or exorcise state change, as lane ghosts do.

**Label and empty state**

101. The graveyard strip shall have a label bar reading `Graveyard`, in the Win95 HUD idiom: Comic Sans MS 11px `#ffffcc` text on the HUD's `#000033` ground, with the HUD's 2px bevel (`#9999cc` top-left, `#333366` bottom-right), the 1px `#000000` outer line and the hard shadow `4px 4px 0 #000000`.
102. The graveyard strip shall be a `role="region"` landmark with `aria-label="Graveyard of trackers"`, and its sprites shall be in DOM order, which is the visual order.
103. Where the renderer is in full-overlay mode and no tracker company has been found, the renderer shall show the strip's empty state: the label bar and the text `No graves yet.` in Comic Sans MS 13px `#ffffcc`, and no sprites. (Open choice, see design.md: the empty strip may stay hidden instead. If it does, requirements 91 and 94 apply to it as zero height.)

**HUD odometer label**

104. The HUD odometer label shall say what it counts: the visible label shall read `Souls counted` with a sub-label `tracker requests blocked or seen`, and the hit-counter element shall have a `title` of `tracker requests blocked or seen`.
105. The hit counter's `aria-label` shall say the same: `Souls counted: <six digits>, tracker requests blocked or seen`. This applies in every mode, not only full-overlay mode.
106. The sub-label shall meet the 4.5:1 contrast of requirement 65 and be at least 11px (`LAYOUT.minText`). It shall not push the HUD over its two-row limit at 400px or less (requirement 27); where it does not fit, the sub-label may be dropped visually (the `title` and `aria-label` stay).

**Motion, tokens, z-order, un-haunt**

107. When `prefers-reduced-motion: reduce` is active, company sprites in the strip shall not float, sway or bob (`animation: none`), shall not rise into place when they arrive, and the strip shall scroll without smooth-scroll animation. Toggling the preference while haunted shall take effect live (requirement 56).
108. Where reduced motion is not active, company sprites in the strip may use the lane float animation, which shall stay under the 3 Hz ceiling (requirement 66). The haunt moment shall not animate the strip beyond the HUD's slide up (requirement 45): the strip slides up with the HUD.
109. Every colour, size and font in the strip shall come from `tokens.ts` (`PALETTE`, `SPRITES`, `LAYOUT`, `HARD_SHADOW`, `FOCUS_RING`), with no hard-coded colour in the costume CSS (requirement 60). Any new layout value shall be added to `LAYOUT` and to `design/DESIGN.md`.
110. The graveyard strip shall sit at z-index 5 with the HUD, above the lanes, markers and top bands (2, 3, 4) and below the cards (6) and the haunt-moment FX (7), so an open card is never covered by the strip.
111. The strip shall take pointer events (`pointer-events: auto`) only on its own box. The rest of the viewport shall stay clickable, and `elementFromPoint` on every page link, button and form control outside the strip and the HUD shall still return the page's own element (requirement 81).
112. Un-haunt shall remove the strip with the shadow host in the same step (requirements 52 and 86), including its listeners and the extra `padding-bottom` in the page sheet. After un-haunt, `document.documentElement.outerHTML` and `document.adoptedStyleSheets` shall equal their pre-haunt values (requirements 53, 70 and 87).
113. The strip shall make no change to any page node, script or form (requirements 67-69), and the ghost-card, exorcise and `TRACKER_UPDATE` message flows shall be unchanged.


### Hero Haunt Moment

The jury said the current haunt reads as "a calm column with three small sprites". These requirements replace the haunt-moment timeline of requirements 39-48 with a 3000ms sequence in which the page visibly dies into 1998 (a CRT switching off) and the tracker ghosts then rise one by one, each with its company name tag, so the moment reads as spectacle in a 3-second screen clip. Requirements 39-48 are not edited or renumbered; where their timings differ from requirements 114-135, **requirements 114-135 apply**. Requirements 49-50 and 54 still hold. The un-haunt (requirements 51-53), the reduced-motion un-haunt (55) and the content-column requirements (71-90) are unchanged. "FX root" means the `#fx` element in the shadow root.

**Timeline**

114. The haunt moment shall be a sequence of about 3000ms, driven only by the Web Animations API on `transform`, `opacity` and `clip-path`, with every element it adds inside the closed shadow root. It shall not modify any page node (requirements 67-70).
115. The sequence shall be: CRT death 0-800ms, Webmaster's Ghost wipe 700-1600ms, scanlines and vignette fade out 1600-1900ms, ghost rise from 1700ms, then the vampires, HUD slide, odometer roll and markers in the order of requirement 126, ending by 3000ms for up to four tracker ghost companies (requirement 125 gives the length for more).

**CRT death (0-800ms)**

116. At 0-150ms a full-viewport scanline layer in the FX root shall fade in (`opacity` 0 → 1). Its pattern shall be a repeating 1px `#000033` line every 3px (1px line, 2px clear), and it shall stay at full opacity until the fade-out of requirement 121.
117. At 150-450ms two black (`#000000`) lids shall slide in with `transform`, one from the top edge and one from the bottom edge, each 50% of the viewport height, and meet at mid-height at 450ms, like a tube switching off. The lids shall cover the page, the scanlines and the page-sheet layers while closed.
118. At 450ms, when the lids meet, a 2px `#ccffff` phosphor line shall appear across the full viewport width at mid-height. From 450 to 600ms it shall shrink horizontally (`scaleX` 1 → 0) to a dot, and it shall be gone at 600ms.
119. At 600-800ms the lids shall slide open again (`transform` back to their off-screen positions), uncovering the page.
120. The CRT death shall be one dark-then-light change only. Within each of its phases (scanlines in, lids closing, line shrinking, lids opening) every property shall change in one direction only, nothing shall toggle back, no element shall blink, and no change shall repeat above 3 Hz (extends requirements 49 and 66).

**Wipe, scanlines and vignette**

121. The Webmaster's Ghost wipe of requirements 41-43 shall run at 700-1600ms (same 900ms duration, same easing, same ghost, same 900ms bob and dither strip), and the same `clip-path` reveal shall drive the starfield (or edge frame), the parchment tint, the guestbook frame and the top bands. The marquee shall start scrolling at 1600ms, when the ghost leaves the right edge.
122. The scanlines and the radial `#000033` vignette (requirement 40) shall both be at full opacity by 200ms, and shall fade out to 0 at 1600-1900ms, so both are gone by 1900ms.
123. The restyle and the page padding shall keep landing at t=0 in one reflow, as today (see `design/DESIGN.md`, "Content column costume"). Its effect is hidden by the lids from 450 to 600ms and shown by the wipe.

**Ghosts rise with name tags**

124. From 1700ms, each tracker ghost shall rise from `translateY(48px)` with `opacity` 0 into its slot over 400ms (easing `cubic-bezier(.2,.8,.2,1)`), 250ms after the previous one, in lane order (requirement 92), so ghost *i* starts at 1700 + 250 × *i* ms. For the first 8 ghosts *i* is the ghost's index. The 9th ghost onward start with the 8th, at 3450ms.
125. The haunt moment shall end, and the FX root shall be removed, at 3000ms or when the last ghost's tag pop has finished, whichever is later. With *n* ghost companies (up to 8) the last tag pop ends at 1700 + 250 × (*n* - 1) + 400ms, so *n* ≤ 4 ends at 3000ms and 8 ghosts end at 3850ms. The ghost rise is the only part of the sequence whose length depends on the page.
126. Vampires, the HUD slide, the odometer roll and the markers shall keep their order from requirements 44-47 and shift later: vampires fade in (and the caught ones swell once) at 2300-2900ms, the HUD (and the graveyard strip with it) slides up at 1900-2200ms, the odometer rolls at 2200-2800ms (600ms, right digit first), and markers fade in at 2800-3000ms.
127. Each ghost's name tag (the existing `.tag` holding the company name) shall be hidden until its ghost starts rising and shall pop in 200ms after its ghost starts rising: `opacity` 0 → 1 and `transform: scale(0.6)` → `scale(1)` over 200ms, in one monotonic step, with the tag's centre as its origin. The tag shall never be visible while its ghost is not.
128. Ghosts that arrive after the haunt moment (a tracker found later) shall keep the current 300ms, 16px `riseIn` and show their tags at once. The 48px rise and the tag pop belong to the haunt moment only.
129. Company sprites in the graveyard strip (requirements 91-113) shall not rise (requirement 108 stays in force); under the haunt moment they slide up with the HUD at the time of requirement 126, and their name labels are visible at once.

**Phase attribute and clean-up**

130. The FX root shall carry a `data-phase` attribute that moves `crt` (0-700ms), then `wipe` (700-1700ms), then `rise` (from 1700ms until the end), in that order and never back, so tests can observe the phases. The phases shall be driven by animation timing (finished animations), not by a chain of `setTimeout` calls.
131. The FX root (scanlines, lids, phosphor line, vignette, ghost, dither strip) shall be removed at the end of the sequence, with its animations. No finished animation shall stay on a page element.

**Era rules**

132. Every colour in the new layers shall be web-safe and come from the tokens of `design/DESIGN.md` (requirements 60-61): `#000033` scanlines and vignette, `#000000` lids, `#ccffff` phosphor line. The new colours shall be added to `costume.palette` or the haunt tokens in `DESIGN.md` and mirrored in `tokens.ts`. No blurred modern shadows (`box-shadow` or `filter` blur) shall be used in the new layers, and nothing a 1998 page would not have had (no gradients beyond the existing vignette, no glow, no particles) shall be added.

**Reduced motion**

133. When `prefers-reduced-motion: reduce` is active, the haunt moment shall skip straight to its end state through the 300ms linear cross-fade of requirement 54. There shall be no FX root, no scanlines, no lids, no phosphor line, no wipe, no ghost rise and no stagger, and no `data-phase`. Every ghost name tag shall be visible at once, the odometer shall show its final value and the marquee shall be static.

**Un-haunt, non-destructive**

134. Un-haunt shall be unchanged (requirements 51-53, 55, 86-87). After the new haunt moment, with it finished or cut short, un-haunt shall restore `document.documentElement.outerHTML` byte for byte and `document.adoptedStyleSheets` to the same sheets in the same order. Un-haunt during the haunt moment shall finish the sequence at once, remove the FX root, and then run the un-haunt as usual.

**Tests, fixture and docs**

135. The moment shall be proved by: unit tests in `test/costume/haunt-moment.test.ts` (phase order, lid and phosphor timings, the 250ms stagger, the tag pop 200ms after the rise, flash safety, the reduced-motion path with no FX); a Playwright test `e2e/hero-haunt.spec.ts` on a new original news-style fixture `fixtures/news.html` (original content, no third-party trademarks, loading the tracker fixtures so at least three ghost companies appear); a README GIF `docs/screenshots/haunt.gif` made by `e2e/readme.shots.ts` and ffmpeg (at most 2 MB, 6 fps, 560px wide, 128 colours) and referenced in the README "What it does"; and the updated "Haunt moment" section of `design/DESIGN.md`. Docker visual baselines shall be regenerated only if a static shot changes.
