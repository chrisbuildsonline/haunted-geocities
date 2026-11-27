# Requirements: Seeded 90s Site Looks (F35)

## Overview

Today every haunted page wears the same crypt: a navy starfield, a violet bar, Times New Roman and Comic Sans, a parchment tint. This spec gives every **site** its own 1998 look. The site's hostname is hashed into a seed, the seed picks one of 22 named presets (Flame Skull Shrine, Cloud Angel Page, Matrix Hacker Den, Under Construction Zone, Classic Crypt and 17 more), and two or three of the preset's axes are swapped for other options. The same site always gets the same look, so `nps.gov` and `cdc.gov` differ and every page of one site agrees.

The data model is already written and tested: `src/content/costume/seed.ts` (`seedKey`, `fnv1a`, `mulberry32`, `pick`) and `src/content/costume/themes.ts` (`PALETTES`, `FONT_SETS`, `TILES`, `HEADINGS`, `DIVIDERS`, `SPRITE_SETS`, `BEVELS`, `BANNERS`, `COUNTERS`, `TRAILS`, `QUIRKS`, `RAINBOW`, `PRESETS`, `CLASH_RULES`, `clashes`, `pickLook`, `lookSignature`) with `test/costume/themes.test.ts`. This spec does not redo the data. It draws it: the art, the CSS, the banner, the trail, the wiring into the page sheet and the shadow root, the loading cover, and the tests and docs.

The look adds, to every haunted page: a `Welcome to my homepage!!!` WordArt **banner** that scrolls with the page under the fixed top bands, with two sprites and a blinking `NEW!` line; a pale pixel pattern in the palette's tint over the content column instead of plain parchment; bevelled outlines on images in `main` and `article`; theme fonts, heading style and link colours; themed `hr` dividers; a themed tile for the gutters, bands, edge frame, banner and footer; a layout quirk drawn on the gutters; and a pixel cursor trail. **Classic Crypt** is locked: it keeps today's page look exactly and only its trimmings vary.

| Piece | What it does |
| --- | --- |
| Seed and look | `pickLook(location.hostname)`: same site, same look, no storage and no clock. |
| Art (`theme-art.ts`) | Pure pixel data: 10 tiles, tint patterns, 12 sprites, 5 dividers, 5 trail glyph sets. |
| CSS (`theme-css.ts`) | Pure functions from a look to the rules for the page sheet and the shadow root. |
| Page sheet | `--hg-theme`, the banner's padding, fonts, headings, link colours, tint pattern, image outlines, `hr`. |
| Shadow root | Themed bands, gutters, edge frame, footer, counter, banner layer, layout rail, trail layer. |
| Cover | The loading screen takes the palette's plaque colour. |
| e2e build only | `?hgtheme=<id>` forces a preset, for baselines. |

Steering references: `non-destructive-dom.md` (the page is untouched, un-haunt restores it byte for byte), `era-accuracy.md` (216 web-safe colours, 1990s core web fonts, original pixel art), `accessibility-and-motion.md` (reduced motion, 3 Hz, 4.5:1), `product.md` (no new permissions), `tech.md` (shadow DOM, adopted stylesheets, no new dependencies), `structure.md` (module placement). Related specs: `costume-renderer` (page sheet, haunt moment, HUD), `site-haunt` (the cover, the quiet haunt), `neighborhoods` (the address in the bar), `crypt-footer` (footer, ghost icon, secrets), `sound-effects` (unchanged).

## Terms

- **Site key**: `seedKey(hostname)`: the hostname lower-cased with one leading `www.` removed.
- **Preset**: one of the 22 entries of `PRESETS`: a complete set of axis values with an id and a name.
- **Look**: what `pickLook` returns: the preset's axes with two or three of them swapped (`varied`), plus `site`, `preset` (the id) and `name`.
- **Axis**: one independent choice in a look: `tile`, `palette`, `fonts`, `heading`, `divider`, `sprites`, `bevel`, `banner`, `counter`, `trail`, `quirk`.
- **Locked preset**: a preset with `locked: true` (Classic Crypt). Only `divider`, `sprites`, `banner`, `counter` and `trail` may be swapped.
- **Ink**: one of a palette's `ground`, `a1`, `a2`, `a3`: the four colours a tile is drawn in.
- **Tile**: a 64×64 pixel-art background in a palette's inks.
- **Tint pattern**: the 16×16 pattern multiplied over the content column on light pages.
- **Trimmings**: the axes a locked preset may still swap (`divider`, `sprites`, `banner`, `counter`, `trail`).
- **Banner layer**: the absolutely positioned element in the shadow root that draws the banner in document coordinates.
- **Marker**: the custom property `--hg-theme` on `:root`, whose value is the preset id.
- **Forced preset**: the preset id a `?hgtheme=` parameter names in the e2e build.
- **Plaque**: the solid dark box under text that would otherwise sit on a tile (the marquee line, the banner title, the cover).

## EARS Acceptance Criteria

### The seed and the presets

1. The site key of a page shall be `seedKey(location.hostname)`. `www.x.com`, `WWW.X.COM` and `x.com` shall have the same key. `www.www.x.com` shall give `www.x.com`. A subdomain (`blog.x.com`) shall be its own site.
2. The look shall depend on the site key and nothing else (in a shipping build): the same key shall give the same look on every page, reload, tab and browser session. Computing it shall read no storage, no clock, no `Math.random` and no network, and write nothing.
3. `PRESETS` shall hold 22 presets with unique ids and unique names, including `flame-skull` (Flame Skull Shrine), `cloud-angel` (Cloud Angel Page), `matrix-den` (Matrix Hacker Den), `construction-zone` (Under Construction Zone) and `classic-crypt` (Classic Crypt).
4. `pickLook` shall hash the site key with FNV-1a 32-bit into a mulberry32 generator. Its first draw shall pick the preset. Later draws shall pick two or three distinct axes from the preset's pool and swap each for another option, so the look differs from the preset in at most three axes.
5. The clash rules shall block these combinations: flames or matrix tiles on a ground that is not near-black; clouds on a ground that is not sky-light; rainbow headings unless every `RAINBOW` stop reaches 4.5:1 on the palette's tint; a checker tile with the bubblegum palette; the matrix tile with any palette but matrix. A swap that would clash shall be skipped, and an axis with no option left shall stay as the preset has it. Every preset shall pass the rules unchanged, and no look `pickLook` returns shall break one.
6. A locked preset shall keep its `tile`, `palette`, `fonts`, `heading`, `bevel` and `quirk` for every site. Only its trimmings may vary.
7. `seed.ts`, `themes.ts`, `theme-art.ts` and `theme-css.ts` shall import nothing from `chrome` and touch no DOM, so the content script and the cover script can both bundle them.
8. The fixture host `127.0.0.1` shall wear Classic Crypt, so the existing column specs keep their colours. `localhost`, `nps.gov` and `cdc.gov` shall each wear a different preset from it and from each other.

### The axes

9. Each of the 10 tiles (stars, flames, bricks, clouds, matrix, slime, checker, spiderweb, hearts, planets) shall be a 64×64 original pixel-art tile drawn only in the current palette's `ground`, `a1`, `a2` and `a3`, built from small motifs placed whole inside the tile so it repeats without a seam. With the crypt palette the stars tile shall have exactly the pixels of today's starfield tile.
10. The tile shall be the ground of the gutters, the top bands, the 12px edge frame, the banner and the footer. The HUD, the graveyard, the cards and the ghost and vampire sprites shall keep today's crypt colours and stars tile.
11. Each of the 9 palettes shall hold only web-safe colours, and every text pair shall reach 4.5:1: the bar text on the bar, the marquee text on its plaque, the banner title on its plaque, the odometer digit on its cell, black text on the tint, and the link, visited and hover colours on the tint (after the nearest-web-safe move of criterion 29). Every plaque shall have a relative luminance under 0.1.
12. The palette shall colour: the neighborhood bar (`band`, `bandText`, a bottom edge in `glow`), the marquee plaque (`plaque`, `plaqueText`), the banner title and its WordArt shadow (`title`, `shadow`), the tint, the bevel (`bevelLight`, `bevelDark`) of the guestbook frame, banner and image outlines, the frame's glow, and the cover (criterion 32). With the crypt palette each of these shall equal the colour used today.
13. Each of the 6 font sets shall use only 1990s core web fonts (Times New Roman, Comic Sans MS, Arial, Arial Black, Impact, Courier New, Verdana, Georgia) and a generic family, the comic stack keeping `"Comic Neue"` after Comic Sans as today. The set shall replace the body font and the `h1`-`h3` font of the restyle. The elements that keep their own font today (form controls, code, `svg`, `math`, `i`, icon fonts) shall still keep it.
14. The heading style shall be one of five, applied to `h1`, `h2` and `h3`: `comic` (the set's heading font only, as today); `wordart` (a hard `2px 2px 0` text-shadow in the palette's `shadow`, no blur); `rainbow` (a fill of the six `RAINBOW` bands, only on headings whose own colour has luminance under 0.4 and that do not sit on a dark ground, so a white heading on a hero photo stays white); `outline` (a hard four-direction 1px glow in the palette's `glow`); `blink` (the first `h1` blinks at 1 Hz, the other headings take the comic style). No style shall change a heading's box size.
15. The divider shall be one of five pixel-art strips (flames, skulls, construction tape, rainbow, slime drips), 16px tall, repeated along the x axis. It shall replace the look of every `hr` in the page content (not inside `nav`, a `header` or `footer` outside `main` and `article`, forms or the banner's own markup) and shall run under the banner.
16. The six sprite sets shall be pairs of original 16×16 pixel sprites: skull and bat, worker and cone, mailbox and envelope, UFO and alien, globe and computer, heart and cat. Each sprite shall use at most 4 web-safe colours plus transparent and a 1-art-pixel `#000033` outline, and is drawn at 2 CSS px per art pixel (32×32). Each sprite shall have one motion from the table in `design.md`: spin, flap or bob.
17. The bevel style (ridge, outset, inset, double) shall draw the guestbook frame, the banner's border and the outline of images. Every style shall be exactly 6px wide as a frame, so the frame's reach (`FRAME_OUT`), the column measurement and the gutter widths are the same for all four.
18. The banner wording shall be the look's `banner` index into `BANNERS` (8 phrases). Index 0, `Welcome to my homepage!!!`, shall be the wording of Classic Crypt's preset.
19. The counter colour shall be one of four odometer digit/cell pairs (`COUNTERS`). It shall colour the HUD odometer's digits and cells and the `No souls yet.` caption, and nothing else.
20. The cursor trail shall be one of five (stars, sparkles, bats, hearts, fire): small original pixel glyphs, at most 8×8 art pixels, drawn at 2 CSS px per art pixel. A glyph shall appear when the pointer has moved 16px or more since the last glyph, fade out over 600ms, and be reused; at most 12 shall exist at once. The trail shall follow only a mouse or pen (`pointerType` not `touch`), listen read-only and passively, and sit in the shadow root with `pointer-events: none` and `aria-hidden`.
21. The layout quirk shall be one of three: `table` (the gutters as today), `leftframe` and `rightframe` (a 24px bevelled nav rail in the band colour, with a column of tile ink ticks, drawn along the inner edge of the left or right gutter). The rail shall be drawn only in a gutter of 64px or more and only in the starfield layer, under the lanes. The quirk shall move nothing: the content column, the tint, the frame, the banner and every page text rect shall be the same for all three quirks.

### The look on the page

22. The page sheet shall carry `:root { --hg-theme: <preset id>; }` in every look, including Classic Crypt. The value is the preset's id (for example `flame-skull`), whether the preset was drawn or forced.
23. The page shall still receive exactly one adopted stylesheet and no new node, attribute, class or inline style. The banner, the rail and the trail shall live in the closed shadow root.
24. The page sheet shall add the banner's height to the body's top padding: `calc(original + 48px + var(--hg-banner))`, where `--hg-banner` is 72px and 56px under 480px viewport width. The root's scroll padding shall stay at the original + 48px (the banner scrolls away). Hide shall keep the padding, as it keeps the bands' padding, because Hide keeps the haunt.
25. The banner layer shall be an absolutely positioned sibling of `#crypt-root` in the shadow root, in document coordinates (the host is static, so its containing block is the initial one), so it scrolls with the page on the compositor with no scroll handler. Its top shall be the body's padding-box top plus the body's computed top padding minus the banner height. Its left and width shall be the tint box's (the content column plus its gap), or the whole page width in full-overlay mode. It shall paint above the tint and under the bands.
26. The banner shall show, on the theme tile with the bevel border: the WordArt title in the font set's heading font, the palette's `title` colour with a hard 3px `shadow` offset, on a solid plaque; one sprite at each end; a `NEW!` line that blinks at 1 Hz; and the divider strip along its foot. At 375px wide it shall show the same pieces in 56px with no text cut and no horizontal scroll.
27. The banner shall be decorative: `aria-hidden="true"`, `pointer-events: none`, never focusable. A screen reader shall not read it.
28. On light pages the tint shall be the palette's tint with a 16×16 pale pixel pattern in the tint's own colour and a lighter web-safe step of it, multiplied over the column (`mix-blend-mode: multiply`, in `html::before` as today). The darkest colour of the pattern shall be the palette's tint itself, so no text sits on anything darker than the colour its contrast was checked on. A locked preset shall draw the plain tint, as today. On dark pages no tint is drawn, as today.
29. On light pages the link, visited and hover colours shall be the palette's, each moved to the nearest web-safe colour (RGB distance) that reaches 4.5:1 on the page background multiplied by the palette's tint. On dark pages the colours shall stay `#66ccff`, `#cc99ff` and `#ff0000` checked on the page background, as today. Links in site chrome and links dressed as buttons shall keep their colours, as today.
30. Images in `main` and `article` shall get a bevelled outline in the look's bevel style, drawn with `outline` and outer `box-shadow` only, never `border`, `padding`, `margin`, `width` or `height`, so no image moves and no layout shifts. Icons, `svg`, and `[aria-hidden="true"]` images shall be left out. A locked preset shall draw no image outline.
31. An `hr` the divider applies to shall keep its margins and its position in the flow, with `border: 0` and a height of 16px.
32. The loading cover (`cover.js`) shall take the palette's plaque colour as its ground in place of today's crypt colour. It shall compute the look from the same hostname (and, in the e2e build, the same forced preset) as the costume, so the cover and the costume agree. Its label shall reach 4.5:1 on every plaque.
33. When `import.meta.env.MODE === "e2e"` and the page URL has `?hgtheme=<id>` naming a preset, that preset shall be the look's preset (the seed still varies its axes). An unknown id shall be ignored. The parameter shall be read once, when the page is haunted.
34. The shipping build shall have no `hgtheme` code: `dist/content.js` and `dist/cover.js` shall not contain the string `hgtheme`.

### Motion, accessibility and era

35. When `prefers-reduced-motion: reduce` is set, nothing shall blink (the `NEW!` line, the blinking `h1`), spin, flap, bob, scroll or trail. The sprites shall show their first frame, the `NEW!` line shall be solid, and the trail layer shall not exist. A change of the setting while haunted shall take effect at once.
36. No blink, spin, flap, bob or fade shall run faster than 3 Hz. The `NEW!` line and the blinking `h1` blink at 1 Hz and no sprite steps faster than 2 Hz.
37. Every text and ground pair the look draws shall reach 4.5:1: the bar, the marquee, the banner title and `NEW!` line on their plaques, the odometer digit on its cell, the links on the tint, and the cover's label on the plaque. Costume text shall sit on a solid box (bar, plaque, HUD, card), never on a tile directly.
38. Every colour in the art and the CSS shall be one of the 216 web-safe colours. Every font shall be a 1990s core web font with a generic fallback.
39. Every tile, sprite, divider and glyph shall be original pixel art defined in code as pixel data. The look shall use no image file, no remote asset, no third-party logo or trademark, and no copy of a product's artwork. WordArt is a style (hard shadows, banded fills), not a copy of any product's font or clip art.
40. The feature shall add no dependency, no permission, no `host_permissions`, no `web_accessible_resources` and no manifest entry. It shall make no network request and write nothing to storage. `bun run lint:manifest` shall still pass.

### What must keep working

41. Un-haunt shall restore the page byte for byte: `document.documentElement.outerHTML` after Un-haunt shall equal what it was before Haunt, for every look. The host (with the banner layer, rail, trail and footer), the page sheet and the trail's document listeners shall be gone.
42. For every look, the footer (graveyard, HUD, 88×31 badges, sign-off), the bottom-right ghost icon and the findings strip, the secrets (Konami code, 13 clicks, `boo`, the witching hour, Halloween), the whole-site haunt and its cover, the tombstones and the curse badges, the cards, Exorcise, Hide and Show shall work as they do today.
43. The banner and the tint shall wipe in together at the haunt moment. A quiet haunt shall show the banner at once. Hide shall fade the banner, the rail and the trail with the rest of the costume, and Show shall bring them back.
44. For Classic Crypt the page sheet's restyle, tint, frame and the shadow root's bar, marquee, starfield and HUD rules shall be byte-identical to what the build produced before this feature, except for the banner's padding, the marker, the divider, the sprites and the other additions listed in criteria 22, 24 to 27 and 31. A golden test shall pin this.
45. In full-overlay mode (a phone or a full-width page) the look shall still apply: the tile dresses the bands, the 12px edge frame and the footer, the tint spans the page, there is no frame and no rail, and the banner spans the page inside the edge frame.
46. On a dark page the look shall apply (banner, tile, fonts, headings, dividers, trail) except the tint, the tint pattern and the palette's link colours (criteria 28 and 29).

### Tests and docs

47. `test/costume/themes.test.ts` (exists) shall keep its tests and gain: the forced-preset helper (criteria 33, 34) and the fixture hosts of criterion 8. It shall cover: the same host gives the same look, `www.` equals bare, 200 hostnames give 20 or more presets and mostly unique signatures, every preset times every single-axis variation passes the clash rules and the contrast checks, and every colour is web-safe (criteria 1 to 6, 11, 38).
48. `test/costume/theme-css.test.ts` (new) shall cover the CSS each axis emits, reduced motion, web-safe colours, contrast of the emitted pairs, the golden for Classic Crypt, and the banner padding (criteria 12 to 15, 17, 19, 21, 22, 24, 28 to 31, 35 to 38, 44).
49. `test/costume/theme-art.test.ts` (new) shall cover the tiles, patterns, sprites, dividers and glyphs: size, inks only, web-safe, seamless, not blank (criteria 9, 16, 20, 39).
50. `e2e/themes.spec.ts` (new) shall show that `127.0.0.1` and `localhost` fixture pages get different `--hg-theme` markers and visibly different looks, that a reload keeps the look, that the banner scrolls with the page, that the quirks move nothing, that reduced motion is static, and that Un-haunt is byte-identical (criteria 2, 8, 22, 23, 25, 35, 41, 21, 43).
51. `e2e-visual/visual.spec.ts` shall gain baselines for a few representative presets (Flame Skull Shrine, Cloud Angel Page, Matrix Hacker Den, Under Construction Zone, Classic Crypt) forced with `?hgtheme=`, at 1280 and 375 wide where stated in `tasks.md`. Every existing haunted-page baseline shall be regenerated in Docker and reviewed, because the banner moves the page down (criteria 24, 33).
52. `bun run docs:realsite` shall make stills of `https://www.nps.gov/index.htm` and `https://www.cdc.gov/` whose looks are clearly different, and `docs/real-site.json` shall record each page's `--hg-theme` marker and preset name.
53. `design/DESIGN.md` shall gain a `### Themes` section in the Costume part and `README.md` a Themes section, both describing the axes, the seed, Classic Crypt and the e2e-only parameter, and both shall state the new spec in their counts (criteria 3, 9 to 21, 33, 34).
54. `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run lint:manifest`, `bun run test:visual` and `bun run docker:test` shall pass, and `dist/` shall be rebuilt with `bun run build`.
55. Every existing unit and e2e test that measures a position below the top bands shall be updated for the banner's padding (72px, 56px under 480px), with the reason in the commit, and no assertion shall be loosened to make it pass.

## Page structure: two sites, two different 1998 homepages (added request)

The first 55 criteria change how a page is painted. This request changes how it is built: at first glance two sites must look like two different 1998 homepages, not one page in two colour schemes. The seed therefore also picks the page's **layout** (the width and the columns of its table), its **density** and **furniture** (the 1998 odds and ends round the page), the **dressing** of the page's own sections and a **prefix** sprite for its headings. The code is already written in `themes.ts` (`LAYOUTS`, `DENSITIES`, `DRESSINGS`, `PREFIXES`, `FURNITURE`, `FURNITURE_COUNT`, the clash rules), `furniture.ts` (`layoutGeometry`, `layoutCss`, `harvest`, `placeFurniture`, `buildPiece`, `buildTabs`, `buildColumn`), `theme-css.ts` (`WELCOME`, `welcomeHeight`, `lookPageCss`, `dressingCss`, `lookShadowCss`) and `render.ts`. Where criteria 22 to 27 and 44 name `--hg-banner` and the banner layer, the code names are `--hg-welcome`, `WELCOME` and `#welcome`.

### Terms (structure)

- **Layout**: one of `full`, `table640`, `table800`, `left760`, `nav2`, `rightlinks`, `links3` (`LAYOUTS`). It gives the **main cell** width, the **left** and **right** column widths and the alignment.
- **Main cell**: the width the page's own `body` is held to.
- **Furniture column**: a left or right column in the shadow root beside the main cell (`#fur-left`, `#fur-right`).
- **Bottom strip**: the furniture container (`#fur-bottom`) in the crypt footer, in normal flow just after the page.
- **Piece**: one item of furniture (`navbuttons`, `construction`, `coollinks`, `awards`, `guestbook`, `updated`, `whatsnew`, `webring`, `counter`, `bestviewed`, `tabbar`).
- **Density**: `sparse`, `normal` or `cluttered`.
- **Dressing**: how the page's outermost sections are drawn: `cells`, `fieldset`, `bullets` or `frames`.
- **Outermost section**: a `section`, `aside`, `blockquote`, `figure`, `table` or `form` that has no such element above it and is not inside site chrome (`nav`, `[role=navigation]`, `[role=banner]`, `[role=contentinfo]`, a `header` or `footer` outside `main` and `article`).
- **Prefix**: a 16×16 sprite (`skull`, `flame`, `star`) or `none`, drawn before `h2` and `h3` headings.

### The layout axis

56. The look shall have a `layout` axis with seven values: `full`, `table640`, `table800`, `left760`, `nav2`, `rightlinks` and `links3`. The table widths shall be: `table640` a 640px main cell, centred; `table800` an 800px main cell, centred; `left760` a 760px main cell, left-aligned (starting 64px from the left edge); `nav2` a 180px left column and a 620px main cell; `rightlinks` a 620px main cell and a 180px right column; `links3` a 170px left column, a 560px main cell and a 170px right column. The `nav2`, `rightlinks` and `links3` tables shall be centred. `full` shall leave the page's own width alone and shall be given to Classic Crypt only. The seed may swap `layout` for any value but `full`.
57. The geometry at viewport width `vw` shall be computed by `layoutGeometry` from the look and `vw` alone. A table (left column + main cell + right column) fits when `vw` is at least the table's width plus 64px on each side. When the whole table does not fit, the right column shall be dropped first and the table tried again, then the left column too. When even the main cell does not fit (under its width plus 128px, for example a 375px phone), the geometry shall be **collapsed**: one column, the page's own width, and every piece of furniture in the bottom strip.
58. In a layout with a main cell that fits, one set of page-sheet rules shall hold the page's own `body` to it: `max-width` the main cell width, `margin-left` the cell's x (so the page sits where the table is), `margin-right: 0`, 16px of inline padding on both sides, `box-sizing: border-box`, `width: auto`, `min-width: 0` and `overflow-x: clip`. When the geometry is collapsed, or the layout is `full`, no such rule shall be written. The rules shall be part of the one adopted page sheet and shall change no page node, attribute or inline style.
59. The guestbook frame and the tint shall go round the whole table: the content column that `computeContentColumn` measures shall be widened to the left edge of the left column (or the main cell) and the right edge of the right column (or the main cell). The starfield and the ghost lanes shall stay outside the table, in the gutters.
60. The layout shall be re-evaluated at every relayout (resize, orientation change, a change of the page's own size), so a viewport that narrows past a threshold drops the right column, then the left, then collapses, and one that widens brings them back. The pieces shall be rebuilt only when their placement changes, not on every relayout.
61. Classic Crypt shall stay locked: its layout shall be `full`, its density `sparse`, its furniture empty, its page width unchanged, and no column or bottom strip shall be drawn for it. The seed shall not swap `layout`, `density`, `dressing` or `prefix` for a locked preset.

### Furniture

62. The number of pieces shall follow the density, drawn without repeats from `FURNITURE`: 2 or 3 for `sparse`, 4 to 6 for `normal`, 7 to 9 for `cluttered`. Which pieces, and how many within the range, shall depend on the site key alone, so two sites differ and one site never changes. A forced preset's furniture shall depend on the preset id.
63. The pieces shall be:

| Piece | Content |
| --- | --- |
| `navbuttons` | Up to six raised grey 1998 buttons labelled with the page's own site links (same origin, label 2 to 22 characters, no repeats); made-up labels (`Home`, `About Me`, `My Links`, `Guestbook`, `Photos`) when the page has fewer than two. |
| `construction` | The worker sprite, `This page is under construction!` and a tape strip. |
| `coollinks` | A `Cool Links` list of up to five of the page's own outbound links (another origin, label 2 to 40 characters); made-up names when it has none. |
| `awards` | Three of a fixed list of original award names (for example `Site of the Day!`, `Top 5% of the Web`, `Spooky Site Award`), picked by the seed. |
| `guestbook` | The mailbox sprite, `Sign my Guestbook!` and `E-mail me!!`. |
| `updated` | `Last updated: m/d/yy` with a seeded date in 1997, 1998 or 1999. |
| `whatsnew` | `What's New?` with the page's own `h2` and `h3` headings (3 to 60 characters, up to three), each after a blinking `NEW!`; made-up news when it has none. |
| `webring` | A webring box: `This site is a proud member of the` / `Haunted Homepages WebRing` / `<< Prev | Random | Next >>`. |
| `counter` | `You are visitor #` and a six-digit seeded odometer drawn in pixel digits. |
| `bestviewed` | A `Best viewed at 800x600` note (or one of two other 1998 wordings). |
| `tabbar` | A bar of up to six tabs under the banner, from the page's own site links, with the same fallback as `navbuttons`. |

64. Placement shall follow these slots. `navbuttons` shall head the left column (the right when there is no left). `coollinks` and `awards` shall prefer the right column (the left when there is no right). `whatsnew`, `construction`, `guestbook` and `counter` shall go to whichever column has fewer pieces so far (the left on a tie). `webring`, `bestviewed` and `updated` shall always go to the bottom strip. `tabbar` shall go under the banner, not in a column. A piece that prefers a column that does not exist shall go to the other column, and a piece with no column shall go to the bottom strip. The bottom strip shall sit in the crypt footer in normal flow, just after the page and before the graveyard.
65. After each layout, a column that is too short for its pieces (the page is short) shall hand over its last piece, whole, to the bottom strip, repeatedly, until what is left fits. No piece shall be cut, scrolled or hidden.
66. All furniture shall live in the closed shadow root. Every column, the bottom strip and the banner shall be `aria-hidden="true"`. No piece shall be a form control or take focus. A link in a piece shall be a copy of one of the page's own `http` or `https` links (same `href`, same text), shall have `tabindex="-1"`, and shall never be the only way to reach that page, since the page's own link stays. A link with another protocol (`javascript:`, `mailto:`, `data:`) shall never be copied. A made-up piece shall have no `href`.
67. The furniture shall be read-only toward the page: it shall read the page's links and headings once per haunt (skipping the costume's own host), copy text, and write only to the shadow root. A page whose links or headings change later keeps the pieces built at haunt.
68. The tab bar shall add 28px to the banner's height: 100px for `normal` and `cluttered` looks that have it (72 + 28), 124px for a sparse look (96 + 28), and shall be hidden, with its height, under 480px viewport width. The page sheet shall pad the body's top by the banner's height (`--hg-welcome`) as it does for the banner alone.
69. Under reduced motion no piece shall animate: the `NEW!` mark in `What's New?` shall be solid, and the sprites in `construction` and `guestbook` shall show their first frame. No piece shall blink faster than 1 Hz.

### Section dressing and the heading prefix

70. The `dressing` axis shall have four values, applied to the page's outermost sections outside site chrome by page-sheet rules, with `!important`, on the element's own box, and changing no page markup:
    - `cells`: a 3px `outset` border in the palette's `bevelLight`, 8px of padding and 8px of vertical margin;
    - `fieldset`: a 2px `groove` border in the palette's `bevelDark`, padding and margin that leave room for a legend, and a `::before` pseudo-element drawn as the legend (a short original phrase on a white ground, in the palette's link colour and the font set's heading font). On a dark page `fieldset` shall draw `cells` instead, with no legend, so no light box sits on a dark ground;
    - `bullets`: every `ul` outside site chrome gets `list-style-image` of a 16×16 pixel sprite (the look's prefix sprite, or a blue ball when the prefix is `none`);
    - `frames`: images in `main` and `article` get a thick 6px `ridge` outline in `bevelLight`, drawn as `outline` with a negative `outline-offset` so nothing moves, and the sections are left plain. The other three dressings shall draw a 3px outline on images.
71. The `prefix` axis shall have four values: `none`, `skull`, `flame` and `star`. Other than `none`, an `h2` or `h3` outside site chrome shall get a `::before` of that 16×16 original pixel sprite followed by a non-breaking space. The prefix shall add no element and shall not change a heading's colour or font.
72. Dressing and prefix shall never write to a page node. They shall be rules in the page sheet, and Un-haunt shall remove them with it. A dressed page shall keep every link and control clickable, and no dressing shall hide page text.

### Density and clashes

73. A **sparse** look shall be one plain table: its layout shall be `full` or one of `table640`, `table800` and `left760` (no furniture column), its banner shall be 96px tall (the title 36px, the plaque 66px) instead of 72px, and it shall have 2 or 3 pieces, all of which therefore go to the bottom strip or the tab bar. A **cluttered** look is the only one that may have three columns (`links3`). The clash rules shall block both combinations: "a sparse site is one plain table" and "three columns are only for a cluttered site". A swap that would clash shall be skipped, as in criterion 5.
74. For every preset and every single-axis swap, the layout, density, dressing and prefix shall follow criteria 56, 61, 70, 71 and 73. Across 200 sites every layout, density, dressing and prefix shall appear and the furniture sets shall mostly differ.

### What must keep working (structure)

75. Un-haunt shall restore the page byte for byte for every layout, density, dressing and prefix: the columns, the bottom strip, the tab bar, the page-sheet rules and the copied links shall go with the host and the page sheet (criterion 41).
76. Every real link of the page shall remain visible, in the page's own place and clickable, under every layout and at every width. The furniture columns shall sit beside the main cell, never over it, and the page's own text shall never be covered by a column or the bottom strip.
77. At 375px wide, every layout shall collapse to one column with all furniture in the bottom strip, with no horizontal scroll and no text cut. Criteria 24 and 45 for full-overlay mode shall still hold.
78. The footer, graveyard, HUD, ghost icon, findings strip, secrets, tombstones, curses, cards, Exorcise, Hide and Show shall work as they do today under every layout (criterion 42). Hide shall fade the furniture columns and the bottom strip and take their links out of the pointer's reach, and Show shall bring them back.

### Tests and docs (structure)

79. `test/costume/themes.test.ts` shall have a `the structure` describe block that shows: the same host gets the same layout, density, dressing, prefix and furniture with or without `www.`; 200 sites cover every layout, density, dressing and prefix and 150 or more different furniture sets, and every piece is used; the furniture count follows the density with no piece twice, and Classic Crypt has none; a sparse site is one plain table and `links3` is only cluttered (criteria 56, 61, 62, 73, 74).
80. `test/costume/theme-css.test.ts` shall have a dressing test that shows what each dressing and prefix writes (criteria 70, 71). A furniture test file, `test/costume/furniture.test.ts`, shall cover the geometry at the widths named in criterion 57, `layoutCss`, `placeFurniture`, `harvest` and `buildPiece` (criteria 57 to 58, 63 to 67).
81. `e2e/themes.spec.ts` shall have a test named `two sites get two different page structures` that shows that the Classic Crypt host keeps the page's width with no furniture, and that the other site's body is held to a pixel `max-width` narrower than before, has at least two pieces of furniture, and leaves every real link clickable (criteria 58, 61, 63, 76). A second check shall collapse the same page at 375px wide to one column with the furniture in the bottom strip, and Un-haunt shall leave the page's HTML byte for byte as it was (criteria 57, 75, 77).
82. `design/DESIGN.md` and `README.md` shall describe the structure axes and their rules: the layouts, the density, the furniture, the dressings, the prefix, the drop order and the collapse (criteria 56 to 77).
