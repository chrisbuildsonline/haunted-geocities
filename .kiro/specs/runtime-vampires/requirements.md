# Requirements: Runtime Vampires (R6)

## Overview

This spec covers **runtime vampires**: tracker companies (or unlisted third-party hosts) that are *caught* fingerprinting at runtime by observe-only prototype wrappers installed in the page's MAIN world. It distinguishes *caught* vampires (observed by our hooks) from *known* vampires (a Tracker Radar fingerprinting score of 2 or higher but never caught), and it wires the caught/known distinction into the costume, the HUD, and the popup.

It builds on the tracker detector (R5), which established the scanner, the matcher, the ghost sprites in the gutter lanes, the ghost card, the HUD counts, the popup ghost list, and the Exorcise action. This spec adds a MAIN-world hook script injected by the background, a CustomEvent bridge from the MAIN world to the content script's isolated world, a merge that folds vampire data into `CompanyHit`, a vampire sprite in the gutter lanes with a hot `#ff0033` glow, a vampire card, HUD vampire counts, popup rows with Caught/Known pills, and the restore-and-verify test surface.

The costume overlay is a non-destructive decoration. The prototype wrappers observe the page's own API calls and report them to the content script via a CustomEvent; they never modify results, block calls, or change page behaviour. The page's DOM and prototypes must be byte-identical after Un-haunt.

Steering references: `product.md` (vampire scripts, costume overlay, scope boundaries), `tech.md` (Shadow DOM, adopted stylesheets, Web Audio API, no new permissions), `non-destructive-dom.md` (observe-only wrappers, restore originals, page scripts never edited, byte-identical un-haunt), `accessibility-and-motion.md` (reduced motion, 3 Hz ceiling, keyboard, contrast), `era-accuracy.md` (web-safe colours, pixel art), `structure.md` (`src/content/`, `src/background/`, `src/data/types.ts`).

## EARS Acceptance Criteria

### MAIN-World Hook Injection

1. On HAUNT, the background shall inject one MAIN-world script via `chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: [...] })` under the `activeTab` grant, in addition to the existing content-script injection.
2. The MAIN-world injection shall be idempotent per document: if the hooks are already installed on that document's globals, the script shall not re-install them.
3. The MAIN-world script shall receive a random per-haunt nonce string as an `executeScript` argument (`args`), and shall use that nonce as the CustomEvent name for reporting to the content script.
4. The extension shall not request any new permissions beyond `activeTab`, `scripting`, `declarativeNetRequest`, and `storage` for this feature.

### Observe-Only Wrappers

5. The hooks shall wrap `HTMLCanvasElement.prototype.toDataURL`, `HTMLCanvasElement.prototype.toBlob`, `CanvasRenderingContext2D.prototype.getImageData`, `OfflineAudioContext.prototype.startRendering`, and `CanvasRenderingContext2D.prototype.measureText` on the page's `window` (the MAIN world), and shall install no other wrappers.
6. Each wrapper shall call the original method with the same `this` and arguments, return its result unchanged (same value, same type), and rethrow the same exceptions the original threw — it shall never throw its own exception.
7. Each wrapper shall preserve the original function's `name`, `length`, and `toString` so that `wrapper.toString()` returns the same string as the original function's `toString` (native-looking).
8. `CanvasRenderingContext2D.prototype.getImageData` shall report a `canvas` fingerprint only when that same canvas context has had `fillText` or `strokeText` called on it before the `getImageData` call (the canvas-text fingerprint heuristic).
9. `CanvasRenderingContext2D.prototype.measureText` shall report a `fonts` fingerprint only when one script measures 20 or more distinct font-family strings (via `ctx.font` assignments or `ctx.measureText` calls) across the page's lifetime since haunting.
10. `OfflineAudioContext.prototype.startRendering` shall report an `audio` fingerprint when it is called.
11. The hooks shall only observe calls made after the hooks are installed (after haunting). Calls that occurred before haunting shall not be reported.
12. The hooks shall not modify any argument, return value, DOM node, or prototype beyond installing the wrappers themselves. The page's behaviour shall be identical with and without the hooks, except for the CustomEvent dispatch (which the page's own scripts cannot observe because it uses a random nonce unknown to the page).

### Attribution

13. For each fingerprinting call caught by a wrapper, the hook shall determine the calling script URL as the first `http(s)` URL found in `new Error().stack` that is not the hook script's own URL.
14. The calling script's host shall be passed through the existing `matchTracker` / `lookup` pipeline from `src/content/matcher.ts`. When the host belongs to a known tracker company, the vampire is attributed to that company. When the host is an unlisted third-party (not first-party, not in the tracker data), the vampire is named by that host. When the caller is first-party (the page's own host or a subdomain, or the same company as the page), the call shall be ignored and no vampire shall be created.
15. The attribution shall run in the content script's isolated world (not the MAIN world). The MAIN-world hook shall only dispatch a CustomEvent with `{ api, scriptUrl }`; the content script validates the payload, resolves the company, and creates the vampire.

### MAIN-to-Isolated Bridge

16. The MAIN-world hook shall dispatch a `CustomEvent` on `window` whose `type` is the per-haunt nonce, with `detail: { api: "canvas" | "audio" | "fonts", scriptUrl: string }`.
17. The content script (isolated world) shall listen for that CustomEvent on `window`. On receiving one, it shall validate that `detail` is an object with an `api` field that is one of `"canvas"`, `"audio"`, `"fonts"` and a `scriptUrl` field that is a string; invalid payloads shall be discarded.
18. The content script shall accept at most one report per `(scriptUrl, api)` pair. Subsequent reports for the same script and API shall be ignored.
19. A page spoofing CustomEvents on `window` with the nonce name can only change the costume (what sprites and pills appear); it can never change what Exorcise blocks, because the Exorcise domain whitelist in the background router stays validated against `trackers.json`.

### CompanyHit Vampire Info

20. `CompanyHit` shall gain an optional `vampire` field of type `{ caught: ("canvas" | "audio" | "fonts")[]; knownOnly: boolean } | undefined`. When `vampire` is `undefined`, the company has not been identified as a vampire. When `vampire.caught` is non-empty, the company was caught fingerprinting at runtime; each entry names the API it was caught using. When `vampire.knownOnly` is `true`, the company was identified by its Tracker Radar fingerprinting score (≥ 2) but was never caught by the hooks.
21. The Tracker Radar fingerprinting score (the existing `fingerprinting` field on `CompanyHit`) shall remain the fallback. A company whose `fingerprinting` score is ≥ 2 but was not caught by the hooks shall be shown as "known" (`knownOnly: true`), not "caught".
22. A company that is both caught and has a fingerprinting score ≥ 2 shall be shown as "caught" (the caught APIs take priority; `knownOnly` is `false`).
23. The vampire data shall be merged into the scanner's existing `CompanyHit` records. When a caught report arrives for a company already in the scanner results, its `vampire.caught` array shall be extended with the new API (deduplicated). When the report is for an unlisted third-party host not yet in the scanner results, a new `CompanyHit` shall be created with the host as the company name, `vampire.caught` set, and `count: 0`, `domains: [host]`, `categories: []`, `fingerprinting: 0`.

### Vampire Sprite

24. A vampire sprite shall be rendered in the same `#lanes` layer as ghosts, after the ghosts, using the same slot-assignment logic (`planSlots`, `IntersectionObserver` text-rect checks, `+N` stack overflow).
25. The vampire sprite shall be 48×54 (16×18 art grid × 3), body with a cape, `#660000` lining and `#ff0033` eyes, drawn as an SVG with `shape-rendering: crispEdges`, matching the Vampire sprite in `design/DESIGN.md`.
26. The vampire glow shall be `filter: drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999)`, the hot backlight distinct from the ghost's cool `#6633cc` glow.
27. The vampire label shall follow the same style as the ghost label (Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border, max 12ch with ellipsis) and shall show the company name (for a known tracker) or the host name (for an unlisted third-party).
28. A "known" vampire (never caught) shall render with 60% opacity and no glow, to distinguish it from a "caught" vampire.

### Vampire Card

29. Clicking a vampire sprite or pressing Enter on a focused vampire shall open a card inside the `#cards` layer, following the card style in `design/DESIGN.md`.
30. The vampire card title bar shall be `#660000` (not `#330066`), titled `Vampire identified`, with the same 16×16 `[x]` close button.
31. The card body shall show: the script host (wrapping at `/`), `Caught doing:` followed by a list naming what it read (`canvas`, `audio`, `fonts`), one line on what fingerprinting is, and — if the script host belongs to a known tracker company — an `[Exorcise <company>]` button. For an unlisted third-party host, no Exorcise button shall appear (there is no company to block).
32. The honest line in the card shall read `Caught since you haunted this page` for caught vampires, making clear that the hooks only see post-haunt calls.
33. For a "known" vampire (never caught), the card shall say `Known to fingerprint` instead of `Caught doing:`, and shall not show the `Caught since you haunted this page` line.

### Haunt-Moment Integration

34. During the haunt-moment timeline (1800–2100ms), vampire sprites shall fade in, then play a single glow swell (`drop-shadow` 0 → 6px). One swell, no pulsing.
35. After the haunt moment, a caught vampire shall drift with a bob of ±2px vertical over 3000ms; the glow is static. A known vampire shall not drift (it sits still at 60% opacity).

### HUD Updates

36. The HUD vampire count shall be the number of distinct companies/hosts identified as vampires (caught or known), separate from the ghost count.
37. The HUD counts shall update when a new vampire is caught or when the scanner finds a company with a fingerprinting score ≥ 2 that was not caught.

### Popup Vampire Rows

38. The popup haunted screen shall list vampires after ghosts, each with a 32px icon tile (the vampire sprite), the company or host name (15px ink), a short line naming what it read or `Known to fingerprint` (13px muted), and a pill on the right: `Caught` (accent-tinted `#f1ecfb`/`#6633cc`) or `Known` (muted `#e3e6ec`/`#5b6170`).
39. When a vampire belongs to a known tracker company, its row shall also show an `[Exorcise]` secondary button (same as a ghost row). When the vampire is an unlisted third-party host, no Exorcise button shall appear.
40. When no vampires are found, the list surface shall show `No vampires. Your blood is safe.`

### Un-Haunt Restore

41. On un-haunt, the content script shall signal the MAIN-world hooks to restore the original property descriptors on all wrapped prototypes. The hooks shall remove every wrapper and put back the exact original `PropertyDescriptor` (value, get, set, configurable, enumerable, writable) that was present before the hooks were installed.
42. After un-haunt, `HTMLCanvasElement.prototype.toDataURL`, `HTMLCanvasElement.prototype.toBlob`, `CanvasRenderingContext2D.prototype.getImageData`, `CanvasRenderingContext2D.prototype.measureText`, and `OfflineAudioContext.prototype.startRendering` shall be the same function objects they were before haunting (identity-equal to the originals).
43. After un-haunt, `document.documentElement.outerHTML` shall be byte-identical to its pre-haunt value. No wrapper, listener, or data structure installed by the hooks shall remain.

### Non-Destructive DOM

44. The hooks shall never modify, add, or remove any page DOM node, form element, form handler, or script tag.
45. The wrappers shall never change the behaviour of the page: every call returns the same result and throws the same exceptions as it would without the wrapper.
46. The CustomEvent dispatch is the only side effect visible to the page, and the page's own scripts cannot observe it because the event type is a random nonce unknown to the page.
47. The Exorcise action for a vampire company uses the same DNR path as ghosts; the background's domain whitelist (validated against `trackers.json`) is unchanged. A spoofed vampire report for an unlisted host can never cause a DNR block.

### Accessibility

48. All vampire sprites shall be keyboard reachable with visible focus indicators (the costume focus ring).
49. The vampire card's buttons (`[Exorcise]`, `[x]`) shall be keyboard reachable; Esc shall close the card and return focus to the opener.
50. Popup vampire rows and their pills/buttons shall be keyboard reachable with the popup focus ring (`outline: 2px solid #6633cc; outline-offset: 2px`).
51. HUD and overlay text shall meet 4.5:1 contrast ratio against its background.
52. No flashing, blinking, or strobing faster than 3 Hz shall occur in any vampire visual element.

### Reduced Motion

53. Under `prefers-reduced-motion: reduce`, the vampire fade-in at the haunt moment shall be replaced by instant opacity 1; no glow swell and no drift.
54. Under `prefers-reduced-motion: reduce`, known vampires shall sit still at 60% opacity with no motion.

### Tests

55. Unit tests shall verify that each wrapper calls the original with the same arguments, returns the same result, rethrows the same exceptions, preserves `name`/`length`/`toString`, and that the originals are restored after un-haunt (identity-equal). The test shall also verify that the nonce CustomEvent name is a random string per haunt.
56. Unit tests shall verify attribution: a known tracker host resolves to its company; an unlisted third-party host becomes a vampire named by that host; a first-party caller is ignored.
57. Unit tests shall verify the merge: a caught report for a company already in the scanner results extends its `vampire.caught` array (deduplicated); a report for an unlisted host creates a new `CompanyHit` with `vampire.caught` set and `count: 0`.
58. A fixture page `fixtures/vampires.html` shall contain a sign-up form whose scripts, served from hosts mapped by `--host-resolver-rules` (one tracker host from `trackers.json` with `fingerprinting: 0`, one unlisted host), fingerprint canvas, audio, and fonts when the email field gets focus.
59. An end-to-end test shall haunt the fixture page, focus the email field, and see caught vampires appear. It shall verify that `toDataURL` returns the same data URL as before haunting. It shall verify that the prototypes are restored after Un-haunt (the wrapper functions are identity-equal to the originals).
