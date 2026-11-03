# Tasks: Costume Renderer (R4)

Implementation checklist for the costume renderer spec. Each task references the requirement numbers it satisfies and names the test that proves it.

Tests live under `test/costume/` (Bun unit tests) and `e2e/` (Playwright end-to-end tests).

## 1. Tokens Module

- [x] 1.1 Create `src/content/costume/tokens.ts` exporting `PALETTE`, `HEM_TINTS`, `FONTS`, `PIXEL`, `SPRITES`, `LAYOUT`, `HARD_SHADOW`, `FOCUS_RING`, `MOTION` — all typed from the DESIGN.md `## Tokens` JSON.
  - Req: 60, 61
  - Test: `test/costume/tokens.test.ts` → `"palette colours are 6-digit web-safe hex"` — every value in `PALETTE` matches `/^#[0-9a-f]{6}$/i` and each channel is in `{00,33,66,99,cc,ff}`.

- [x] 1.2 Verify every costume palette colour is web-safe (channel values in `{00,33,66,99,cc,ff}`).
  - Req: 61
  - Test: `test/costume/tokens.test.ts` → `"hem tints are web-safe"` and `"hard shadow and focus ring reference palette colours"`.

- [x] 1.3 Verify motion token values match DESIGN.md (durations, easings, marquee speed, bob/sway).
  - Req: 39, 49, 19
  - Test: `test/costume/tokens.test.ts` → `"motion durations match DESIGN.md"` — haunt 2500, unhaunt 1100, reducedHaunt 300, reducedUnhaunt 200, marqueePxPerSec 60.

## 2. Starfield

- [x] 2.1 Create `src/content/costume/starfield.ts` with `paintStarTile(doc): string` that draws a 64×64 canvas with ground `#000033`, 6 single `#ffffff` pixels, 2 `#ffff66` 2×2 stars, 1 `#ffffcc` 5×5 4-point twinkle. Returns a data URL.
  - Req: 7
  - Test: `test/costume/starfield.test.ts` → `"tile is 64×64 with #000033 ground and correct pixel counts"`.

- [x] 2.2 Implement `computeContentColumn(doc): { left, right }` — start from `main`/`article` bbox, fall back to widest block >50% text, widen to cover all text-node rects.
  - Req: 10, 11
  - Test: `test/costume/starfield.test.ts` → `"column starts from main bounding box"` and `"column starts from widest text block when no main/article"`.

- [x] 2.3 Implement `createStarfield(root, tileUrl, column): HTMLElement` — left/right gutter divs with the tile as `background-image` at opacity 0.92, `pointer-events: none`, `z-index: 1`.
  - Req: 8
  - Test: `test/costume/starfield.test.ts` → `"gutters rendered outside content column with tile background and opacity 0.92"`.

- [x] 2.4 Add a 16px 2×2 checker dither edge toward the content column on each gutter (no gradients).
  - Req: 9
  - Test: `test/costume/starfield.test.ts` → `"16px dither edge uses 2×2 checker, no gradients"`.

- [x] 2.5 When no gutter is ≥64px wide, do not render gutters — starfield appears only in top bands and HUD.
  - Req: 12
  - Test: `test/costume/starfield.test.ts` → `"narrow page: no gutter divs rendered"`.

## 3. Top Bands: Neighborhood Bar + Marquee

- [ ] 3.1 Create `src/content/costume/bands.ts` with `createBands(root, neighborhood): HTMLElement` returning `#top-bands` at `position: fixed; top: 0; z-index: 4`.
  - Req: 13, 21
  - Test: `test/costume/bands.test.ts` → `"#top-bands is fixed at top:0 with z-index 4"`.

- [x] 3.2 Neighborhood bar: 24px, `#330066` ground, Times New Roman 13px, `#ffffcc` text, `You are in: <Neighborhood>` on left.
  - Req: 13, 14
  - Test: `test/costume/bands.test.ts` → `"neighborhood bar has correct colours, fonts, and 'You are in:' text"`.

- [x] 3.3 Implement `neighborhoodFor(host)` deterministic placeholder (hash to area + `/Vault/` + number).
  - Req: 14
  - Test: `test/costume/bands.test.ts` → `"neighborhoodFor is deterministic per host"`.

- [x] 3.4 Under-construction sign: 48×24 original pixel art on right side of neighborhood bar, 2 frames at 1 Hz with motion or static.
  - Req: 15, 16
  - Test: `test/costume/bands.test.ts` → `"under-construction sign is 48×24 on right side"`.

- [x] 3.5 Marquee: 24px band, `#000033` ground, Comic Sans MS 14px, `#66ff99` text, CSS `translateX` animation at 60px/s. Never `<marquee>`.
  - Req: 17, 18, 19
  - Test: `test/costume/bands.test.ts` → `"marquee uses CSS translateX animation at 60px/s, no <marquee> element"`.

- [x] 3.6 Marquee pauses when `document.hidden` and restarts from the right edge.
  - Req: 20
  - Test: `test/costume/bands.test.ts` → `"marquee pauses on document.hidden"`.

- [x] 3.7 Implement `topOffset(doc)` sampling `elementsFromPoint` along the top row; bands sit just below fixed/sticky UI at y=0.
  - Req: 21
  - Test: `test/costume/bands.test.ts` → `"topOffset returns 0 when no fixed/sticky at y=0"` and `"topOffset returns element bottom when fixed at y=0"`.

## 4. HUD

- [x] 4.1 Create `src/content/costume/hud.ts` with `createHUD(root): HTMLElement` — fixed bottom, `left/right: 8px`, `bottom: calc(8px + var(--hg-lift))`, max-width 720px, centred, min-height 40px, z-index 5.
  - Req: 22
  - Test: `test/costume/hud.test.ts` → `"HUD is fixed at bottom with correct positioning and z-index 5"`.

- [x] 4.2 HUD frame: `#000033` ground with starfield tile at 30%, 2px bevel (`#9999cc`/`#333366`), 1px `#000000` outer line, hard shadow `4px 4px 0 #000000`.
  - Req: 24
  - Test: `test/costume/hud.test.ts` → `"HUD frame has correct ground, bevel, outer line, and hard shadow"`.

- [x] 4.3 HUD controls in DOM order: `[Hide]` Win95 button, then counts (16px icon + Comic Sans 13px `#ffffcc`), then hit counter, then web ring.
  - Req: 25
  - Test: `test/costume/hud.test.ts` → `"HUD controls are in correct DOM order"`.

- [x] 4.4 `[Hide]` button is Win95 style: face `#cccccc`, text `#000000`, 2px bevel `#ffffff`/`#666666`, 24px tall, 8px side padding.
  - Req: 26
  - Test: `test/costume/hud.test.ts` → `"Hide button is Win95 styled"`.

- [x] 4.5 Implement `sampleBottomLift(doc): number` using `elementsFromPoint` along the bottom 80px; `--hg-lift` set as CSS custom property on `:host`.
  - Req: 23
  - Test: `test/costume/hud.test.ts` → `"sampleBottomLift returns 0 with no fixed bottom UI"` and `"returns height of fixed bottom element"`.

- [ ] 4.6 Re-check lift on `resize` and `MutationObserver`.
  - Req: 23
  - Test: `test/costume/hud.test.ts` → `"lift rechecked on resize"`.

- [x] 4.7 At viewport ≤400px: insets drop to 4px, `flex-wrap: wrap; row-gap: 4px`, row 1 = Hide + counts, row 2 = hit counter + web ring, max 2 rows (88px), no horizontal scroll.
  - Req: 27
  - Test: `test/costume/hud.test.ts` → `"HUD wraps below 400px into 2 rows with 4px insets"`.

## 5. Hide / Show

- [x] 5.1 Implement Hide: fade all costume layers to `opacity: 0; pointer-events: none` over 200ms; show 40×40 `#show-tab` bottom-right with ghost icon.
  - Req: 28, 31
  - Test: `test/costume/hide-show.test.ts` → `"Hide fades layers over 200ms and shows 40×40 Show tab bottom-right"`.

- [x] 5.2 Implement Show: restore opacity over 200ms, remove Show tab.
  - Req: 29
  - Test: `test/costume/hide-show.test.ts` → `"Show restores layers over 200ms and removes Show tab"`.

- [x] 5.3 Haunt state preserved: overlay host and adopted stylesheet remain across Hide/Show.
  - Req: 30
  - Test: `test/costume/hide-show.test.ts` → `"haunt state preserved across Hide/Show — host and sheet remain"`.

- [x] 5.4 Show tab is keyboard reachable with visible focus indicator.
  - Req: 31, 62
  - Test: `test/costume/hide-show.test.ts` → `"Show tab is focusable and has focus ring"`.

## 6. Hit Counter (Odometer)

- [x] 6.1 Create `createOdometer(root): HTMLElement` — label `Souls counted:` + 6 cells, each 10×16px, `#000000` ground, `#66ff99` digits from original 5×7 font.
  - Req: 32, 33
  - Test: `test/costume/odometer.test.ts` → `"odometer has label 'Souls counted:' and 6 cells of 10×16"`.

- [x] 6.2 Odometer value is 0 in this spec (total tracker requests seen).
  - Req: 34
  - Test: `test/costume/odometer.test.ts` → `"odometer value is 000000"`.

- [x] 6.3 Odometer roll animation: digits roll as continuous `translateY` strips, right digit first, 600ms (triggered during haunt moment).
  - Req: 35, 46
  - Test: `test/costume/odometer.test.ts` → `"roll animation uses translateY, right digit first, 600ms"`.

## 7. Web Ring

- [x] 7.1 Create `createWebRing(root): HTMLElement` — `« prev | Haunted WebRing | next »`, prev/next are `<button>` elements, keyboard reachable.
  - Req: 36, 62
  - Test: `test/costume/webring.test.ts` → `"web ring has « prev | Haunted WebRing | next » with focusable buttons"`.

- [x] 7.2 Prev/next are present but inert in this spec (no sprites to move focus to).
  - Req: 37
  - Test: `test/costume/webring.test.ts` → `"prev/next buttons are present and do not throw"`.

## 8. Empty State

- [x] 8.1 When all counts are 0, replace counts area with `No ghosts here. Suspiciously clean.` in Comic Sans 13px `#ffffcc`.
  - Req: 38
  - Test: `test/costume/empty-state.test.ts` → `"all counts 0 shows 'No ghosts here. Suspiciously clean.'"` and `"text is Comic Sans 13px #ffffcc"`.

## 9. Body Padding

- [x] 9.1 Create `src/content/costume/body-padding.ts` with `applyBodyPadding(doc, hudHeight, lift): CSSStyleSheet` — captures original computed `padding-top`/`padding-bottom`, sets `padding-top: calc(orig + 48px)` and `padding-bottom: calc(orig + hudHeight + 16 + lift)px` via an adopted stylesheet on `document`.
  - Req: 3, 4
  - Test: `test/costume/body-padding.test.ts` → `"body padding sheet added to document.adoptedStyleSheets"` and `"padding-top = orig + 48px"`.

- [x] 9.2 Implement `removeBodyPadding(doc, sheet)` — filters the sheet out of `document.adoptedStyleSheets`.
  - Req: 6
  - Test: `test/costume/body-padding.test.ts` → `"removeBodyPadding removes the sheet from document.adoptedStyleSheets"`.

- [ ] 9.3 Recompute body padding when HUD wraps (≤400px) or when `--hg-lift` changes.
  - Req: 5
  - Test: `test/costume/body-padding.test.ts` → `"padding recomputed on HUD wrap"`.

## 10. Haunt Moment

- [x] 10.1 Create `src/content/costume/haunt-moment.ts` with `runHauntMoment(root, opts): Animation[]` building the FX layer (vignette div, 96×96 ghost sprite, dither strip) inside the shadow root.
  - Req: 39, 41, 43
  - Test: `test/costume/haunt-moment.test.ts` → `"FX layer contains vignette div, ghost sprite, and dither strip"`.

- [x] 10.2 Vignette fade-in: radial `#000033`, opacity 0 → 0.4, 0–200ms, easing `cubic-bezier(.2,.8,.2,1)`.
  - Req: 40
  - Test: `test/costume/haunt-moment.test.ts` → `"vignette animates opacity 0→0.4 over 200ms with easeOut"`.

- [x] 10.3 Ghost travel: `translateX(-96px → 100vw)` at mid-viewport height, ±6px vertical bob over 900ms, 200ms delay, easing `cubic-bezier(.45,0,.2,1)`.
  - Req: 41
  - Test: `test/costume/haunt-moment.test.ts` → `"ghost travels translateX(-96px → 100vw) with vertical bob"`.

- [x] 10.4 Starfield + bands reveal: synchronized `clip-path: inset(0 calc(100% - X) 0 0)` with the ghost travel, sharing one timing object.
  - Req: 42
  - Test: `test/costume/haunt-moment.test.ts` → `"starfield and bands clip-path synced to ghost X position"`.

- [x] 10.5 Dither strip: 32px-wide 2×2 `#66ff99`/transparent checker trailing the ghost.
  - Req: 43
  - Test: `test/costume/haunt-moment.test.ts` → `"dither strip is 32px of 2×2 #66ff99/transparent checker"`.

- [x] 10.6 Vignette fade-out: 40% → 0, 1100–1400ms, easing `cubic-bezier(.2,.8,.2,1)`. Marquee starts scrolling.
  - Req: 44
  - Test: `test/costume/haunt-moment.test.ts` → `"vignette fades 0.4→0 over 300ms starting at 1100ms"`.

- [ ] 10.7 HUD slide up: `translateY(100% → 0)`, 1400ms delay, 300ms, easing `cubic-bezier(.2,.8,.2,1)`.
  - Req: 45
  - Test: `test/costume/haunt-moment.test.ts` → `"HUD slides up translateY(100%→0) at 1400ms over 300ms"`.

- [x] 10.8 Odometer roll: `translateY` strips, right digit first, 600ms, 1700ms delay, easing `cubic-bezier(.2,.8,.2,1)`.
  - Req: 46
  - Test: `test/costume/haunt-moment.test.ts` → `"odometer rolls right digit first at 1700ms over 600ms"`.

- [x] 10.9 FX layer removed at 2500ms.
  - Req: 48
  - Test: `test/costume/haunt-moment.test.ts` → `"FX layer removed after 2500ms"`.

- [ ] 10.10 All changes are monotonic — no value toggles back. Only periodic motion is the 900ms bob (1.1 Hz). Nothing strobes above 3 Hz.
  - Req: 49, 66
  - Test: `test/costume/haunt-moment.test.ts` → `"no animation has a period under 1000ms except the 900ms bob"`.

- [x] 10.11 All animations use Web Animations API on transform, opacity, and clip-path only — no `setTimeout` chains, all inside the shadow root.
  - Req: 39
  - Test: `test/costume/haunt-moment.test.ts` → `"animations use Element.animate() on transform/opacity/clip-path"`.

## 11. Un-haunt (Reverse)

- [x] 11.1 Implement `runUnhauntAnimation(root): Promise<void>` — markers fade out (0–200ms), sprites sink 16px and fade (200–500ms), HUD slides down (300–600ms).
  - Req: 51
  - Test: `test/costume/unhaunt.test.ts` → `"unhaunt: markers fade, sprites sink+fade, HUD slides down"`.

- [x] 11.2 Webmaster's Ghost crosses right → left (500–1100ms) with clip shrinking behind it.
  - Req: 51
  - Test: `test/costume/unhaunt.test.ts` → `"ghost crosses right→left over 600ms starting at 500ms"`.

- [x] 11.3 At 1100ms, shadow host and body-padding sheet removed together (one reflow).
  - Req: 52, 6
  - Test: `test/costume/unhaunt.test.ts` → `"host and sheet removed after unhaunt animation completes"`.

- [x] 11.4 After un-haunt, `document.documentElement.outerHTML` is byte-identical to pre-haunt value.
  - Req: 53, 70
  - Test: `test/costume/unhaunt.test.ts` → `"outerHTML byte-identical after unhaunt"`.

## 12. Reduced Motion

- [x] 12.1 Create `src/content/costume/reduced-motion.ts` with `watchReducedMotion(root)` — `matchMedia("(prefers-reduced-motion: reduce)")` listener that toggles a `reduced-motion` class on `#crypt-root`.
  - Req: 56
  - Test: `test/costume/reduced-motion.test.ts` → `"watchReducedMotion toggles class on matchMedia change"`.

- [x] 12.2 Haunt: replaced by 300ms linear cross-fade of overlay root opacity 0 → 1. Odometer shows final value, marquee static.
  - Req: 54
  - Test: `test/costume/reduced-motion.test.ts` → `"reduced haunt: 300ms opacity cross-fade, no ghost, marquee static"`.

- [x] 12.3 Un-haunt: 200ms opacity fade then removal.
  - Req: 55
  - Test: `test/costume/reduced-motion.test.ts` → `"reduced unhaunt: 200ms opacity fade"`.

- [x] 12.4 `animation: none` on every costume layer when reduced motion is active.
  - Req: 56
  - Test: `test/costume/reduced-motion.test.ts` → `"reduced-motion class sets animation: none on all layers"`.

- [x] 12.5 Transitions limited to opacity, 200ms or less.
  - Req: 57
  - Test: `test/costume/reduced-motion.test.ts` → `"reduced-motion transitions are opacity-only, ≤200ms"`.

- [x] 12.6 Marquee static: first line shown, truncated with ellipsis; lines advance only on Hide/Show.
  - Req: 58
  - Test: `test/costume/reduced-motion.test.ts` → `"reduced-motion marquee is static with ellipsis"`.

- [x] 12.7 Twinkles off, under-construction sign shows frame 1.
  - Req: 59
  - Test: `test/costume/reduced-motion.test.ts` → `"reduced-motion: twinkles off, sign frame 1"`.

## 13. Costume Stylesheet

- [x] 13.1 Create one `CSSStyleSheet` via `new CSSStyleSheet().replaceSync(...)` appended to `root.adoptedStyleSheets` containing all layer, band, HUD, button, focus-ring, odometer, web-ring, show-tab, and reduced-motion CSS. All colours reference `PALETTE` constants — no hard-coded hex.
  - Req: 1, 3, 60
  - Test: `test/costume/stylesheet.test.ts` → `"costume sheet is adopted inside shadow root"` and `"no hard-coded hex outside PALETTE constants in CSS text"`.

- [x] 13.2 Layer z-indexes: starfield 1, lanes 2, markers 3, top-bands 4, HUD 5, cards 6, fx 7.
  - Req: 2
  - Test: `test/costume/stylesheet.test.ts` → `"layers have correct z-index order"`.

- [x] 13.3 Focus ring: `outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000` on all focusable costume elements.
  - Req: 63
  - Test: `test/costume/stylesheet.test.ts` → `"focus ring CSS present"`.

- [x] 13.4 Win95 buttons also get 1px dotted inner rectangle.
  - Req: 64
  - Test: `test/costume/stylesheet.test.ts` → `"Win95 buttons have inner dotted rectangle"`.

## 14. Render Entry + Integration

- [x] 14.1 Create `src/content/costume/render.ts` with `renderCostume(doc): { cleanup }` that calls `haunt()`, builds all layers, injects costume sheet, applies body padding, samples lift, watches reduced motion, runs haunt moment, and registers resize/mutation listeners.
  - Req: 1, 2, 3
  - Test: `test/costume/render.test.ts` → `"renderCostume builds all layers inside shadow root"`.

- [x] 14.2 Modify `src/content/index.ts` to call `renderCostume()` after `haunt()` and run `runUnhauntAnimation()` before `unhaunt()` on the unhaunt message.
  - Req: 51, 52
  - Test: `test/content.test.ts` (existing) still passes + `test/costume/render.test.ts` → `"index.ts integrates render + unhaunt animation"`.

- [x] 14.3 Renderer never modifies any page DOM node outside the shadow host. Only `document.adoptedStyleSheets` is changed (body-padding sheet).
  - Req: 67, 3
  - Test: `test/costume/render.test.ts` → `"no page DOM nodes modified outside shadow host"` and `"only document.adoptedStyleSheets changed"`.

- [x] 14.4 Page scripts never edited, blocked, or reordered.
  - Req: 68
  - Test: `test/costume/render.test.ts` → `"no script tags modified or reordered"`.

- [x] 14.5 Never change form behaviour — no form elements/handlers modified.
  - Req: 69
  - Test: `test/costume/render.test.ts` → `"form elements and handlers unchanged"`.

- [x] 14.6 `document.documentElement.outerHTML` unchanged after haunt (only host appended) and byte-identical after un-haunt.
  - Req: 70, 53
  - Test: `test/costume/render.test.ts` → `"outerHTML unchanged after haunt (host appended)"` and `"outerHTML byte-identical after unhaunt"`.

## 15. Accessibility

- [x] 15.1 All costume interactive elements (HUD buttons, Show tab, web-ring links) are keyboard reachable (`tabindex` or native `<button>`).
  - Req: 62
  - Test: `test/costume/accessibility.test.ts` → `"all interactive elements are keyboard reachable"`.

- [x] 15.2 Visible focus indicators on all interactive overlay elements.
  - Req: 62, 63
  - Test: `test/costume/accessibility.test.ts` → `"focus indicators visible on all interactive elements"`.

- [x] 15.3 HUD and overlay text meets 4.5:1 contrast against its background.
  - Req: 65
  - Test: `test/costume/accessibility.test.ts` → `"#ffffcc on #000033 ≥ 4.5:1"` and `"#66ff99 on #000033 ≥ 4.5:1"` and `"#ffffcc on #330066 ≥ 4.5:1"`.

- [ ] 15.4 No flashing/strobing faster than 3 Hz anywhere.
  - Req: 66
  - Test: `test/costume/accessibility.test.ts` → `"no animation has a period under 333ms (3 Hz)"`.

## 16. E2E Tests

- [x] 16.1 Create `e2e/costume.spec.ts`: Haunt a fixture → assert shadow root contains starfield, bands, HUD.
  - Req: 1, 2, 8, 13, 22
  - Test: `e2e/costume.spec.ts` → `"Haunt renders starfield, bands, and HUD inside shadow root"`.

- [x] 16.2 Assert body padding changed after haunt and restored after un-haunt.
  - Req: 3, 4, 6
  - Test: `e2e/costume.spec.ts` → `"body padding changes on haunt, restores on unhaunt"`.

- [x] 16.3 Assert marquee has a CSS animation (scrolls).
  - Req: 18, 19
  - Test: `e2e/costume.spec.ts` → `"marquee has running CSS animation"`.

- [x] 16.4 Assert Hide/Show works (layers fade, Show tab appears/restores).
  - Req: 28, 29
  - Test: `e2e/costume.spec.ts` → `"Hide fades layers and shows tab; Show restores"`.

- [ ] 16.5 Assert page remains interactive while haunted (form submission works).
  - Req: 67, 69
  - Test: `e2e/costume.spec.ts` → `"form submission works while haunted"`.

- [x] 16.6 Un-haunt → `document.documentElement.outerHTML` byte-identical.
  - Req: 53, 70
  - Test: `e2e/costume.spec.ts` → `"unhaunt: outerHTML byte-identical to pre-haunt"`.

- [x] 16.7 Reduced motion (emulated) → cross-fade, no ghost sprite in FX layer.
  - Req: 54
  - Test: `e2e/costume.spec.ts` → `"reduced motion: cross-fade, no ghost sprite"`.
