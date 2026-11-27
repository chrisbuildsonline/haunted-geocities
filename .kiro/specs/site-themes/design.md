# Design: Seeded 90s Site Looks

## Context

`themes.ts` already decides which look a site gets. This spec draws it. The work is three layers: pure art and CSS modules that turn a `Look` into pixels and rules, wiring into the two places the costume draws (the page sheet in the document, the closed shadow root), and the cover. Nothing about the page's own markup changes, and Classic Crypt keeps today's output.

Steering references: `non-destructive-dom.md`, `era-accuracy.md`, `accessibility-and-motion.md`, `product.md`, `tech.md`, `structure.md`. Requirement numbers refer to `requirements.md`.

## Files

```
src/content/costume/seed.ts           # exists: seedKey, fnv1a, mulberry32, pick
src/content/costume/themes.ts         # exists: the data model and pickLook (data fixes only, see Palette contrast)
src/content/costume/theme-art.ts      # new: pure pixel data (tiles, tint patterns, sprites, dividers, glyphs)
src/content/costume/theme-css.ts      # new: pure Look -> CSS (page rules, shadow-root rules, banner, rail, trail)
src/content/costume/theme-url.ts      # new: forcedPreset(search, mode) -> string | null
src/content/costume/theme-headings.ts # new: which headings the rainbow fill may take (measured, by structural path)
src/content/costume/trail.ts          # new: the cursor trail (a pool of 12 glyph elements)
src/content/costume/page-theme.ts     # themeFor and restyleCss take the look
src/content/costume/body-padding.ts   # addPageSheet takes the look: marker, banner padding, theme rules
src/content/costume/column-layers.ts  # the tint pattern and the bevelled frame
src/content/costume/starfield.ts      # paintTile takes pixel lists; STAR_TILE stays the crypt stars tile
src/content/costume/styles.ts         # costumeCss(look, art): palette bar, marquee, tile, counter
src/content/costume/bands.ts          # no change to markup; colours come from CSS
src/content/costume/hud.ts            # the odometer strip takes the counter colours
src/content/costume/render.ts         # pickLook once per haunt; banner layer, rail, trail, reveals, hide/show
src/cover/cover.ts                    # the plaque colour from the look
design/DESIGN.md                      # "### Themes" in the Costume part
README.md                             # a Themes section
test/costume/themes.test.ts           # exists; extended
test/costume/theme-css.test.ts        # new
test/costume/theme-art.test.ts        # new
test/costume/__golden__/classic-crypt.json  # new: today's Classic Crypt output, captured before any change
e2e/themes.spec.ts                    # new
e2e-visual/visual.spec.ts             # a few preset baselines
scripts/real-site.pw.ts               # records the marker and preset name per page
```

`seed.ts`, `theme-art.ts`, `theme-css.ts` and `theme-url.ts` import nothing from `chrome` and touch no DOM, so `cover.ts` can bundle `themes.ts` and `seed.ts` into the IIFE without pulling in the content script.

## The look, once per haunt

```ts
// render.ts, inside renderCostume, before the page sheet:
const forced = forcedPreset(win.location.search, import.meta.env.MODE);
const look = pickLook(win.location.hostname, forced);
```

```ts
// theme-url.ts
export function forcedPreset(search: string, mode: string): string | null {
  if (mode !== "e2e") return null;
  const id = new URLSearchParams(search).get("hgtheme");
  return id && PRESETS.some((p) => p.id === id) ? id : null;
}
```

Vite replaces `import.meta.env.MODE` with a literal at build time, so in the shipping build `forcedPreset` is dead code behind `mode !== "e2e"` and the minifier drops the `URLSearchParams` line with the string `hgtheme` (criterion 34; the build check in the tasks greps `dist/` to prove it). The look is computed once and passed to everything below. A site haunt re-computes it on each new page from that page's hostname, which gives the same look.

## Art (`theme-art.ts`)

All art is data: `Px[]` lists (`{ x, y, w, h, color }`, the type `art.ts` already exports) and character maps drawn with `mapToPx`. Turning it into a URL is `svgUrl` (sprites, dividers, glyphs, patterns) or one canvas paint (tiles), as the code does today.

```ts
export const TILE_SIZE = 64;
export function tilePixels(tile: Tile, pal: Palette): Px[];           // ground first, then the motifs
export function tilePattern(tile: Tile, pal: Palette): { size: 16; px: Px[] };  // the tint pattern
export const SPRITES: Record<SpriteName, readonly string[]>;          // 16 rows of 16 chars each
export const SPRITE_MOTION: Record<SpriteName, "spin" | "flap" | "bob">;
export function spriteUrl(name: SpriteName): string;
export function dividerUrl(kind: Divider, pal: Palette): string;      // 16px tall, repeats on x
export const GLYPHS: Record<Trail, readonly (readonly string[])[]>;   // one or two 8x8 frames per trail
```

**Tiles.** A tile is a function from a palette to pixels, built from a motif of at most 12×12 placed whole at fixed offsets, so no motif crosses the tile's edge and the tile repeats without a seam. Rows or columns that must continue across the edge (bricks, checker) use a period that divides 64.

| Tile | Motif |
| --- | --- |
| stars | Today's `STAR_TILE`: 6 single `a1` pixels, 2 `a2` 2×2 stars, one 5×5 `a3` twinkle. With the crypt palette the pixels equal `STAR_TILE`'s. |
| flames | Rows of 3-colour flame tongues (`a1` red body, `a2` middle, `a3` tip) rising from the bottom edge. |
| bricks | Offset brick rows, mortar in `a3`, bricks in `a1` and `a2`. |
| clouds | Three 12×6 puffs in `a1`, shaded in `a2`, a few `a3` sparkles. |
| matrix | Columns of 1×3 falling glyph dashes in `a1`, with a brighter head in `a3` and a dim tail in `a2`. |
| slime | Blobs and drips in `a1` with `a2` shade and `a3` highlights. |
| checker | 8px squares, `a1` and `a2` alternating. |
| web | A spiderweb corner in `a1` with `a2` threads and a small `a3` spider. |
| hearts | Two 7×6 hearts in `a1` and `a2` with `a3` sparkles. |
| planets | A ringed planet, a moon and stars in `a1`, `a2`, `a3`. |

The ground covers at least 60% of every tile, so the tile stays a background and not a pattern fighting the plaque on top. A test checks it.

**Tint pattern.** `tilePattern` takes the same motif family as the tile, reduced to a 16×16 one-bit mask, and draws the mask in the tint's lighter step (`lighter(tint)`: each channel moved one web-safe step toward `#ff`, capped) on a ground of the tint. White pages multiplied by it give old paper with pale marks, and black text stays black. The darkest colour in the pattern is the tint itself, so criterion 28 holds: the contrast check on the tint is the worst case.

**Sprites.** Twelve 16×16 maps, each with a legend of at most 4 web-safe colours, a transparent `.` and a `#000033` outline. `spriteUrl` renders at 2 CSS px per art pixel. Motion by sprite:

| Sprite | Motion | How |
| --- | --- | --- |
| skull, alien, globe | spin | `scaleX` 1, 0, -1, 0, 1 in `steps(4)` over 2s: 2 steps per second |
| bat, envelope | flap | `scaleY` 1, 0.6 in `steps(2)` over 1s: 1 Hz |
| worker, cone, mailbox, ufo, computer, heart, cat | bob | `translateY` 0, -3px in `steps(2)` over 1s: 1 Hz |

No sprite steps faster than 2 Hz (criterion 36). The implementation keeps every `animation-duration` at 500ms or longer, and `theme-css.test.ts` checks it.

**Dividers.** Five strips, 16px tall (8 art px at 2 CSS px), with a repeat width of 32px or 48px so they tile on the x axis, on a transparent ground: flames (a row of tongues in `a1`, `a2` and `a3`), skulls (a row of 5×5 skulls in `a1` separated by `a3` dots), tape (45° hazard stripes in `a3` and `#000000`), rainbow (six hard-edged 1-art-px bands from `RAINBOW`, which are web-safe and read on every tint), drips (slime drips hanging from the top edge in `a1` with `a3` highlights).

**Glyphs.** Five trail sets, each one or two 8×8 frames in the palette's inks (stars, sparkles) or fixed web-safe colours (bats `#000000` on `#cc99ff`, hearts `#ff3399`, fire `#ff6600` and `#ffcc00`). They are drawn as `svgUrl` backgrounds on the pooled elements.

## CSS (`theme-css.ts`)

Pure functions. None reads the DOM.

```ts
export function themePageCss(look: Look, o: { dark: boolean; headings: HeadingPaths }): string;
export function themeCryptCss(look: Look, art: ThemeArt): string;
export function bannerCss(look: Look, art: ThemeArt): string;
export function bevelRings(bevel: Bevel, pal: Palette): BevelRecipe;
export const BANNER_HEIGHT = { wide: 72, narrow: 56 } as const;
```

`ThemeArt` is the resolved URLs (tile, twinkle, sprites, divider, pattern, glyphs) so the CSS functions stay pure and a test can pass fakes.

### Page sheet rules (`themePageCss`)

```css
:root { --hg-theme: flame-skull; --hg-banner: 72px; }
@media (max-width: 479px) { :root { --hg-banner: 56px; } }
```

- **Fonts.** `restyleCss` takes `FONT_SETS[look.fonts]` in place of the two constants. For Classic Crypt the strings are the ones used today (`classic`: Times New Roman body, the comic stack for headings), so its output is unchanged.
- **Headings.**

| Style | Rule |
| --- | --- |
| comic | The set's heading font. Nothing else. |
| wordart | `text-shadow: 2px 2px 0 <shadow>`. |
| rainbow | On the headings `theme-headings.ts` lists: six hard bands as a background, clipped to the text (see below). |
| outline | `text-shadow: -1px 0 <glow>, 1px 0 <glow>, 0 -1px <glow>, 0 1px <glow>, 0 0 3px <glow>`. |
| blink | `h1:first-of-type` gets `animation: hg-blink 1s steps(1) infinite`, in a `no-preference` media query; other headings are comic. |

The rainbow fill is `background-image` of a pixel-band data URL (six 4px bands, repeating on y), `background-clip: text` with `-webkit-text-fill-color: transparent`, and a solid `color: <RAINBOW[0]>` before it as the fallback. A heading qualifies when its computed colour has luminance under 0.4 and it is not inside a dark block (the same rule page-blocks uses for "dark ground"). `theme-headings.ts` measures that once per relayout, like `findBlocks`, and returns structural paths (`body > :nth-child(i) > …`) so no page node changes. A heading it does not list keeps its colour. Every band is checked at 4.5:1 on the tint by the clash rule, and a heading on a light page without a tint (a dark page) is never listed because the rule needs a light ground.

- **Dividers.** `hr:where(:not(nav *, [role="navigation"] *, header:not(main *, article *) *, footer:not(main *, article *) *, form *))` gets `border: 0 !important; height: 16px !important; background: url(<divider>) repeat-x center / auto 16px !important; image-rendering: pixelated;`. `margin` stays.
- **Images.** `:where(main, article) img:not(<KEEP icons>, [aria-hidden="true"])` gets the bevel recipe's `outline` and outer `box-shadow` rings. A locked look emits none.
- **Links.** `themeFor(pageBg, look)`: on a light page the base colours are the palette's `link`, `visited` and `hover` and the contrast target is `multiply(pageBg, palette.tint)`; on a dark page the bases are today's `PAGE.darkLink`, `darkVisited` and `hover` on the page background. `ensureContrast` moves a colour that misses 4.5:1 to the nearest web-safe colour that reaches it, as today. A locked look's palette is the crypt palette, whose `link`, `visited` and `hover` equal `PAGE`'s, so its output does not change.
- **Padding.** `body-padding.ts` replaces `bands` in `body { padding-top: calc(${top} + ${bands}px) }` with `calc(${top} + ${bands}px + var(--hg-banner))`. The scroll padding keeps `bands` alone.

### Bevels (`bevelRings`)

A bevel is a 6px frame recipe `{ border: [light, dark, ...], inner: shadows[] }` for `html::after`, and a 3px outline recipe for images. The frame keeps today's two 3px bands as the ridge. Each style is 6px wide.

| Style | Frame (outer 3px band, inner 3px band) | Image outline |
| --- | --- | --- |
| ridge | outer band light top-left and dark bottom-right; inner band reversed (today) | a 3px `outline` in `<dark>` and one outer `box-shadow` ring in `<light>` |
| outset | both bands light top-left, dark bottom-right | a 3px `outline` in `<dark>` and outer `box-shadow` offsets `-3px -3px` in `<light>` |
| inset | both bands dark top-left, light bottom-right | the reverse of outset |
| double | outer 2px line in `bevelDark`, a 2px gap, an inner 2px line in `bevelDark` | a 2px `outline` in `<dark>` with `outline-offset: 2px` and a `box-shadow` ring in `<light>` |

The exact values are written in `theme-css.ts` and pinned by tests. The rule for all four: the frame is 6px wide in total, and the image rule contains `outline` and `box-shadow` but none of `border`, `padding`, `margin`, `width`, `height` or `transform` (criterion 30). A shadow ring sits outside the box, and an outline paints over it, so the recipes are checked by a visual baseline as well as by the text test.

### Tint pattern (`columnLayersCss`)

`columnLayersCss({ tint, frame, hidden, look })`. The tint rule becomes `background: <tint> url(<pattern>) !important` with `image-rendering: pixelated`; a locked look keeps `background: ${PAGE.parchment}`. The frame rule takes the bevel's recipe and `palette.bevelLight`, `bevelDark` and `glow`; for the crypt palette and the ridge these are today's `#9999cc`, `#333366` and `#6633cc`, which `tokens.ts` already names as `PAGE.frameLight`, `frameDark` and `glow`, so the output for Classic Crypt is unchanged.

## Shadow-root rules (`themeCryptCss`, `costumeCss(look, art)`)

`costumeCss` gains the look and a `ThemeArt` and keeps its signature's old arguments as defaults, so a call without a look still draws the crypt. The changes:

- `.fill`, `.ef`, `.edge`, `.ef-dither` and the footer's `background-image` use `art.tile` and the palette's `ground` instead of `stars` and `P.crypt`. The twinkle layer (`.fill::after`) is emitted only when `look.tile === "stars"`.
- `#neighborhood` takes `band`, `bandText` and a bottom edge in `glow`. `#marquee` and `.marquee-track` take `plaque` and `plaqueText` and keep the marquee's plaque rule (stars never touch the text).
- `#crypt-footer` takes `art.tile` and the palette's `ground`. The sign-off sits on a plaque pill (`background: plaque; color: plaqueText`).
- The HUD, graveyard, cards, findings strip, ghost icon and every ghost and vampire keep their rules, with the stars tile as today.
- `.strip` (the odometer digits) and `.hits .none` take `COUNTERS[look.counter]`: `digitsUrl(color)` replaces `digitsUrl()`, and the cell ground is the pair's `cell`.

### The banner layer

```html
<div id="banner" class="banner" aria-hidden="true">          <!-- sibling of #crypt-root and #crypt-footer -->
  <img class="spr l" alt="">  <p class="title">Welcome to my homepage!!!</p>  <img class="spr r" alt="">
  <p class="new">NEW! Sign my guestbook!</p>
  <div class="rule"></div>
</div>
```

`#banner { position: absolute; z-index: 2147483646; pointer-events: none; box-sizing: border-box; }` with `top`, `left`, `width` set from `measure()` and `height: var(--hg-banner)`. The host is `position: static`, so the banner's containing block is the initial one and it scrolls with the document, as the tint and frame do. It paints above `html::before` (same z-index, later in tree order) and under `#crypt-root` (max z-index).

Inside: the theme tile as the background on `ground`, the bevel's frame as `border`/`box-shadow`, the title on a solid `plaque` pill (the title never sits on a tile), `.new` in `plaqueText` on `plaque`, the divider strip as `.rule`'s background along the foot. Title font: `FONT_SETS[look.fonts].heading`, 28px (22px under 480px), `title` colour, `text-shadow: 3px 3px 0 <shadow>`. The two sprites are `SPRITES[...]` of the look's pair, `spr l` the first and `spr r` the second. Layout at 72px: bevel 6, title row 32, `NEW!` line 14, divider 16 (the numbers are tuned in the implementation and pinned by the e2e check that nothing is clipped and nothing overflows at 375).

Animation, in `@media (prefers-reduced-motion: no-preference)` and switched off by `.reduced-motion` on the layer (the class `watchReducedMotion` toggles on `croot` and `footer` toggles on `#banner` too, so a live change works): `.new { animation: hg-new 1s steps(1) infinite }` (visible 0.5s, hidden 0.5s, 1 Hz), and the motion from the sprite table on `.spr`. Under reduced motion, no animation and `.new` stays visible.

`measure()` in `render.ts` places it:

```ts
const bodyTop = doc.body.getBoundingClientRect().top + win.scrollY;
const padTop = parseFloat(win.getComputedStyle(doc.body).paddingTop);      // already includes the banner
const top = bodyTop + (parseFloat(cs.borderTopWidth) || 0) + padTop - bannerHeight(vw());
banner.style.cssText = `top:${top}px; left:${tint?.left ?? 0}px; width:${tint?.width ?? width}px`;
```

`bannerHeight(vw)` is 72 or 56 by the same 480px breakpoint as `--hg-banner`. Both are read from one constant, `BANNER_HEIGHT`, in `theme-css.ts`. In full-overlay mode the left is 12px and the width is the page width minus 24px (inside the edge frame).

### The layout rail

In lane mode, `layoutStarfield` creates the gutters (`.gutter.left`, `.gutter.right`). For `leftframe` and `rightframe` it adds one `.rail` to the named gutter when that gutter's width is 64px or more:

```css
.rail { position: absolute; top: 0; bottom: 0; width: 24px; background: <band> ; /* bevel recipe */ }
.left .rail { right: 16px; }   .right .rail { left: 16px; }   /* 16px: the dithered edge toward the column */
.rail::after { /* a column of 8px ticks in tile ink a2, as a repeating pixel strip */ }
```

It is a child of the gutter (z 1 in `#starfield`, under the lanes at z 2), `pointer-events: none`, with no text. `gutterWidths` and `computeContentColumn` are not given the quirk, so every measurement is independent of it (criterion 21).

### The cursor trail (`trail.ts`)

```ts
export function mountTrail(o: { win: Window; layer: HTMLElement; kind: Trail; reduced: () => boolean; art: ThemeArt }): { stop(): void };
```

A `#trail` layer in `#crypt-root` (z 8, `pointer-events: none`, `aria-hidden`) holds a pool of 12 glyph elements. A passive `pointermove` listener on `win` ignores `pointerType === "touch"`, and when the pointer is 16px or more from the last glyph it takes the next pool element (oldest first), puts it at the pointer, and restarts its `hg-trail` animation: opacity 1 to 0 and `translateY(0)` to `translateY(8px)` over 600ms, `animation-fill-mode: forwards`. Nothing is created under reduced motion: `mountTrail` returns a no-op `stop` and `render.ts` calls it again when `watchReducedMotion` fires, so a live switch adds or removes the listener. `stop()` removes the listener and the layer's children. Hide hides the layer with the rest of `#crypt-root`'s children (`.costume-hidden > :not(#show-tab)`).

The pool means the trail adds at most 12 elements ever, and the listener is read-only: it reads `clientX` and `clientY` and writes only to the shadow root.

## Wiring in `render.ts`

```ts
const look = pickLook(win.location.hostname, forcedPreset(win.location.search, import.meta.env.MODE));
const art = themeArt(doc, look);                       // tile url (canvas), pattern, sprites, divider, glyphs
sheet.replaceSync(costumeCss(look, art));
const page = addPageSheet(doc, look);
page.set({ theme, blocks, headings: findHeadings(doc, { darkPage: theme.dark }) });
```

- `buildBands` and `buildStarfield` are unchanged. `layoutStarfield` gets the quirk.
- `banner` is built with the other layers, appended to `root` next to `croot` and `footer`, and gets the `reduced-motion`, `tab-hidden` and `costume-hidden` classes in the same loops that give them to `croot` and `footer` today.
- `measure()` places the banner and calls `page.set` as today. `reveals()` returns the tint, the frame and the banner. Before writing the task for this, read `Reveal` in `haunt-moment.ts`: it takes `{ el, pseudo, left }` today, so the banner needs either a `pseudo`-less form or a small extension, with a haunt-moment test.
- `onUnhaunt` stops the trail (it removes the listener) and the existing `page.remove()` and host removal take everything else with them.

## The cover

`cover.ts` calls `pickLook(doc.location.hostname, forcedPreset(doc.location.search, import.meta.env.MODE))` once in `show()` and uses `PALETTES[look.palette].plaque` for `.screen`'s `background-color` and its `::before` ground in place of `P.crypt`. The label's colour stays `P.bone`. Every plaque is dark, and the test checks `contrastRatio(P.bone, plaque) >= 4.5` for all nine. `cover.ts` imports `themes.ts` and `seed.ts` only, which import `page-theme.ts` for the contrast helpers; `page-theme.ts` has no DOM access at import time, so the IIFE stays self-contained.

## Palette contrast (data fixes)

`themes.test.ts` already walks every palette's text pairs. If a pair fails, the fix is in `themes.ts`'s `PALETTES` (the nearest web-safe colour that passes), made in the task that finds it, with the failing pair named in the commit. `PRESETS` order is part of the seed. If `nps.gov` and `cdc.gov` ended up with presets too alike to read as different (same tile and palette), reorder or edit before release, because no site has seen a look yet, and the `themes.test.ts` fixture-hosts test pins the four distinct presets.

## Golden for Classic Crypt (criterion 44)

Before any production change, a task captures the output of `restyleCss(themeFor(white))`, `columnLayersCss(...)` and `costumeCss(...)` (tile URLs masked) for fixed inputs into `test/costume/__golden__/classic-crypt.json`. Later tasks run against it. The golden is allowed to differ only by the additions listed in criterion 44; the test strips those (marker, banner padding, divider rule, banner rules) before comparing and fails on anything else.

## Interaction with other specs

- **costume-renderer**: the haunt moment is unchanged; the banner joins the wipe through `reveals()`. The page sheet keeps one adopted sheet. Body padding grows by the banner height, so every spec that measures below the bands moves (criterion 55).
- **site-haunt**: the quiet haunt shows the banner at once. The cover matches the look by recomputing it. The marker `--hg-theme` is per document and gone with the sheet.
- **crypt-footer**: the footer's ground takes the tile. The graveyard, HUD, badges, sign-off text colour, ghost icon and findings strip keep their rules. The secrets use `say()` on the marquee, which is unchanged.
- **neighborhoods**: the address and tagline are unchanged; only the bar's colours change.
- **tombstones and dark patterns**: markers and badges sit in `#markers` at z 3 and are unchanged.
- **runtime-vampires**: no interaction.
- **sound-effects**: no interaction.
- **accessibility-and-motion**: all new motion is in `no-preference` media queries and in `.reduced-motion` overrides; the trail is not created under reduced motion.

## Known limits

- The Docker image has Comic Neue and the system's fallback fonts only, so a look with Arial, Impact, Courier New, Verdana or Georgia shows the fallback in the baselines. The CSS is the same on a machine that has them.
- The banner sits in the page's top padding. A page whose first content is `position: fixed` or `sticky` at the top keeps today's behaviour with the bands (they move below it), and the banner then scrolls away under that content as the page does.
- On a very narrow page a long banner phrase wraps to two lines inside its plaque; the 56px height is tuned for the 375px case, and the e2e check fails if text is clipped.
- The rainbow heading fill applies to headings measured as dark on a light ground. A heading that changes colour on hover (a link inside a heading) keeps the page's colour for its link state.
- `?hgtheme=` is read once when the page is haunted. The next page of a site haunt has no parameter and uses the seed look.

## Testing

**`test/costume/themes.test.ts`** (exists). Already covers: seed algorithms, same host same look, `www.` equals bare, 22 presets with unique ids and names, option spreads, 200 hosts with 20+ presets and 190+ signatures, two or three varied axes without clash, Classic Crypt locked, the four fixture hosts distinct, the forced preset, web-safe colours, palette text pairs, and every preset times every single-axis variation. Added: `forcedPreset` returns `null` unless `mode === "e2e"`, ignores an unknown id and a missing parameter; the cover plaque contrast with `P.bone`; every plaque luminance under 0.1.

**`test/costume/theme-art.test.ts`** (new). For every tile and palette: pixels inside 64×64, colours only the four inks, ground covers 60% or more, at least two inks used, a 2×2 tiling has no seam at the edges for the motifs that run across (bricks, checker). The stars tile with the crypt palette equals `STAR_TILE`'s pixels. The tint pattern: 16×16, two colours, the darker is the tint, the other is its lighter web-safe step. Sprites: 12 maps of 16×16, at most 4 colours plus transparent, an outline of `#000033`, every colour web-safe, no two sprites identical. Dividers: 16px tall, web-safe. Glyphs: at most 8×8.

**`test/costume/theme-css.test.ts`** (new).
- Per axis: each tile gives a different `background-image` in `costumeCss`; `wordart` emits the hard `2px 2px 0` shadow and no blur; `outline` emits four 1px shadows in `glow`; `rainbow` emits the band image and `background-clip: text` only for listed headings; `blink` emits one `hg-blink` rule on the first `h1`; each divider gives its URL on `hr`; each bevel gives a frame of 6px; the images rule has `outline` and `box-shadow` and none of `border`, `padding`, `margin`, `width`, `height`, `transform`; a locked look emits no image rule and the plain tint.
- Fonts: every `font-family` in the emitted CSS comes from `FONT_SETS` (so only core web fonts).
- Marker: `--hg-theme: <id>` is in the page rules for every preset.
- Padding: the body rule contains `var(--hg-banner)`, `--hg-banner` is 72px and 56px under 479px, and `scroll-padding-top` does not.
- Reduced motion: every `animation` property appears inside `@media (prefers-reduced-motion: no-preference)`, or the same selector has a `.reduced-motion` rule with `animation: none`; every `animation-duration` is 500ms or longer (3 Hz at most); no `text-decoration: blink`.
- Colours: every hex in the emitted CSS is in `WEB_SAFE`.
- Contrast: for every palette, the emitted pairs reach 4.5:1: bar, marquee, banner title and `NEW!` on the plaque, odometer digit on cell, links on the tinted background.
- Golden: Classic Crypt's output equals `__golden__/classic-crypt.json` after the allowed additions are stripped.
- Quirk: `themeCryptCss` for `leftframe` has one `.rail` in `.left`, `rightframe` one in `.right`, `table` none, and the page rules are identical across the three.

**`test/costume/render.test.ts`, `stylesheet.test.ts`, `body-padding.test.ts`, `column-layers.test.ts`** gain the wiring checks: the banner layer exists and is `aria-hidden`; the trail layer is absent under reduced motion; `renderCostume` adds exactly one adopted sheet to the document; Un-haunt removes the layers and the listener (a spy on `win.removeEventListener` for `pointermove`).

**e2e (`e2e/themes.spec.ts`).** The fixture pages on `127.0.0.1:4321` and `localhost:4321` (a different site, as in `site-haunt`).
1. `127.0.0.1` and `localhost` give different `--hg-theme` values, and `127.0.0.1` gives `classic-crypt`.
2. The looks differ visibly: the computed body `font-family`, the `html::before` background image and a shadow-root screenshot differ between the two pages.
3. A reload keeps the marker and the look.
4. The banner scrolls with the page: its `getBoundingClientRect().top` falls by the scroll distance while the top bands stay.
5. The banner is under the bands and above the content: the first content element's top is at or below the banner's bottom, and the banner's bottom equals the body's content start.
6. The quirks move nothing. `fonts` and `tile` are never swapped by the seed, so presets with the same font set lay out the same text. The test forces `spiderweb-attic`, `haunted-dungeon`, `love-shack` and `lava-lounge` (all `georgia`) and checks that the first paragraph's rect, the tint box and the banner's rect are equal across them, whatever quirk the seed left each with. A unit test in `theme-css.test.ts` and `starfield.test.ts` shows that the quirk is not an input to `computeContentColumn` or `gutterWidths`. The test also reads the page's `.rail` count from the shadow root through the test hook the other specs use (`shadowOf`) and checks that it matches the look's quirk, read from a `data-quirk` attribute the shadow host's `#crypt-root` carries in the e2e build only (`import.meta.env.MODE === "e2e"`).
7. Reduced motion: with `reducedMotion: "reduce"`, no `#trail` layer exists, `.new` has `animation-name: none` and the sprites have no animation.
8. The trail: with motion allowed, moving the mouse in steps adds glyphs, never more than 12 at once.
9. Un-haunt: `document.documentElement.outerHTML` equals the string captured before Haunt, for three forced presets.
10. The footer, ghost icon, findings strip and a card still work under a non-classic preset (smoke).

**Visual (`e2e-visual/visual.spec.ts`).** Five presets forced with `?hgtheme=` on `article.html` at 1280: `flame-skull`, `cloud-angel`, `matrix-den`, `construction-zone`, `classic-crypt`; and two of them (`flame-skull`, `cloud-angel`) at 375. The existing haunted-page shots are regenerated because the banner moves the page down. Baselines are made in Docker with `bun run visual:baselines` and every changed PNG is looked at.

**Real site (`bun run docs:realsite`).** The script already films `nps.gov` and `cdc.gov`. It additionally reads `--hg-theme` and the look's name from the page after the haunt and writes them into `docs/real-site.json`. The task fails if the two markers are equal, and the stills are looked at to confirm they differ in tile, palette and heading.

## Page structure (added request)

Requirement numbers 56 to 82. This part is already in the code (`themes.ts`, `furniture.ts`, `theme-css.ts`, `render.ts`). It is written down here so the tasks, the tests and the docs have one source. Names in the code differ from the first part of this document in one place: the banner is `#welcome`, its height is the custom property `--hg-welcome`, and its sizes are the `WELCOME` constant in `theme-css.ts` (72px, 96px sparse, 56px phone, 28px tab bar, phone below 480px).

### Files (structure)

```
src/content/costume/themes.ts       # LAYOUTS, DENSITIES, DRESSINGS, PREFIXES, FURNITURE, FURNITURE_COUNT, the clash rules, pickLook (furniture)
src/content/costume/furniture.ts    # layoutGeometry, layoutCss, harvest, placeFurniture, buildPiece, buildTabs, buildColumn
src/content/costume/theme-css.ts    # WELCOME, welcomeHeight, lookPageCss, dressingCss, lookShadowCss (columns, bottom strip, tab bar)
src/content/costume/render.ts       # geometry per measure(), fill(), the overflow hand-over, widen() for the frame and tint
test/costume/themes.test.ts         # the structure describe block
test/costume/theme-css.test.ts      # the dressing test
test/costume/furniture.test.ts      # new: geometry, layoutCss, placement, harvest, pieces
e2e/themes.spec.ts                  # two sites get two different page structures
```

### The layout axis

`LAYOUTS` is data: `{ main, left, right, align }`.

| Layout | Left | Main | Right | Align | Needs `vw` of |
| --- | --- | --- | --- | --- | --- |
| `full` | 0 | 0 (the page's own width) | 0 | n/a | n/a |
| `table640` | 0 | 640 | 0 | centre | 768 |
| `table800` | 0 | 800 | 0 | centre | 928 |
| `left760` | 0 | 760 | 0 | left, x = 64 | 888 |
| `nav2` | 180 | 620 | 0 | centre | 928 |
| `rightlinks` | 0 | 620 | 180 | centre | 928 |
| `links3` | 170 | 560 | 170 | centre | 1028 |

`layoutGeometry(look, vw)` tries `(left, right)`, then `(left, 0)`, then `(0, 0)`. A try fits when `vw >= left + main + right + 2 * SIDE_ROOM` (`SIDE_ROOM` is 64, the starfield the table leaves each side). The first that fits gives the spans (`x0` is `floor((vw - total) / 2)` centred or 64 left-aligned; left column at `x0`, main at `x0 + left`, right at `x0 + left + main`). None fits: `{ collapsed: true }` with no spans. At 1280 `links3` fits whole; at 1000 it drops the right column (the left and main cell need 858), below 858 it drops the left too, and below 688 (main 560 + 128) it collapses; at 375 every layout collapses. The right column goes first because the nav frame is the more useful half of a 1998 table.

`layoutCss(geometry)` returns one rule and nothing for a collapsed or `full` geometry:

```css
body { box-sizing: border-box !important; width: auto !important; min-width: 0 !important; max-width: <main>px !important;
       margin-left: <x>px !important; margin-right: 0 !important; padding-left: 16px !important; padding-right: 16px !important;
       overflow-x: clip !important; }
```

`CELL_PAD` is the 16px. `overflow-x: clip` stops a wide child from escaping the cell without making the body a scroll container, so `position: sticky` and the page's own scrolling keep working. `render.ts` appends the rule to `lookPageCss(...)` in the page sheet's `css` callback, so it is part of the one adopted sheet and Un-haunt removes it with the sheet.

**The frame and the tint go round the table.** In `measure()`, `computeContentColumn(doc)` measures the page's own text column, which is now the main cell. `widen(col)` stretches it to the left edge of the left column (or the main cell) and the right edge of the right column (or the main cell), and the tint box and the frame box are drawn from the widened column. The gutters (`gutterWidths`) are computed from the widened column, so the ghost lanes and the starfield stay outside the table. If the widened column leaves under 64px of gutter the page falls into full-overlay mode, as it always has.

`measure()` runs on every relayout, so `geom` is recomputed from `documentElement.clientWidth` each time. `fill()` rebuilds the three containers only when `JSON.stringify(placeFurniture(look.furniture, geom))` changes, so a resize inside one band rebuilds nothing.

### Furniture

`pickLook` gives `look.furniture`: `pickFurniture(rnd, density)` takes `n = lo + floor(rnd() * (hi - lo + 1))` pieces without repeats from `FURNITURE`, `[lo, hi]` from `FURNITURE_COUNT` (`sparse` 2 to 3, `normal` 4 to 6, `cluttered` 7 to 9). For a drawn preset it uses the same generator that varied the axes, so it depends on the site key alone. A forced preset uses `mulberry32(fnv1a(id))`. A locked preset gets `[]`.

`harvest(doc, skip)` reads the page once at haunt time. It walks `a[href]` outside the costume's own host (`skip`), parses `a.href`, keeps only `http:` and `https:`, takes the text, and drops labels under 2 characters and repeats (case-insensitive). A same-origin link of 22 characters or fewer goes to `nav` (up to 6), another origin with up to 40 characters goes to `out` (up to 5). `headings` are the `h2` and `h3` texts of 3 to 60 characters, the first three. It returns plain strings and URLs, never nodes.

`buildPiece(doc, piece, look, harvest)` makes one `div.fur.fur-<piece>` and, for a link, `link()`: an `a` with the copied `href`, `tabIndex = -1`, and the original text; with no `href` a `span`. Digits, award names and dates come from `mulberry32(fnv1a(`${site}:${piece}`))`, so a piece is the same on every page of the site. Sprites are `spriteSvg(name)` from `theme-art.ts`. The odometer is built from a 3×5 digit font drawn as pixel SVG.

**Placement** is `placeFurniture(items, geometry)`, pure:

| Piece | Wants |
| --- | --- |
| `navbuttons` | left (sorted first, so it heads the column), else right |
| `coollinks`, `awards` | right, else left |
| `whatsnew`, `construction`, `guestbook`, `counter` | the column with fewer pieces so far, the left on a tie |
| `webring`, `bestviewed`, `updated` | bottom strip |
| `tabbar` | not in a column: `buildTabs` under the banner |

A wanted column that does not exist in the geometry means the other one; if neither exists the piece goes to the bottom strip. A collapsed geometry therefore puts all the furniture (the tab bar aside) in the strip.

**Overflow.** After `measure()` sizes the columns from under the banner to the footer, a short page leaves a short column. A loop moves `lastElementChild` of any column whose `scrollHeight > clientHeight` to the front of the bottom strip, one whole piece at a time. Nothing is clipped or scrolled.

**The shadow root.** `#welcome`, `#fur-left`, `#fur-right` and the footer's `#fur-bottom` are siblings or children of the shadow root and are `aria-hidden`. Columns are `position: absolute` in document coordinates (left `span.x + scrollX + 4`, width `span.w - 8`, top under the banner + 8, down to the footer's top - 8), `pointer-events: none`, with `a` set to `pointer-events: auto` so a copied link still works for a mouse and stays out of the tab order. Columns are `hidden` in full-overlay mode. They get the `costume-hidden` class with the banner in Hide (opacity 0, links' pointer events off) and come back with Show.

The styling is in `lookShadowCss`: a band-coloured frame cell for each column with the bevel's outline, `.fur` boxes on the plaque colour with the plaque text, `.navbtn` grey raised buttons, `.award` gold ribbons, `.news` with a `.new` mark that blinks at 1 Hz in `no-preference` and stays solid under `.reduced-motion`, `.tape` strip, `.odo-fake` odometer. All colours are web-safe; the text sits on a plaque.

**Tab bar.** `buildTabs` appends `div.wb-tabs` to `#welcome`: up to six tabs from the `nav` harvest (the same fallback as `navbuttons`). `welcomeHeight(look)` is `72` (or `96` when sparse) plus `28` when the look has `tabbar`. The bar is 24px with a 2px margin and `display: none` under 480px, where `--hg-welcome` is 56px with no extra. The page sheet's body padding uses `--hg-welcome`, so the banner and the tab bar never cover the page.

### Dressing and prefix (`dressingCss`)

`dressingCss(look, dark)` returns an array of page-sheet rules. `NOT_CHROME` is `:not(nav *, [role="navigation"] *, [role="banner"] *, [role="contentinfo"] *, header:not(main *, article *) *, footer:not(main *, article *) *)`. `TOP_SECTIONS` is the outermost `section, aside, blockquote, figure, table, form` (`:not(:is(...) *)`) with `NOT_CHROME`, so a nested section never gets a second box. Specificity stays low with `:where` for the element and `!important` on the declarations, so the page's own rules lose and nothing needs an inline style.

| Dressing | Rules |
| --- | --- |
| `cells` | `TOP_SECTIONS { border: 3px outset <bevelLight>; padding: 8px; margin-block: 8px }` |
| `fieldset` (light page) | `TOP_SECTIONS { border: 2px groove <bevelDark>; padding: 14px 10px 8px; margin-block: 16px }` and `TOP_SECTIONS::before { content: <legend>; display: block; width: fit-content; margin: -24px 0 6px -2px; background: #ffffff; color: <link>; font: bold 13px/18px <heading font> }`, the legend one of four original phrases chosen by the banner index |
| `fieldset` (dark page) | the `cells` rule only: a white legend on a dark ground would break contrast |
| `bullets` | `:where(ul)<NOT_CHROME> { list-style-image: url(<8×8 sprite at 2px>) }`, the prefix sprite or the blue `ball` |
| `frames` | no section rule; the image rule in `lookPageCss` is `6px ridge` with `outline-offset: -6px` |

For any other dressing the image rule is `3px <bevel>` with the same negative offset. The outline is drawn inside the image's own box, so no image, no section and no line of text moves because of it.

The prefix is `:where(h2, h3)<NOT_CHROME>::before { content: url(<sprite>) "\a0" }`. The four 8×8 sprites are `skull`, `flame`, `star` and `ball`, drawn at 2px (16×16) from original pixel maps with web-safe colours.

### Density and clash rules

Two rules in `CLASH_RULES` guard the structure: `a sparse site is one plain table` (blocks `density: sparse` with a layout whose left or right column is above 0) and `three columns are only for a cluttered site` (blocks `links3` unless cluttered). `OPTIONS.layout` leaves out `full`. The seed may swap `layout`, `density`, `dressing` and `prefix`, each only to an option that does not clash, so a sparse swap away from a column layout is a legal swap and a swap into `links3` needs a cluttered preset. `lookSignature` includes the structure axes and the furniture list, so two sites with the same signature look the same.

A sparse look draws a taller banner: the plaque is 66px with a 36px title and the banner is 96px, the one big banner over a plain table. A cluttered look has up to nine pieces and may have three columns.

### Un-haunt and the page

Nothing in this part writes to a page node. The layout rules, the dressing rules and the prefix rules are in the one adopted sheet; the columns, the bottom strip, the tab bar and the copied links are in the closed shadow root, and the whole host is removed on Un-haunt. `document.documentElement.outerHTML` is therefore byte-identical after Un-haunt for every layout.

### Testing (structure)

**`test/costume/themes.test.ts` → `the structure`** (exists, four tests): same host same structure with and without `www.`; 200 hosts cover every layout, density, dressing and prefix, and 150 or more furniture sets, every piece used; the furniture count follows the density with no piece twice and Classic Crypt has none; a sparse site has no column and `links3` only comes cluttered.

**`test/costume/theme-css.test.ts` → `each dressing wraps the page's own sections its own way`** (exists): `cells` gives the 3px outset and padding; `fieldset` gives the 2px groove and a `::before` legend; `bullets` gives `list-style-image`; `frames` gives no section rule; a prefix gives `::before { content: url(` on `h2, h3` outside chrome; a dark page's `fieldset` has no `::before`.

**`test/costume/furniture.test.ts`** (new): `layoutGeometry` for each layout at 1280, 1000, 900, 800, 700 and 375 gives the spans, the drop order (right, then left) and the collapse from the table in this part; `layoutCss` is empty for `full` and collapsed and holds `max-width`, `margin-left`, 16px paddings and `overflow-x: clip` otherwise; `placeFurniture` puts `navbuttons` first in the left column, `coollinks` and `awards` right, `webring`, `bestviewed` and `updated` at the bottom, everything at the bottom when collapsed, and loses no piece; `harvest` on a small DOM keeps only `http` and `https` links, separates same-origin from outbound, drops repeats and short or long labels, and reads the headings; `buildPiece` builds every piece, links have `tabindex="-1"` and the copied `href`, a made-up piece has none, and the same site gives the same digits.

**e2e → `two sites get two different page structures`** (exists, 1280): the Classic Crypt host has `max-width: none`, no furniture and no visible column; the other host has a pixel `max-width` and a body narrower than before, at least two `.fur` pieces, and every real link under a point test is clickable. To add: the same page at 375 has no visible column, all pieces in the bottom strip and no horizontal scroll, and `outerHTML` is equal after Un-haunt.
