# Design: Crypt Footer

## Context

The costume's bottom stops floating. The `<hg-crypt>` host becomes a static box after `<body>`, and a `<footer id="crypt-footer">` inside its shadow root holds the graveyard, the HUD, a badges row and a sign-off. The fixed layers stay in `#crypt-root`. The page sheet no longer pads the page's bottom, because nothing covers it. The cover's label comes from a pool of 12. Four easter eggs live in a new module and exist only while the costume does.

Steering references: `non-destructive-dom.md`, `accessibility-and-motion.md`, `era-accuracy.md`, `structure.md`. Requirement numbers refer to `requirements.md`. The look is in `design/DESIGN.md` ("Crypt footer", "Ghost icon", "Secrets", the HUD's "Body padding", "Page-change cover"), which already describes F28.

## Files

```
src/content/overlay.ts                  # HOST_CSS: static host; the shadow root is exported to render.ts as today
src/content/costume/footer.ts           # new: buildFooter(doc): footer, badges row, sign-off, setVisitor(n)
src/content/costume/graveyard.ts        # always drawn; no hidden state; comment and empty text updated
src/content/costume/hud.ts              # setTabCount(tab, n, tick); buildTab(doc) (the ghost icon)
src/content/costume/styles.ts           # #crypt-root fixed + z; #crypt-footer, #graveyard, #hud static; badges; #show-tab
src/content/costume/body-padding.ts     # update(lift) only; no bottom padding or scroll padding
src/content/costume/column-layers.ts    # documentHeight stops at the footer; layers one z-index lower
src/content/costume/haunt-moment.ts     # layer() reads the shadow root for #hud and #graveyard; slide only if on screen
src/content/costume/render.ts           # builds footer and tab, bounds(), pad() removed, secrets, now option
src/content/costume/secrets.ts          # new: startSecrets(ctx): () => void
src/content/costume/bands.ts            # MARQUEE_LINES unchanged; the look classes are styled in styles.ts
src/cover/cover.ts                      # COVER_LINES, pickLine, marker value is the last index
src/background/ (setMarker)             # writes "-1" only when the key is absent
test/costume/footer.test.ts             # new
test/costume/secrets.test.ts            # new
test/cover.test.ts                      # pool tests added
```

No manifest change, no new permission, no new dependency.

## Host and layers (criteria 1 to 5)

`overlay.ts` changes `HOST_CSS` to `all: initial !important; display: block !important; position: static !important;` and drops `inset`, `pointer-events` and `z-index`. The `!important` stays: a page rule such as `* { position: relative }` must not move the footer. A static box after `<body>` is laid out after the body in the root's flow, so it sits at the end of the document.

```text
<html>
  <body> … page … </body>
  <hg-crypt>                       static block, last in flow
    #shadow-root (closed)
      <style> :host sheet, costume sheet
      <div id="crypt-root">        fixed, inset 0, z 2147483647, pointer-events none
        #starfield #lanes #markers #top-bands #cards #show-tab  (#fx while a moment plays)
      <footer id="crypt-footer">   static, relative, z 2147483646
        #graveyard   #hud   .badges   .signoff
```

A fixed child of a static host is positioned against the viewport, so the crypt root behaves as the host did before. `render.ts` creates the footer after the crypt root and appends both to the shadow root. The two class toggles that live on the crypt root, `reduced-motion` and `tab-hidden`, and `costume-hidden`, are applied to both nodes through one helper `setState(name, on)`.

Layer order: the page-sheet tint and frame (`html::before`, `html::after`) drop from `2147483646` to `2147483645`, so the footer, at `2147483646` and later in the document, is above them even where a tall frame would reach it. The span's height already stops at the footer (next section), so this is a second guard. `design/DESIGN.md`'s layer table still describes the pseudo layers as one under the host. Task 3.8 updates the table with the code.

Known limits: a page that fixes its own scroll (`body { height: 100%; overflow: auto }` with the html root `overflow: hidden`) scrolls inside the body, so the footer sits below its viewport and the ghost icon is the way to it. A root with `display: flex` or `grid` may lay the footer beside the body. Both were already odd for the old strip, and the ghost icon still scrolls to the footer.

## Footer (`footer.ts`, criteria 3 to 14)

```ts
export function buildFooter(doc: Document, parts: { graveyard: HTMLElement; hud: HTMLElement }): HTMLElement;
export function setVisitor(footer: HTMLElement, total: number): void;   // "You are visitor #000006 to this crypt."
```

`buildFooter` returns `<footer id="crypt-footer">` with, in order, the graveyard, the HUD, `<div class="badges">` and `<p class="signoff">`. The footer is not a landmark role override: `<footer>` inside a shadow root of a body-level host is a plain element for assistive tech, and the graveyard and HUD keep their `role="region"` labels.

The badges are four `<span class="badge">` elements (not `a`, not `button`, no `tabindex`). The text is original. `Under construction` uses `repeating-linear-gradient(45deg, #000000 0 4px, #ffcc00 4px 8px)` behind a `#c0c0c0` text plate. Colours are all web-safe (`#ffcc00`, `#c0c0c0`, `#000080`). The bevel is the Win95 pair already in `PALETTE`.

CSS (in `styles.ts`):

```css
#crypt-footer { position: relative; z-index: 2147483646; box-sizing: border-box; padding: 24px; color: …; pointer-events: auto;
  background-color: #000033; border-top: 4px solid #66ff99 (a checker via repeating gradient); }
#crypt-footer > * { max-width: 800px; margin: 0 auto 12px; }
#graveyard, #hud { position: static; }    /* the old fixed rules, bottom and left/right, are deleted */
.stones { display: flex; flex-wrap: wrap; gap: 16px; }   /* no overflow-x */
@media (max-width: 400px) { #crypt-footer { padding: 16px; } }
```

The checker rule is `repeating-conic-gradient(#66ff99 0 25%, #000033 0 50%) 0 0 / 8px 8px` in a 4px-tall `::before`, so no image file is needed.

## Graveyard (criteria 6 to 10, 27)

`updateDocked(strip, companies, opts)` already keeps one element per company across updates. F28 calls it with `scan.companies` always, and `updateGhosts(lanes, overlay ? [] : scan.companies, …)` still fills the lanes in lane mode. `strip.hidden` is never set. `buildGraveyard` gets `tabindex="-1"`, the title `Graveyard of trackers` and the empty text from criterion 10. The `focusin` scroll handler stays: a half-visible focused sprite scrolls fully into view.

Two sprites per company in lane mode means `data-company` is not unique in the shadow root. Selectors that need one copy are scoped (`#lanes …`, `#graveyard …`). `setCardExorcised` and `applyExorcised` iterate all sprites, so both copies change together. Opening a card from either copy passes the opener, and focus returns to that opener.

`LAYOUT.graveyardGap` and `--hg-hud-h` have no user and are removed. `LAYOUT` keeps `hudMaxWidth` and `hudMinHeight`.

## HUD and the sign-off

The HUD's markup does not change. Its CSS drops `position: fixed`, `bottom`, `left`, `right` and the `--hg-lift` calc, and gets `margin: 0 auto 12px`. The counter value flows to `setOdometer(hud, total)` and to `setVisitor(footer, total)` from `refresh()`. The HUD's `Hide` button now fades the footer and the crypt root through `setState("costume-hidden", true)`. The footer keeps its box (`opacity: 0`, `pointer-events: none`, `visibility: hidden` after the 200ms) so the scroll height does not change.

## Ghost icon (criteria 19 to 24)

`render.ts` today builds `#show-tab` as `hidden` and shows it after Hide. F28 builds it once in `hud.ts` with `buildTab(doc)`: the 16px ghost over `<span class="n">0</span>`. It has no `hidden`. `setTabCount(tab, n, tick)` sets the number and the label, and ticks like `setCounts` does (the same 300ms drop, instant under reduced motion). `renderCounts` calls it with `haunting.length`.

```ts
tab.addEventListener("click", () => {
  if (croot.classList.contains("costume-hidden")) { setState("costume-hidden", false); page.set({ hidden: false }); }
  graveyard.scrollIntoView({ behavior: motion.matches ? "auto" : "smooth", block: "start" });
  graveyard.focus({ preventScroll: true });
});
```

The old `hide.focus()` after Show goes: focus now goes to the graveyard. After Hide, focus still moves to the tab. The `.costume-hidden > :not(#show-tab)` rule stays for the crypt root, and the footer gets `#crypt-footer.costume-hidden`. CSS: `#show-tab { position: absolute; width: 40px; height: 48px; … }` (absolute in the fixed crypt root, so it is fixed to the viewport), `bottom: calc(8px + var(--hg-lift, 0px))`, and the 4px variant in the 400px media block.

## Page sheet (criteria 15 to 18)

`PageSheet.update(hudHeight, lift)` becomes `update(lift)`. `render()` loses `under`, `padding-bottom` and `scroll-padding-bottom` (and the reads of `cs.paddingBottom` and `root.scrollPaddingBottom`). `pad()` in `render.ts` is replaced by `page.update(lift)` inside `measure()`. A `ResizeObserver` on the footer calls `relayout`, because the footer's height changes the document height that the tint and the frame use.

`documentHeight(doc)` in `column-layers.ts` returns the footer's top edge in document coordinates: `host.getBoundingClientRect().top + scrollY`, where `host` is the `hg-crypt` element, falling back to the old scroll height when the host is not connected. `render.ts` passes the host in. The tint and the frame end there.

## Bounds, lanes and the moment (criteria 25 to 29)

```ts
const bounds = () => ({ top: bands.offsetTop + bands.offsetHeight, bottom: win.innerHeight });
```

`planSlots(gutters, vw, b.top, b.bottom, rects)` gets the same bounds. After planning, `render.ts` drops any right-lane slot whose box intersects `tab.getBoundingClientRect()` (a plain rectangle test in `ghosts.ts`, `clearOf(slot, rect)`), so the last right slot ends above the icon. `bounds` is the same value for cards, tombstones and curses.

In `haunt-moment.ts`, `layer(croot, id)` stays for fixed layers. New `crypt(croot, id)` calls `(croot.getRootNode() as ShadowRoot).querySelector("#" + id)`. `bottomBoxes` uses it for `hud` and `graveyard` and keeps only boxes with `getBoundingClientRect().top < innerHeight`. `playHaunt` uses `crypt(croot, "hud")` for the odometer strips (the strips roll even off screen, they cost nothing). `playUnhaunt` uses the same `bottomBoxes`. When nothing is on screen the list is empty and the moment is otherwise unchanged. In unit tests `getRootNode()` of an element in a plain document returns the document, and `crypt` queries it, so the existing tests that build a bare `croot` still work.

## Cover label (criteria 31 to 37)

```ts
export const COVER_LINES = [ "Loading crypt…", … 12 lines … ] as const;
export function pickLine(last: unknown, random: () => number = Math.random): number {
  const prev = typeof last === "number" && Number.isInteger(last) && last >= 0 && last < 12 ? last : -1;
  const i = Math.floor(random() * (prev < 0 ? 12 : 11));    // 11 choices when one is excluded
  return prev >= 0 && i >= prev ? i + 1 : i;                // skip the excluded index
}
export const parseMarker = (v: string | null): number | null =>   // null: unset; -1: set, no line yet
  v === "-1" ? -1 : v !== null && /^(?:\d|1[01])$/.test(v) ? Number(v) : null;
```

A `random()` that returns 1 or more would be out of range, so `i` is clamped with `Math.min(i, max - 1)` before the skip. `startCover` gains a `random` dep. `marked = parseMarker(storage.getItem(COVER_MARKER)) !== null`. In `show()`, `last = parseMarker(...)`, `index = pickLine(last, random)`, the label text is `COVER_LINES[index]`, and `storage.setItem(COVER_MARKER, String(index))` runs in a `try`. A subdomain has no marker, so it picks from all 12 and starts its own marker. Un-haunt already removes the marker.

The background's `setMarker` func changes to `(k) => { if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, "-1"); }`. Because the key's value is serialised into `executeScript`, the func closes over nothing. A tab whose marker came from an older build holds `"1"`, which is a valid index, so it still covers the page. Existing assertions in `test/site-haunt.test.ts` and `e2e/site-haunt.spec.ts` that compare the marker with `"1"` change to accept `"-1"` or an index (tasks 2.4 and 5.6).

## Secrets (`secrets.ts`, criteria 38 to 55)

```ts
export type SecretsCtx = {
  win: Window; croot: HTMLElement; footer: HTMLElement; hud: HTMLElement;
  reduced: () => boolean; now: () => Date;
  marquee: { override(text: string): () => void };   // returns a restore function
};
export function startSecrets(ctx: SecretsCtx): () => void;   // returns stop()
```

`render.ts` calls it after the costume exists and puts the returned `stop` in its `onUnhaunt`. The module holds no state on the page.

**Keys.** One `keydown` listener on `win` (capture, passive). It never calls `preventDefault` or any propagation method. It returns at once for typing in a field (`isTyping(e)` from `composedPath()[0]`, plus Ctrl, Meta and Alt) and clears both buffers. Otherwise it appends `e.key` (lower-cased for letters) to a buffer of the last 10 keys, and to a 3-key letters buffer. Both buffers clear after 2000ms without a key. A match of `ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a` runs `frenzy()`, a match of `b o o` runs `boo()`. `e.repeat` events are ignored, so a held key cannot fill the buffer.

**Frenzy (3000ms).** Adds `frenzy` to the crypt root and the footer, and calls `marquee.override("!!! FULL HAUNT !!!")`. CSS: `.frenzy .ghost, .frenzy .vampire { animation-duration: max(calc(var(--bob) / 3), 334ms); }`. Today's bob and sway use `animation-duration` values from `tokens.ts` (`MOTION`). The test reads them and asserts that the clamped result is 334ms or more, so the 3 Hz limit holds even if a base period is shortened later. A second run restarts the timer and does not stack. Under reduced motion only the marquee changes (the class is not added). The restore function and `classList.remove` run from `stop()` too.

**Hit counter.** A `click` listener on `.hits` in the HUD counts clicks. `Date.now()` gaps over 3000ms reset the count to 1. The 13th click resets the count and shows `#skeleton`, a `<div>` with the 48px sprite (an original pixel art skeleton in four frames, drawn through `art.ts` helpers with web-safe colours), `position: absolute` in `.hits` (which is `position: relative`), so the footer's height and every other box stay put. It sits above the odometer, `left` clamped to the footer's inner width. CSS `steps(4)` runs at 2 frames a second over 2000ms, looping 2.5 times, then `setTimeout(5000)` removes it. Reduced motion: one fixed frame, same 5000ms. Clicking the counter 13 more times while the skeleton shows is ignored.

**Boo (2600ms in all).** `boo()` collects the sprites in `#lanes` and `#graveyard .stones` at that moment and animates each with Web Animations, one animation of 2600ms with `fill: "none"`: `transform: translateY(0)` at 0, `translateY(drop)` at 600/2600, held, back to 0 at 1. `drop` is `innerHeight - rect.top + 8` for a lane sprite (off the bottom of the viewport) and the graveyard's height for a graveyard sprite, which also fades to opacity 0 by the 600ms mark (the footer's other boxes sit below). The return begins at 2000ms, so the keyframe offsets are 0, 0.23, 0.77 and 1. Reduced motion: the same offsets on `opacity` only. The animations are cancelled in `stop()`. A `boo` flag stops a second one; the sprites that appear later are not in the list.

**Look.** `lookOf(now)`:

```ts
export const lookOf = (d: Date): "halloween" | "witching" | null =>
  d.getMonth() === 9 && d.getDate() === 31 ? "halloween" : d.getHours() === 0 ? "witching" : null;
```

`startSecrets` does not own this. `render.ts` reads `now()` once, adds the class `halloween` or `witching` to the crypt root, and passes the opening line to the marquee (`It's the witching hour.` or `Happy Halloween from 1998!`), shown as `MARQUEE_LINES[0]` for the first pass only. CSS: `.witching #top-bands, .halloween #top-bands { background: #330066; color: #ff6600; }` with its bar, marquee and link colours, and the same `#ff6600` on `#330066` for borders. The look is static and has no animation of its own.

**Marquee override.** `render.ts` already owns `showLine`. It exposes `override(text)`: set `track.textContent = text`, restart the animation, and return a function that restores `MARQUEE_LINES[line % n]`. Under reduced motion the track is static, so the text just appears.

## Non-destructive guarantee

The page's DOM is never touched: listeners are on `win` and on shadow elements, no class or attribute is written to page nodes, and every added node is inside the shadow root. `test/costume/secrets.test.ts` takes `document.documentElement.outerHTML` before and after each secret (host excluded) and after Un-haunt, and compares it. A leftover-listener test dispatches the codes after Un-haunt and expects nothing.

## Interaction with other specs

- **costume-renderer**: the HUD, the graveyard and the haunt moment keep their behaviour. The graveyard is now always drawn, and the moment slides only boxes that are on screen.
- **site-haunt**: the cover's label and the marker's value change. Its scheduling, registration and checks do not. A quiet re-haunt renders the same footer.
- **neighborhoods**: unchanged. The look overrides the bands' colours only.
- **sound-effects**: no sound from F28.
- **tombstones, dark-patterns**: markers and badges use the new `bounds()`.

## Testing

- **Unit** (`test/costume/footer.test.ts`): host static and appended last; the footer is a sibling of the crypt root; no fixed or sticky style on footer parts; order; graveyard lists every company in lane mode and in full-overlay mode, no `overflow-x`; empty text; badges are four non-focusable spans; sign-off follows the counter; the page sheet text has no `padding-bottom` or `scroll-padding-bottom`; `#show-tab` always present, count follows Exorcise, label wording, click shows the costume, scrolls and focuses; bounds bottom equals `innerHeight`; the haunt moment finds `#hud` through the shadow root; Un-haunt leaves the DOM identical.
- **Unit** (`test/costume/secrets.test.ts`): each secret, with fake timers and `now: () => new Date(2026, 9, 31, 12)`: the Konami string, a wrong order, typing in an input and a textarea (nothing fires, buffers clear), `contenteditable`, the 3000ms and 5000ms ends, the 13th click and the 3000ms gap, `boo` in any case, `boo` with Ctrl, a second `boo`, `lookOf` for 00:00, 00:59, 01:00, Oct 31 at 00:30 (halloween) and Oct 30, reduced motion for all four, the 334ms clamp, byte-identical DOM, listeners gone after Un-haunt.
- **Unit** (`test/cover.test.ts`): 12 distinct lines, `pickLine` never equals `last` for every `last` and for `random` at 0, 0.5 and 0.999999, `pickLine` with bad `last`, `parseMarker`, the shown text is in the pool and is written back, a second page never repeats, a storage throw still shows a line.
- **e2e**: the footer is last in flow (its top is at or below the body's bottom edge), scrolls with the page, and covers no page text at 1280 and 375. The fixed-strip specs change to read the footer (task 5).
- **Visual**: baselines regenerated in Docker, reviewed one by one.
