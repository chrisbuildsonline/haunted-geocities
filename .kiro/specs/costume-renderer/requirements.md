# Requirements: Costume Renderer (R4)

## Overview

This spec covers the **costume renderer**: the visual costume that draws the 1998 GeoCities crypt overlay inside the existing closed Shadow DOM host from `src/content/overlay.ts`. It renders the static structural layers — gutter starfield, neighborhood bar + marquee bands, bottom HUD with Hide/Show, hit-counter odometer, and web ring — plus the Webmaster's Ghost haunt-moment animation and the un-haunt reverse. It does **not** render tracker ghosts, vampires, tombstones, or dark-pattern curse badges; those are later specs that render sprites and markers into the layers established here.

The renderer builds every layer from the `## Tokens` JSON in `design/DESIGN.md`. Colours are web-safe only, fonts are Comic Sans MS and Times New Roman, and every pixel-art asset is original. The costume lives inside the shadow root, plus one document-level change: a single adopted stylesheet (the "page sheet", `addPageSheet` in `body-padding.ts`). The page sheet holds the body padding, the `--hg-lift` variable and the content-column restyle (see "Content Column Costume"). It is removed together with the shadow host on un-haunt, so the page returns byte-identical to its pre-haunt state.

**Design change (judges' request).** The costume must transform the page's content column itself, not only frame it with gutter starfield. Requirements 71-90 ("Content Column Costume") add that. Requirements 2, 3, 4, 8, 12, 52 and 53 were amended so they no longer contradict it. Amended lines are marked `[Amended]`.

## EARS Acceptance Criteria

### Overlay Structure

1. The costume renderer shall render all layers inside the closed Shadow DOM root returned by `haunt()` from `src/content/overlay.ts`, never touching any page DOM node.
2. [Amended] The costume shall establish layers with the z-index order: starfield (1), lanes (2), markers (3), top bands (4), HUD (5), cards (6), haunt-moment FX (7), matching `design/DESIGN.md`. The content-column tint, guestbook frame and full-overlay frame (requirements 71-90) are sub-layers of layer 1, drawn in that order (tint, then frame), so lanes, markers, bands, HUD and cards always sit above them.
3. [Amended] The only document-level change outside the shadow root shall be one `CSSStyleSheet` appended to `document.adoptedStyleSheets` (the page sheet). It holds the `--hg-lift` variable, body `padding-top` and `padding-bottom`, body inline padding in full-overlay mode, and the content-column restyle rules of requirement 71. No page `<style>` or `<link>` element, attribute or inline style shall be modified.
4. The page sheet shall set `padding-top` to the page's original computed value plus 48px, and `padding-bottom` to the original value plus HUD height + 16px + `--hg-lift`.
5. The page-sheet values shall be recomputed when the HUD wraps (below 400px viewport width) and when the HUD lift changes.
6. Un-haunt shall remove the shadow host and the page sheet together, so body padding and the restyle change in one reflow.

### Starfield

7. The renderer shall paint a 64×64 starfield tile to a canvas with ground `#000033`, six single `#ffffff` pixels, two `#ffff66` 2×2 stars, and one 5×5 `#ffffcc` 4-point twinkle.
8. [Amended] The starfield tile shall be used as a tiled CSS `background-image` at opacity 0.92 in the gutters, everything left and right of the content column. The starfield tile shall never be drawn over the content column's text. The only layers allowed over the content column are the parchment tint (requirement 77) and the guestbook frame (requirement 75), both of which leave text readable, and, in full-overlay mode only, the 12px edge frame (requirement 80).
9. A 16px edge of the starfield toward the content column shall use a 2×2 checker dither (no gradients).
10. The content column shall start from the bounding box of `main` or `article`; if neither exists, from the widest block holding more than 50% of the page's text.
11. The content column shall be widened to cover every text-node rect.
12. [Amended] When no gutter is 64px or wider (phones, full-width pages), the renderer shall enter full-overlay mode (requirements 80-81) instead of drawing gutters. The starfield shall then appear inside the top bands, the HUD and the 12px edge frame, and nowhere else. The page body shall remain fully visible and clickable.

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

32. The hit counter shall display a label `Souls counted:` and a 6-digit odometer.
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
