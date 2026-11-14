# Requirements: Sound Effects (R9)

## Overview

This spec covers **sound effects**: five short sounds synthesized in code with the Web Audio API. There are no audio files and no network requests.

| Sound | When it plays | Where it plays | Shape |
| --- | --- | --- | --- |
| `whoosh` | The user clicks **Haunt** in the popup | The popup page | About 900ms of band-passed noise with a rising sweep |
| `ghost` | A ghost card opens | The content script (isolated world) | A soft "ooo": two detuned sine oscillators with vibrato |
| `thud` | A tombstone card opens | The content script | A low stone thud |
| `sting` | A curse card opens | The content script | A short dissonant interval |
| `organ` | A vampire card opens | The content script | A low organ stab (reused for vampires, no sound of its own) |

Sound is off until the user turns on **Sound effects** in the popup. The popup already stores that choice in `chrome.storage.local` under `audioEnabled` (`AUDIO_KEY`, `src/popup/settings.ts`). This spec adds the module that reads it and plays the sounds.

The whoosh moves from the page to the popup. A page has no user gesture when Haunt is clicked, so a page-side `AudioContext` would start suspended. The popup click is the gesture, so the popup plays it. Costume-renderer requirement 50 is updated to say so.

Card sounds play only from the click that opens the card. They run in the content script's isolated world, which has its own `AudioContext` constructor, separate from the page's. The runtime-vampires hooks run in the MAIN world and wrap the page's functions only. They never see our calls, so the extension cannot flag itself as a vampire.

Steering references: `accessibility-and-motion.md` (audio muted by default, sound only after an explicit gesture, no ambient audio), `non-destructive-dom.md` (observe-only hooks, nothing changes in the page), `tech.md` (Web Audio API, muted by default, `chrome.storage`), `product.md` (permissions model: no new permission), `structure.md` (module placement, `test/`, `e2e/`). Design references: `design/DESIGN.md` sections "Row: audio toggle" and "Haunt moment" (Audio line). Related specs: `costume-renderer` (R4, requirement 50), `runtime-vampires` (R6), `tombstones` (R7), `dark-patterns` (R8).

## Terms

- **Sound module**: `src/audio/sound.ts`, the one module that builds sounds. The popup and the content script both import it.
- **Player**: the object returned by `createPlayer(deps)`. It owns the shared `AudioContext`, the master gain and the cached `audioEnabled` value.
- **Muted**: `audioEnabled` is not `true`, which includes a missing key and any value that is not boolean `true`.
- **Master gain**: the single `GainNode` between every sound and `ctx.destination`.
- **Gesture**: a `click` event (or the keyboard activation of a button, which also fires `click`) on the element that starts the sound.

## EARS Acceptance Criteria

### Mute default and storage

1. The player shall treat sound as muted until it has read `audioEnabled === true` from `chrome.storage.local`.
2. While muted, the player shall not construct an `AudioContext`, an `OfflineAudioContext`, a `GainNode`, an oscillator, a buffer or any other Web Audio object, and `play` shall return without doing anything.
3. While muted, the sound module shall make no network request and shall not read or write any other storage key.
4. When `chrome.storage.local` cannot be read, or `audioEnabled` is missing, the player shall stay muted.
5. The player shall never write `audioEnabled`. Only the popup toggle writes it.
6. The module shall build every sound from oscillators, noise generated in code and gain, filter and delay nodes. It shall not load an audio file, call `fetch`, `XMLHttpRequest` or `decodeAudioData`, set a media `src`, or ship an audio asset in `dist/`.

### Live toggle

7. When `chrome.storage.onChanged` reports a change to `audioEnabled` in the `local` area, the player shall update its cached value before the next `play` call.
8. When `audioEnabled` changes from on to off while a context exists, the player shall stop every playing sound, ramp the master gain to 0 within 30ms, close the context, and drop its reference to it.
9. After a close (criterion 8), when `audioEnabled` changes back to on and a sound is requested, the player shall create a new context lazily at that request.
10. When `audioEnabled` changes from off to on, the player shall not construct anything. Construction waits for the first `play` call.
11. The player shall read `audioEnabled` once when it is created and follow `onChanged` after that. It shall not poll.
12. When the popup is open, a change made by the Sound effects switch shall take effect for the popup's own player without a reload, through the same `onChanged` path.

### Context and gain

13. The player shall keep at most one `AudioContext` per document and create it on the first `play` call that happens while sound is on (criteria 2, 9).
14. The popup document and each tab's content script document shall each have their own player and their own context. No context shall be shared across documents.
15. The player shall connect every sound to one master `GainNode` whose gain value is at most 0.25 at every moment, and the master shall connect to `ctx.destination`. The shipped value is 0.2.
16. When the context state is `suspended`, `play` shall call `ctx.resume()` and start the sound once, without waiting for the promise.
17. A sound shall never raise its own gain above 1 before the master, and no node anywhere shall be connected to `ctx.destination` except the master.

### Duration and cleanup

18. Every sound shall be scheduled to stop, and shall be audibly silent, within 1.2 seconds of the `play` call. Each source node shall have an explicit `stop(t)` with `t - ctx.currentTime <= 1.2`.
19. Each sound shall start from a gain of 0 and end at a gain of 0, with an attack of at least 5ms and a release of at least 20ms, so it does not click.
20. When a source ends, the player shall disconnect that sound's nodes.
21. The player shall not play more than 4 sounds at once. A `play` call while 4 are active shall return without doing anything.
22. A repeated `play` of the same kind within 150ms of the previous one shall return without doing anything.
23. The module shall not start a loop, a repeating timer, a looping buffer (`loop = true`) or a scheduler that outlives a sound. No background or ambient sound shall exist.

### The sounds

24. `whoosh` shall last 0.9 seconds. It shall play a noise buffer through a `bandpass` filter whose frequency rises with an exponential ramp from 200 Hz to 2400 Hz across the sound, with a gain envelope that peaks near the middle and falls to 0 at 0.9 seconds.
25. `ghost` shall play two `sine` oscillators detuned by 7 cents, around 392 Hz, with a vibrato from a low-frequency oscillator at 5 to 6 Hz modulating pitch by no more than 12 cents, and a slow attack and release inside 0.8 seconds.
26. `thud` shall play a `sine` oscillator that falls from 90 Hz to 40 Hz in 0.25 seconds, with a short low-passed noise burst at the start, inside 0.5 seconds.
27. `sting` shall play two `sawtooth` oscillators a tritone apart (ratio about 1.414), low-passed, inside 0.6 seconds.
28. `organ` shall play a stab of three `square` oscillators at 55, 110 and 165 Hz, low-passed, inside 0.7 seconds.
29. The sound module shall export `SOUND_KINDS` as `["whoosh", "ghost", "thud", "sting", "organ"]` and `SOUND_DURATION` giving each sound's length in seconds. Each value shall be at most 1.2.

### Where sounds play

30. The popup shall call `play("whoosh")` from the Haunt button's `click` handler, before it awaits the `HAUNT` message, so the sound starts in the click's task. It shall not play on Un-haunt, on a failed haunt, or on any other screen.
31. The popup shall not wait for the whoosh. The `HAUNT` request, the screen change and the error handling shall behave exactly as before.
32. The content script shall call `play("ghost")` from the click handler that opens a ghost card, `play("thud")` from the one that opens a tombstone card, `play("sting")` from the one that opens a curse card, and `play("organ")` from the one that opens a vampire card.
33. The content script shall call `play` only from those click handlers. It shall not play when a card closes, when a ghost, tombstone, curse or vampire first appears, when a page scan finishes, on the haunt moment, on un-haunt, on hover or focus, or from a timer or observer.
34. A click on a card that is already open, or a click that closes the card, shall not play a sound.
35. The haunt moment in the content script shall not play any sound. The whoosh is only played by the popup.
36. The sound module shall be imported by `src/popup/` and by `src/content/costume/`. It shall not be imported by `src/content/hooks.ts` or any file the MAIN-world bundle contains, and it shall not run in the MAIN world.

### Not flagged as a vampire

37. The sound module shall use `AudioContext` (real time) only. It shall not construct an `OfflineAudioContext` and shall not call `startRendering`, `getChannelData` on a rendered buffer, `getImageData`, `toDataURL`, `toBlob`, `measureText` or any other function the runtime-vampires hooks watch.
38. The content script shall create its context in the isolated world. It shall not inject a script or call a MAIN-world API to play a sound, and it shall not post a sound request to the page.
39. When sound is on and the user opens ghost, tombstone, curse and vampire cards on a haunted page, the page shall gain no vampire entry for the extension itself, and the vampire count in the popup and on the toolbar badge shall not change.
40. The sound module shall not change any hooked function, global or prototype on the page's `window`, and shall not add an element, attribute or listener to the page's DOM.

### Motion and accessibility

41. Sound shall not depend on `prefers-reduced-motion`. That setting changes visuals only. A user who prefers reduced motion and has turned sound on shall hear the same sounds.
42. Sound shall not replace any visual or text. Every card shall open and read the same with sound off.
43. The popup's Sound effects switch shall keep its existing label, role, keyboard behaviour and sub-lines (`Muted`, `On · plays only after you click`). This spec shall not change the switch.
44. No sound shall exceed 3 pulses per second of amplitude change, and none shall contain a flashing visual.

### Permissions and privacy

45. The feature shall add no permission, no `host_permissions`, no `optional_permissions` and no `web_accessible_resources` entry. `bun run lint:manifest` shall still pass.
46. The feature shall add no network request and no new message type between the popup, the background and the content script.

### Docs and spec link

47. `README.md` "What it does" shall gain one line saying that sound is off by default and what plays when it is on. (A later task outside `.kiro/`.)
48. Costume-renderer requirement 50 shall say that audio is specified in `.kiro/specs/sound-effects/` and that the haunt whoosh is played by the popup. It shall no longer say that audio is out of scope.

### Tests

49. Unit tests (`test/sound/`) shall use a fake `AudioContext` and cover: the muted path constructs nothing (criteria 1 to 4); the on path builds a graph whose master gain is at most 0.25 and whose every source stops within 1.2 seconds (15, 18); toggling off mid-session closes the context (8); toggling back on and playing creates a new one (9); one context per player (13); the cap and the debounce (21, 22); and no forbidden API is used (6, 37).
50. A unit test shall check each of the five sounds: the node types and frequencies in criteria 24 to 28, `SOUND_DURATION` values, and a gain of 0 at start and end (19).
51. A unit test shall check the popup: Haunt click plays `whoosh` once, before the `HAUNT` message resolves, and only when on; Un-haunt, a failed haunt and the restricted screen play nothing (30, 31).
52. A unit test shall check that each card opener calls `play` with the right kind from its click handler and nowhere else, and that a muted player constructs no context in all of them (32 to 35).
53. An e2e test shall show that with sound off, opening a ghost, tombstone, curse and vampire card creates no `AudioContext`, and that with sound on, opening a card creates one. It shall count contexts with the Chrome DevTools `WebAudio` domain, which sees every world (13, 14).
54. An e2e test shall show that with sound on, opening cards adds no vampire for the extension, and that the vampire list on `vampires.html` is the same with sound off and with sound on (39).
55. An e2e test shall show that toggling Sound effects off while a page has a context makes that context close, and that no context is created again until a card is opened with sound on (8, 9).
56. `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run lint:manifest` and `bun run test:visual` shall pass. No visual baseline shall change, because this spec changes no visual.
