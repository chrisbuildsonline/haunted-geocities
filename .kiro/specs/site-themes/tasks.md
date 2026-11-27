# Tasks: Seeded 90s Site Looks (F35)

Implementation checklist for the site-themes spec. Each task names the requirement numbers it satisfies (`requirements.md`) and the test that proves it. Unit tests live in `test/costume/` (Bun), the e2e tests in `e2e/themes.spec.ts` (Playwright) and the visual baselines in `e2e-visual/visual.spec.ts`.

Do the tasks in order: each group builds on the one before. Write each test first and see it fail before the code that follows it. Run `bun run typecheck` and `bun run test` after every group. Task 1.1 is done with this spec. Everything else changes files outside `.kiro/` and is still to do.

`seed.ts`, `themes.ts` and `test/costume/themes.test.ts` already exist. Do not rewrite them. `themes.ts` changes only by a data fix that a failing contrast test demands (design.md, "Palette contrast").

## 1. Spec

- [x] 1.1 Write `requirements.md`, `design.md` and `tasks.md` in `.kiro/specs/site-themes/`.

## 2. Golden and the pure pieces

- [ ] 2.1 Before any production change, capture today's Classic Crypt output as a golden: `restyleCss(themeFor("#ffffff"))`, `restyleCss(themeFor("#000000"))`, `columnLayersCss` for fixed boxes (visible and hidden), and `costumeCss` with the tile URLs masked, into `test/costume/__golden__/classic-crypt.json`, with a test that compares them. It passes now and must keep passing, apart from the additions of criterion 44.
  - Req: 44
  - Test: `test/costume/theme-css.test.ts` → `"Classic Crypt output equals the golden, apart from the listed additions"`. `git stash` of the later tasks' source shows it passing on the untouched tree.

- [ ] 2.2 Add `src/content/costume/theme-url.ts` with `forcedPreset(search, mode)`. Tests first.
  - Req: 33, 34
  - Test: `test/costume/themes.test.ts` → `"forcedPreset returns null unless the mode is e2e"`, `"forcedPreset ignores an unknown id and a missing parameter"`, `"forcedPreset returns a known id in the e2e mode"`.

- [ ] 2.3 Add `src/content/costume/theme-art.ts`: `tilePixels` for the 10 tiles, `tilePattern`, the 12 `SPRITES` with `SPRITE_MOTION`, `dividerUrl`, `GLYPHS`. Write `test/costume/theme-art.test.ts` first. Every tile uses only its palette's four inks; the stars tile with the crypt palette equals `STAR_TILE`'s pixels.
  - Req: 9, 16, 20, 28, 38, 39
  - Test: `test/costume/theme-art.test.ts` → `"every tile is 64x64 in its four inks, for every palette"`, `"the ground covers 60% of every tile"`, `"bricks and checker repeat without a seam"`, `"the stars tile with the crypt palette equals STAR_TILE"`, `"the tint pattern is two colours and its darkest is the tint"`, `"there are 12 sprites of 16x16 with at most 4 colours and a #000033 outline"`, `"every sprite and divider and glyph colour is web-safe"`, `"every divider is 16px tall"`, `"every glyph is 8x8 or smaller"`, `"no two sprites are the same"`.

- [ ] 2.4 Make `paintTile` in `src/content/costume/starfield.ts` take a pixel list and a ground (the stars call keeps its behaviour). Add `themeArt(doc, look)` that resolves the tile URL (canvas), the twinkle URL (stars only), the pattern, sprites, divider and glyph URLs.
  - Req: 9, 10
  - Test: `test/costume/starfield.test.ts` → `"paintTile with STAR_TILE draws what it drew before"`. `test/costume/theme-art.test.ts` → `"themeArt gives a twinkle only for the stars tile"`.

## 3. The page sheet

- [ ] 3.1 Write the theme CSS tests first in `test/costume/theme-css.test.ts`, seen failing. Then add `src/content/costume/theme-css.ts` with `themePageCss`, `bevelRings` and `BANNER_HEIGHT`: the marker, the banner custom property and its 480px media rule, heading styles, `hr` dividers and image outlines.
  - Req: 14, 15, 17, 22, 24, 30, 31, 35, 36, 38
  - Test: `test/costume/theme-css.test.ts` → `"every preset writes --hg-theme with its id"`, `"wordart is a hard 2px 2px shadow with no blur"`, `"outline is four 1px glows in the palette glow colour"`, `"blink is one hg-blink rule on the first h1"`, `"each divider gives its strip on hr and leaves hr in nav, forms and site chrome alone"`, `"hr keeps its margins"`, `"each bevel is a 6px frame"`, `"the image rule has outline and box-shadow and no border, padding, margin, width, height or transform"`, `"a locked look emits no image rule"`, `"--hg-banner is 72px and 56px under 480px"`, `"every animation is under no-preference or has a reduced override"`, `"every animation-duration is 500ms or longer"`, `"every hex colour is web-safe"`.

- [ ] 3.2 Add `src/content/costume/theme-headings.ts`: measure which `h1`-`h3` take the rainbow fill (own colour luminance under 0.4, not on a dark ground) and return structural paths, so no page node changes. Emit the rainbow rule only for them.
  - Req: 14
  - Test: `test/costume/theme-css.test.ts` → `"rainbow takes a dark heading and leaves a white heading on a hero photo alone"`, `"rainbow rules address headings by structural path"`. `test/costume/page-blocks.test.ts` still passes.

- [ ] 3.3 In `src/content/costume/page-theme.ts`, make `themeFor(pageBg, look)` take the palette's link, visited and hover on light pages (dark pages keep `PAGE`'s), and `restyleCss(theme, fonts)` take a font set. Classic Crypt's strings stay as they are.
  - Req: 13, 29, 44, 46
  - Test: `test/costume/page-theme.test.ts` → `"light page links are the palette's, moved to 4.5:1 on the tinted background"`, `"dark page links keep the dark colours"`, `"chrome links and button links keep their colours"`, `"the font set replaces the body and heading fonts"`, `"form controls, code, svg, math, i and icon fonts keep their font"`. `test/costume/theme-css.test.ts` → the golden of 2.1.

- [ ] 3.4 In `src/content/costume/column-layers.ts`, draw the tint pattern (a locked look keeps the plain tint) and the bevel recipe and palette colours on the frame. In `src/content/costume/body-padding.ts`, give `addPageSheet(doc, look)` the look: the marker, `--hg-banner`, the banner in the body's top padding, and the theme rules of 3.1. The scroll padding stays at the bands alone. One adopted sheet.
  - Req: 12, 17, 22, 23, 24, 28, 44
  - Test: `test/costume/column-layers.test.ts` → `"the tint is the palette tint with a pattern"`, `"a locked look has the plain tint"`, `"the frame colours are the palette's bevel colours"`, `"all four bevels keep FRAME_OUT"`. `test/costume/body-padding.test.ts` → `"the body padding adds var(--hg-banner)"`, `"the scroll padding does not"`, `"the page gets one adopted sheet"`, `"the sheet writes the marker"`, `"removing the sheet removes everything"`.

## 4. The shadow root

- [ ] 4.1 Write the palette CSS tests first, seen failing. Then give `costumeCss(look, art)` the look and the art (the old arguments stay as defaults): the tile for the gutters, bands, edge frame and footer, the bar's `band` and `bandText`, the marquee's plaque, the sign-off plaque pill, the odometer's counter colours. The twinkle layer only for the stars tile. In `src/content/costume/hud.ts`, `digitsUrl` takes the counter colour.
  - Req: 10, 11, 12, 19, 37, 44
  - Test: `test/costume/theme-css.test.ts` → `"each tile gives a different background image"`, `"the twinkle layer is emitted only for stars"`, `"the bar, the marquee, the banner title and NEW! reach 4.5:1 for every palette"`, `"the odometer digit reaches 4.5:1 on its cell for every counter"`, `"the HUD, graveyard and cards keep the crypt colours"`, `"costume text sits on a plaque, bar, HUD or card"`. `test/costume/odometer.test.ts` and `stylesheet.test.ts` still pass.

- [ ] 4.2 Add the banner layer (`bannerCss`, the markup in `render.ts`): the tile ground, the bevel frame, the WordArt title on a plaque in the font set's heading font, two sprites, the blinking `NEW!` line, the divider, with the 72px and 56px heights and the motion table. `aria-hidden`, `pointer-events: none`.
  - Req: 16, 18, 25, 26, 27, 35, 36
  - Test: `test/costume/theme-css.test.ts` → `"the banner is position: absolute, aria-hidden and pointer-events: none"`, `"the title takes the look's banner phrase"`, `"the banner uses the font set's heading font and the palette's title colour"`, `"the NEW! line blinks at 1 Hz and is solid under reduced motion"`, `"each sprite gets its motion from the table"`, `"under reduced motion the sprites do not move"`. `test/costume/render.test.ts` → `"the banner layer is a sibling of #crypt-root in the shadow root"`.

- [ ] 4.3 Place the banner in `measure()` in `render.ts`: top from the body's padding-box top, left and width from the tint box (the page width in full-overlay mode, inside the edge frame), and update it on every relayout. Give it the `reduced-motion`, `tab-hidden` and `costume-hidden` classes in the loops that give them to `croot` and `footer`.
  - Req: 24, 25, 43, 45
  - Test: `test/costume/render.test.ts` → `"the banner's top is the body's padding-top minus its height from the body's top"`, `"the banner spans the tint box"`, `"in full-overlay mode it spans the page inside the edge frame"`, `"Hide fades the banner and Show brings it back"`, `"a live reduced-motion change stops the banner's motion"`.

- [ ] 4.4 Add the layout rail: `layoutStarfield` takes the quirk and adds one `.rail` to the named gutter when it is 64px or more. Nothing else uses the quirk.
  - Req: 21, 45
  - Test: `test/costume/starfield.test.ts` → `"leftframe adds one rail to the left gutter"`, `"rightframe adds one to the right"`, `"table adds none"`, `"no rail in a gutter under 64px or in full-overlay mode"`, `"computeContentColumn and gutterWidths give the same result for every quirk"`. `test/costume/theme-css.test.ts` → `"the rail is under the lanes and has pointer-events: none"`.

- [ ] 4.5 Add the cursor trail: `src/content/costume/trail.ts` with the pool of 12, the passive `pointermove` listener, the 16px spacing and the 600ms fade; mount it in `render.ts`, stop it on Un-haunt, and add and remove it live when reduced motion changes.
  - Req: 20, 35, 36, 41, 43
  - Test: `test/costume/trail.test.ts` (new) → `"a pointer move of 16px or more adds a glyph"`, `"a move under 16px adds none"`, `"never more than 12 glyphs exist"`, `"touch pointers add none"`, `"under reduced motion nothing is created"`, `"stop removes the listener and the glyphs"`, `"the layer is aria-hidden with pointer-events: none"`, `"each trail kind uses its glyphs"`. `test/costume/reduced-motion.test.ts` → `"a live change adds and removes the trail"`.

## 5. Wiring

- [ ] 5.1 In `render.ts`, compute `pickLook(win.location.hostname, forcedPreset(...))` once per haunt and pass the look to `costumeCss`, `addPageSheet`, `layoutStarfield`, the banner, the trail and `buildHud`. In the e2e build only, put `data-quirk` on `#crypt-root`.
  - Req: 2, 22, 23, 33, 34
  - Test: `test/costume/render.test.ts` → `"the same hostname gives the same marker on every render"`, `"www and the bare host give the same marker"`, `"the document gets exactly one adopted sheet and no new node"`, `"a forced preset in the e2e mode sets the marker"`, `"a forced preset is ignored in any other mode"`.

- [ ] 5.2 Add the banner to the haunt moment's wipe. Read `Reveal` in `src/content/costume/haunt-moment.ts` first: it takes a pseudo-element today, so add a form for a shadow-root element (or the smallest change that works). A quiet haunt shows the banner at once.
  - Req: 43
  - Test: `test/costume/haunt-moment.test.ts` → `"the banner wipes in with the tint"`, `"a quiet haunt has the banner at once"`, `"the existing tint and frame wipe is unchanged"`.

- [ ] 5.3 Un-haunt: the host, the sheet, the trail listener and the banner all go. The page is byte-identical.
  - Req: 41
  - Test: `test/costume/unhaunt.test.ts` → `"outerHTML is identical after un-haunt, for every preset"`, `"no adopted sheet is left"`, `"the pointermove listener is removed"`, `"no inline style or attribute was added to a page node"`.

- [ ] 5.4 Check that the footer, the ghost icon, the findings strip, the secrets, the cards, Exorcise, the tombstones and the curse badges still work under a non-classic look, and fix what the look broke.
  - Req: 42, 45, 46
  - Test: `test/costume/footer.test.ts`, `secrets.test.ts`, `hide-show.test.ts` and `card.test.ts` pass with a non-classic look added to their render helper (`test/costume/helpers.ts` gets a `look` option).

## 6. The cover and the e2e build

- [ ] 6.1 In `src/cover/cover.ts`, compute the look from the document's hostname (and the forced preset) and use the palette's plaque for the screen's ground. Check `P.bone` on every plaque.
  - Req: 7, 11, 32, 37
  - Test: `test/cover.test.ts` → `"the cover's ground is the plaque of the site's palette"`, `"the cover and the costume agree on the palette for one host"`, `"the label reaches 4.5:1 on every plaque"`, `"a forced preset in the e2e mode changes the plaque"`. The existing cover tests pass.

- [ ] 6.2 Build `dist/` and check that the shipping bundles have no forcing code, and that `cover.js` is still a self-contained script.
  - Req: 7, 34, 40
  - Test: `bun run build`, then `grep -c hgtheme dist/content.js dist/cover.js` prints 0 for both. `test/build.test.ts` (or the existing build test) gains `"the shipping bundles do not contain hgtheme"` and `"cover.js has no import"`. `bun run lint:manifest` exits 0.

## 7. The data and the existing tests

- [ ] 7.1 Extend `test/costume/themes.test.ts`: the cover plaque contrast, every plaque luminance under 0.1, and the fixture hosts (`127.0.0.1` is `classic-crypt`, `localhost`, `nps.gov` and `cdc.gov` differ). Fix a palette in `themes.ts` only if a test finds a miss, and name the pair in the commit.
  - Req: 3, 8, 11, 47
  - Test: `test/costume/themes.test.ts` → `"every plaque has luminance under 0.1"`, `"the label colour reaches 4.5:1 on every plaque"`, and the existing tests.

- [ ] 7.2 Update every existing unit test and e2e spec that measures a position below the top bands for the banner's padding (72px, 56px under 480px), one spec at a time, and give the reason in the commit. Do not loosen an assertion.
  - Req: 55
  - Test: `bun run test` and `bun run test:e2e` exit 0 with the existing specs, including `column-costume.spec.ts`, `layout-375.spec.ts`, `graveyard.spec.ts`, `findings.spec.ts`, `photo-page.spec.ts` and `hero-haunt.spec.ts`.

## 8. e2e (`e2e/themes.spec.ts`)

- [ ] 8.1 Write the spec: different markers and looks for `127.0.0.1` and `localhost`, a reload keeps the look, the banner scrolls with the page and sits between the bands and the content, the quirks move nothing across the `georgia` presets, reduced motion is static with no trail, the trail never exceeds 12, Un-haunt is byte-identical for three forced presets, and a smoke test of the footer, ghost icon and a card under a non-classic preset.
  - Req: 2, 8, 20, 21, 22, 23, 25, 35, 41, 42, 43, 50
  - Test: `e2e/themes.spec.ts` → `"127.0.0.1 and localhost get different --hg-theme markers"`, `"127.0.0.1 wears classic-crypt"`, `"the two sites look different: font, tint pattern and tile"`, `"a reload keeps the look"`, `"the banner scrolls with the page and the bands stay"`, `"the banner sits above the first content"`, `"the quirk moves nothing"`, `"reduced motion: no trail, no blink, no sprite motion"`, `"the trail has at most 12 glyphs"`, `"un-haunt is byte-identical for three forced presets"`, `"the footer, ghost icon and a card work under flame-skull"`.

- [ ] 8.2 Run `bun run test:e2e`.
  - Req: 54
  - Test: exits 0.

## 9. Visual baselines

- [ ] 9.1 Add the preset baselines to `e2e-visual/visual.spec.ts`: `flame-skull`, `cloud-angel`, `matrix-den`, `construction-zone` and `classic-crypt` on `article.html` at 1280, and `flame-skull` and `cloud-angel` at 375, each with `?hgtheme=<id>`, motion reduced and the clock fixed, as the other shots.
  - Req: 33, 51
  - Test: `bun run test:visual:update` in Docker writes them; `bun run test:visual` then exits 0.

- [ ] 9.2 Regenerate every existing haunted-page baseline in Docker with `bun run visual:baselines` (the banner moves the page down) and look at each changed PNG before it is committed: the banner reads, no text is cut, the tint pattern is pale, the frame is 6px, the Classic Crypt shots differ from the old ones only by the banner and the shift.
  - Req: 51
  - Test: `bun run test:visual` exits 0. `git status` shows changes only to PNGs under `e2e-visual/__screenshots__/`.

## 10. Docs

- [ ] 10.1 Add a `### Themes` section to the Costume part of `design/DESIGN.md`: the seed, the 22 presets, the 11 axes with their options, Classic Crypt locked, the clash rules, the banner (size, layer, motion), the tint pattern, bevels, the trail, the rail, the e2e-only parameter and the marker. Add `#banner` and `#trail` to the layer table. Every colour is web-safe.
  - Req: 53
  - Test: `test/design.test.ts` still passes, and every hex colour in the new section is in `WEB_SAFE`.

- [ ] 10.2 Add a Themes section to `README.md`: what the look is, how the seed works (`www.` is dropped), the nps.gov and cdc.gov stills, the e2e-only `?hgtheme=`, and Classic Crypt. Raise the spec count by one wherever the README and `docs/devpost.md` state it, and add `site-themes` to the list in "How Kiro was used".
  - Req: 53
  - Test: `test/project.test.ts` still passes. `grep -n "site-themes" README.md docs/devpost.md` finds both.

## 11. Real sites

- [ ] 11.1 In `scripts/real-site.pw.ts`, read `--hg-theme` and the look's name from the page after the haunt, write them into `docs/real-site.json`, and fail if the two pages have the same marker. Check that `scripts/still-frame.ts` still finds a frame where no ghost covers the crypt window or the button with the banner in place.
  - Req: 52
  - Test: `bun run docs:realsite` exits 0 and `docs/real-site.json` has a distinct `theme` for `nps.gov` and `cdc.gov`.

- [ ] 11.2 Run `bun run docs:realsite`, look at `docs/real-site-haunt.gif`, `docs/real-site-caption-nps.png` and `docs/real-site-caption-cdc.png`, and confirm the two pages differ in tile, palette and heading style. Update the README text and the alt text of the GIF, the stills and the run date that describe them.
  - Req: 52, 53
  - Test: `docs/real-site.json` records the run; a look at the three files shows two clearly different costumes. `test/project.test.ts` still passes.

## 12. Final checks

- [ ] 12.1 Run `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run lint:manifest` and `bun run test:visual`.
  - Req: 40, 54
  - Test: all five exit 0.

- [ ] 12.2 Rebuild `dist/` with `bun run build` and check it: `dist/cover.js` exists, `grep -c hgtheme dist/content.js dist/cover.js` prints 0 for both, and the manifest is unchanged (`git diff --stat src/manifest.ts` is empty).
  - Req: 34, 40, 54
  - Test: the three commands give the stated output.

- [ ] 12.3 Run `bun run docker:test` once.
  - Req: 54
  - Test: exits 0.

## 13. Page structure (added request: two sites, two different 1998 homepages)

Requirements 56 to 82, design part "Page structure". The code of 13.1 to 13.6 was written before this group, so those tasks are ticked; 13.7 to 13.9 are what is left.

- [x] 13.1 Add the structure axes to `src/content/costume/themes.ts`: `LAYOUTS` (`full`, `table640`, `table800`, `left760`, `nav2`, `rightlinks`, `links3`), `DENSITIES`, `DRESSINGS`, `PREFIXES`, `FURNITURE`, `FURNITURE_COUNT`, the two structure clash rules, `pickFurniture` and `furniture` on the look. Classic Crypt is `full`, `sparse`, `frames`, `none`, with no furniture, and the seed varies none of the four.
  - Req: 56, 61, 62, 73, 74
  - Test: `test/costume/themes.test.ts` → the `the structure` describe block: `"the same host always gets the same layout, density, dressing and furniture"`, `"200 sites spread over every layout, density, dressing and prefix, and over many furniture sets"`, `"the furniture count follows the density, with no piece twice"`, `"a sparse site is one plain table, and three columns only come cluttered"`.

- [x] 13.2 Add `src/content/costume/furniture.ts` geometry: `layoutGeometry(look, vw)` (the right column drops first, then the left, then it collapses; 64px of starfield each side) and `layoutCss(geometry)` (the page-sheet rule that holds the body to its cell: `max-width`, `margin-left`, 16px inline padding, `overflow-x: clip`).
  - Req: 56, 57, 58
  - Test: `e2e/themes.spec.ts` → `"two sites get two different page structures"` (the body's `max-width` is a pixel value and its width falls). Unit tests are task 13.7.

- [x] 13.3 Add the furniture in `furniture.ts`: `harvest` (the page's own site links, outbound links and `h2`/`h3` headings, `http(s)` only, read once), `buildPiece` for the ten pieces, `buildTabs`, `buildColumn`, `placeFurniture` (nav buttons head the left column, Cool Links and awards prefer the right, webring, best viewed and updated go to the bottom strip), the original award names, and links copied with `tabIndex = -1`.
  - Req: 62, 63, 64, 66, 67
  - Test: `e2e/themes.spec.ts` → `"two sites get two different page structures"` (at least two `.fur` pieces, and every real link is still clickable). Unit tests are task 13.7.

- [x] 13.4 Draw the structure in the shadow root and wire it in `theme-css.ts` and `render.ts`: `lookShadowCss` (furniture columns, the bottom strip, the tab bar, the `.new` blink and its reduced-motion override), `WELCOME` and `welcomeHeight` (96px sparse banner, 28px tab bar, 56px phone), `#fur-left`, `#fur-right` and `#fur-bottom`, `fill()` that rebuilds only on a changed placement, the overflow hand-over to the bottom strip, `widen()` so the frame and the tint go round the whole table, the hidden columns in full-overlay mode, and the layout rule in the page sheet.
  - Req: 58, 59, 60, 65, 66, 68, 69, 73, 77, 78
  - Test: `test/costume/theme-css.test.ts` → `"the page sheet names the preset and sizes the banner for desktop and phone"`. `e2e/themes.spec.ts` → `"two sites get two different page structures"`.

- [x] 13.5 Add section dressing and the heading prefix: `dressingCss(look, dark)` (bevelled cells, fieldset groove boxes with a `::before` legend and cells on a dark page, sprite list bullets with `list-style-image`, 6px ridge picture frames drawn as an outline) and the `h2`/`h3` `::before` prefix sprite (skull, flame, star, none), for the outermost `section`, `aside`, `blockquote`, `figure`, `table` and `form` outside site chrome.
  - Req: 70, 71, 72
  - Test: `test/costume/theme-css.test.ts` → `"each dressing wraps the page's own sections its own way"`.

- [x] 13.6 Document the structure in `design/DESIGN.md` (the `Structure` bullet of `### Themes`, the density row of the table, the layout row) and `README.md` (the Themes section: the table widths, the furniture built from the page's own links and headings, the dressing, the phone collapse).
  - Req: 82
  - Test: `test/design.test.ts` and `test/project.test.ts` still pass.

- [x] 13.7 Write `test/costume/furniture.test.ts` (new), seen failing against a deliberate break of each rule, for the pieces of 13.2 and 13.3: `layoutGeometry` at 1280, 1000, 900, 800, 700 and 375 for every layout; `layoutCss`; `placeFurniture` (the slots, no piece lost, everything at the bottom when collapsed); `harvest` on a small DOM; `buildPiece` and `buildTabs`.
  - Req: 57, 58, 63, 64, 66, 67, 80
  - Test: `test/costume/furniture.test.ts` → `"a table that fits keeps its columns"`, `"the right column drops first, then the left"`, `"a width under the main cell plus 128px collapses"`, `"full and collapsed give no page-sheet rule"`, `"layoutCss holds the body to its cell"`, `"nav buttons head the left column"`, `"Cool Links and awards prefer the right, and use the left when there is no right"`, `"webring, best viewed and updated go to the bottom"`, `"a collapsed geometry puts every piece at the bottom"`, `"no piece is lost or doubled"`, `"harvest keeps only http and https links, splits site from outbound and drops repeats and odd lengths"`, `"harvest reads the h2 and h3 headings, three at most"`, `"a copied link has the page's href, the page's text and tabindex -1"`, `"a made-up piece has no href"`, `"the same site gives the same digits and date"`, `"the tab bar has up to six tabs"`.

- [x] 13.8 Extend `e2e/themes.spec.ts` → `"two sites get two different page structures"` for the collapse and for Un-haunt: the same page at 375 wide has no visible furniture column, every piece in the bottom strip, no horizontal scroll and the same links clickable, and `document.documentElement.outerHTML` equals the string captured before Haunt, at 1280 and at 375. Add a check that `links3` (force `matrix-den` in the e2e build) shows both columns at 1280 and only the left at 900.
  - Req: 57, 60, 75, 76, 77, 81
  - Test: `e2e/themes.spec.ts` → `"two sites get two different page structures"`, `"the page collapses to one column at 375 and un-haunts byte for byte"`, `"links3 drops its right column first"`. `bun run test:e2e` exits 0.

- [ ] 13.9 Add visual baselines for the structure to `e2e-visual/visual.spec.ts`: `nav2` (`flame-skull`), `rightlinks` (`cloud-angel`) and `links3` (`matrix-den`) on `article.html` at 1280 and `flame-skull` at 375 (collapsed, furniture at the bottom), forced with `?hgtheme=`, motion reduced and the clock fixed. Make them with `bun run visual:baselines` and look at each PNG: the columns sit beside the table, the frame goes round all of it, no text is cut, and the 375 shot has no column.
  - Req: 57, 58, 59, 77, 81
  - Test: `bun run test:visual` exits 0. `git status` shows only the new PNGs and the spec file.
