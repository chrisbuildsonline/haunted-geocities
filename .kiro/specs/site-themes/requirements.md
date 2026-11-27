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
