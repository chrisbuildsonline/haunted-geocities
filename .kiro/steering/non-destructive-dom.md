---
inclusion: always
---

# Non-Destructive DOM: Haunted GeoCities

The costume is an overlay. The page underneath must be untouched.

## Rules

- The costume lives entirely in a **Shadow DOM overlay** appended to the document — never in the page's own DOM tree.
- Costume styles are injected via **adopted stylesheets** (`document.adoptedStyleSheets`) or inside the shadow root. The page's `<style>` and `<link>` elements are never modified.
- **Page markup must be byte-identical after Un-haunt.** Haunt and Un-haunt are fully reversible: remove the shadow root and adopted costume stylesheets, and the DOM returns to its original state.
- **Page scripts are never edited, blocked, or reordered.** The one allowed exception is a set of observe-only wrappers on `HTMLCanvasElement.prototype.toDataURL`, `CanvasRenderingContext2D.prototype.getImageData`, `AudioContext`/`OfflineAudioContext` construction, and font-probing measurements (`measureText`, `offsetWidth` checks), installed from a MAIN-world script only while the page is haunted. Each wrapper calls the original with the same `this` and arguments and returns its result unchanged (same value, same exceptions), records only the calling script URL from the stack, never throws, and does not leak identity (`toString` of the wrapped function looks native). Un-haunt restores the original functions.
- **Never change form behaviour.** No adding, removing, or modifying form elements, handlers, or submission logic.
- Observers (`MutationObserver`, `IntersectionObserver`) are read-only: they detect elements to decorate but do not mutate the page DOM. Decoration is purely visual overlay.
