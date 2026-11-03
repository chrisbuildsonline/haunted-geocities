# Requirements: Costume Renderer (R4)

## Overview

This spec covers the **costume renderer**: the visual costume that draws the 1998 GeoCities crypt overlay inside the existing closed Shadow DOM host from `src/content/overlay.ts`. It renders the static structural layers — gutter starfield, neighborhood bar + marquee bands, bottom HUD with Hide/Show, hit-counter odometer, and web ring — plus the Webmaster's Ghost haunt-moment animation and the un-haunt reverse. It does **not** render tracker ghosts, vampires, tombstones, or dark-pattern curse badges; those are later specs that render sprites and markers into the layers established here.

The renderer builds every layer from the `## Tokens` JSON in `design/DESIGN.md`. Colours are web-safe only, fonts are Comic Sans MS and Times New Roman, and every pixel-art asset is original. The costume lives entirely inside the shadow root; the only document-level change is the body-padding adopted stylesheet, which is removed on un-haunt so the page returns byte-identical to its pre-haunt state.

## EARS Acceptance Criteria

### Overlay Structure

1. The costume renderer shall render all layers inside the closed Shadow DOM root returned by `haunt()` from `src/content/overlay.ts`, never touching any page DOM node.
2. The costume shall establish layers with the z-index order: starfield (1), lanes (2), markers (3), top bands (4), HUD (5), cards (6), haunt-moment FX (7), matching `design/DESIGN.md`.
3. The only document-level change outside the shadow root shall be one `CSSStyleSheet` appended to `document.adoptedStyleSheets` holding body `padding-top` and `padding-bottom`; no page `<style>` or `<link>` element shall be modified.
4. The adopted body-padding stylesheet shall set `padding-top` to the page's original computed value plus 48px, and `padding-bottom` to the original value plus HUD height + 16px + `--hg-lift`.
5. The body-padding values shall be recomputed when the HUD wraps (below 400px viewport width) and when the HUD lift changes.
6. Un-haunt shall remove the shadow host and the adopted body-padding stylesheet together, so body padding changes in one reflow.

### Starfield

7. The renderer shall paint a 64×64 starfield tile to a canvas with ground `#000033`, six single `#ffffff` pixels, two `#ffff66` 2×2 stars, and one 5×5 `#ffffcc` 4-point twinkle.
8. The starfield tile shall be used as a tiled CSS `background-image` at opacity 0.92 in the gutters — everything left and right of the content column — never over the content column itself.
9. A 16px edge of the starfield toward the content column shall use a 2×2 checker dither (no gradients).
10. The content column shall start from the bounding box of `main` or `article`; if neither exists, from the widest block holding more than 50% of the page's text.
11. The content column shall be widened to cover every text-node rect.
12. When no gutter is 64px or wider (narrow pages), the starfield shall appear only inside the top bands and the HUD, and the page body shall remain fully visible.

### Top Bands: Neighborhood Bar + Marquee

13. The renderer shall render a 24px neighborhood bar with `#330066` ground, Times New Roman 13px, `#ffffcc` text.
14. The neighborhood bar shall display `You are in: <Neighborhood>` on the left side, where the neighborhood is a deterministic placeholder string assigned per host.
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
50. Audio shall be muted by default; if the user has turned sound on, the wipe shall play a 900ms band-passed noise whoosh synced to 200–1100ms. Audio is out of scope for this spec's tests.

### Un-haunt (Reverse)

51. Un-haunt shall be an 1100ms reverse sequence: markers fade out (0–200ms), sprites sink 16px and fade (200–500ms), HUD slides down (300–600ms), then the Webmaster's Ghost crosses right → left (500–1100ms) with the clip shrinking behind it.
52. At 1100ms, the shadow host and the adopted body-padding stylesheet shall be removed together, so the body padding changes in one reflow.
53. After un-haunt, page markup shall be byte-identical to its pre-haunt state.

### Reduced Motion

54. When `prefers-reduced-motion: reduce` is active, the haunt moment shall be replaced by a 300ms linear cross-fade of the whole overlay root opacity 0 → 1, with the odometer showing its final value and the marquee static.
55. When `prefers-reduced-motion: reduce` is active, un-haunt shall be a 200ms opacity fade followed by removal.
56. The renderer shall read `prefers-reduced-motion` live through a `matchMedia` change listener and apply `animation: none` to every costume layer when reduced motion is active.
57. Under reduced motion, transitions shall be limited to opacity, 200ms or less.
58. Under reduced motion, the marquee shall be static, showing its first line truncated with an ellipsis; lines advance only on Hide/Show.
59. Under reduced motion, twinkles shall be off and the under-construction sign shall show frame 1.

### Colour Tokens

60. Every costume colour shall come from the `## Tokens` JSON in `design/DESIGN.md` — the `costume.palette` object and `costume.hemTints` array. No hard-coded colour outside these tokens shall appear in the costume CSS.
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
