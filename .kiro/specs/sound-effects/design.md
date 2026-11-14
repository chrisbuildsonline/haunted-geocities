# Design: Sound Effects

## Context

Sound is off by default. When the user turns on **Sound effects** in the popup, five short sounds play: a whoosh when they click Haunt, and a sound for each kind of card they open. All of them are synthesized in code with the Web Audio API.

The popup already stores the choice under `audioEnabled` (`AUDIO_KEY` in `src/data/types.ts`, written in `src/popup/settings.ts`). Nothing reads it yet. This spec adds one module that reads it, one player per document, and the call sites.

Steering references: `accessibility-and-motion.md` (muted by default, only after a gesture, no ambient audio), `non-destructive-dom.md` (the page is untouched, the observe-only hooks stay the only MAIN-world code), `tech.md` (Web Audio, `chrome.storage`), `product.md` (permissions model), `structure.md` (module placement). Design reference: `design/DESIGN.md` "Row: audio toggle", "Haunt moment".

Requirement numbers below refer to `requirements.md`.

## Files

```
src/audio/
  sound.ts                          # new: player, five sounds, constants
src/popup/app.ts                    # play("whoosh") in the Haunt click handler
src/content/costume/card.ts         # play("ghost" | "organ") when a company card opens
src/content/costume/tombstones.ts   # play("thud") when a tombstone card opens
src/content/costume/curses.ts       # play("sting") when a curse card opens
src/content/costume/render.ts       # creates the content player, passes play to the openers, disposes it on un-haunt
test/sound/sound.test.ts            # new: fake AudioContext
test/sound/sounds.test.ts           # new: per-sound graph checks
test/sound/call-sites.test.ts       # new: popup and card openers
e2e/sound.spec.ts                   # new
.kiro/specs/costume-renderer/requirements.md   # requirement 50 updated (done with this spec)
```

The exact function names in `card.ts`, `tombstones.ts`, `curses.ts` and `render.ts` are for the implementer to confirm. The rule is the one in criterion 32: call `play` in the click path that opens a card, and nowhere else. `src/manifest.ts`, `src/background/` and `src/content/hooks*.ts` do not change.

## Why the whoosh moves to the popup

Chrome's autoplay policy starts an `AudioContext` as `suspended` until the document has had a user gesture. The popup click is a gesture in the popup document. The tab's page has none when the extension injects the costume, so a page-side whoosh would be silent, and a workaround (injecting a MAIN-world script to nudge the page) would break the rule that the page is untouched.

Playing the whoosh in the popup avoids both. The popup window usually stays open while the haunt moment runs, so the sound is heard in step with the wipe. If the user moves focus away and the popup closes, the sound stops with it. That is acceptable: the sound is a flourish and nothing depends on it (criterion 42).

Card sounds are different. A card opens from a click on the page, inside the content script's isolated world. Chrome tracks user activation per frame, not per world, so that click activates the isolated-world context too. Because the context is created inside the click handler, it starts `running`, and `resume()` covers the case where it does not (criterion 16).

## Why the extension is not flagged as a vampire

The runtime-vampires hooks (`src/content/hooks.ts`) wrap functions on the page's own `window`, in the MAIN world. `OfflineAudioContext.prototype.startRendering` is the audio one. A content script runs in an isolated world with its own copies of `AudioContext`, `OfflineAudioContext` and every prototype. Calls made there never go through the page's wrappers.

Three rules keep that true:

1. The module uses real-time `AudioContext` only (criterion 37). It never touches `OfflineAudioContext`, so even a shared-prototype mistake would not hit `startRendering`.
2. The module is bundled into the popup and the content script only, never into the MAIN-world bundle (criterion 36).
3. The module never asks the page to play anything: no injected script, no `postMessage` (criterion 38).

The e2e test checks the outcome from outside (criteria 39, 54), and a unit test greps the module's source for the forbidden names.

## Module: `src/audio/sound.ts`

```ts
export const SOUND_KINDS = ["whoosh", "ghost", "thud", "sting", "organ"] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

/** Length of each sound in seconds, release included. Every value is at most MAX_SECONDS. */
export const SOUND_DURATION: Record<SoundKind, number> = {
  whoosh: 0.9, ghost: 0.8, thud: 0.5, sting: 0.6, organ: 0.7,
};

export const MASTER_GAIN = 0.2;     // criterion 15, at most 0.25
export const MAX_SECONDS = 1.2;     // criterion 18
export const MAX_VOICES = 4;        // criterion 21
export const DEBOUNCE_MS = 150;     // criterion 22
export const CLOSE_RAMP_S = 0.03;   // criterion 8

export interface PlayerDeps {
  storage: Pick<typeof chrome.storage, "local" | "onChanged">;
  /** Injected so tests can pass a fake. In production: () => new AudioContext(). */
  createContext: () => AudioContext;
  now?: () => number;               // for the debounce, default performance.now
}

export interface Player {
  play(kind: SoundKind): void;
  /** Close the context and stop following storage. Called on un-haunt and on popup unload. */
  dispose(): void;
}

export function createPlayer(deps: PlayerDeps): Player;
```

`createPlayer` is a factory, not a singleton. "One shared context per document" (criterion 13) comes from each document building exactly one player: `popup.ts` builds one, and the content script builds one per haunt.

### State

```ts
let enabled = false;             // cached audioEnabled
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let voices = new Set<Voice>();   // active sounds
let last = new Map<SoundKind, number>();
```

### Start-up

1. `deps.storage.local.get({ [AUDIO_KEY]: false })` then `enabled = value === true`. A rejected promise leaves `enabled` false (criterion 4).
2. `deps.storage.onChanged.addListener(onChanged)` once. It ignores any area other than `local` and any change set without `audioEnabled`.

Neither step builds a Web Audio object (criteria 2, 10, 11). Until the first `get` resolves, `enabled` is false, so a click in the first milliseconds plays nothing. That is the safe side.

### `play(kind)`

```
if (!enabled) return                                   // criterion 2
if (debounced(kind) || voices.size >= MAX_VOICES) return
ensureContext()                                        // creates ctx + master once
if (ctx.state === "suspended") void ctx.resume().catch(() => {})
const voice = SOUNDS[kind](ctx, master)                // wires nodes, schedules start/stop
voices.add(voice); voice.onEnded(() => { voices.delete(voice); voice.disconnect() })
```

The whole body sits in `try`/`catch`. Any Web Audio error is swallowed, because a sound must never break a card or the Haunt click. The function returns `void`.

`ensureContext()`:

```ts
ctx = deps.createContext();
master = ctx.createGain();
master.gain.value = MASTER_GAIN;
master.connect(ctx.destination);
```

`master` is the only node connected to `ctx.destination` (criterion 17).

### Live toggle

```ts
function onChanged(changes, area) {
  if (area !== "local" || !(AUDIO_KEY in changes)) return;
  enabled = changes[AUDIO_KEY].newValue === true;
  if (!enabled) silence();
}

function silence() {
  if (!ctx) return;
  const c = ctx, m = master!;
  for (const v of voices) v.stop();                    // stop sources now
  m.gain.cancelScheduledValues(c.currentTime);
  m.gain.setValueAtTime(m.gain.value, c.currentTime);
  m.gain.linearRampToValueAtTime(0, c.currentTime + CLOSE_RAMP_S);
  setTimeout(() => void c.close().catch(() => {}), CLOSE_RAMP_S * 1000);
  ctx = null; master = null; voices.clear();           // next play() creates a new one
}
```

The module drops its references at once, so a `play` that arrives after the toggle sees `enabled === false` and returns, and a `play` after the toggle goes back on builds a fresh context (criterion 9). The context is closed (not just suspended) so the browser releases the audio device and the tab's audio indicator goes away. A fake in unit tests records `close()` calls; the 30ms timer is driven by fake timers.

`dispose()` calls `silence()` and removes the `onChanged` listener.

### Sounds

Each entry in `SOUNDS` takes `(ctx, master)`, builds its nodes, schedules every `start` and `stop`, and returns a `Voice`:

```ts
interface Voice {
  stop(): void;                  // stop all sources now
  disconnect(): void;
  onEnded(fn: () => void): void; // fires when the last source ends
}
```

A shared helper `envelope(g: GainNode, t0, attack, peak, hold, release)` sets the gain to 0 at `t0`, ramps to `peak` over `attack`, holds, then ramps back to 0 over `release`. It uses `linearRampToValueAtTime` for the attack and `setTargetAtTime`-free linear ramps for the release so the end gain is exactly 0 (criterion 19). Every source gets `stop(t0 + SOUND_DURATION[kind])`.

| Kind | Graph | Parameters |
| --- | --- | --- |
| `whoosh` | noise `AudioBufferSource` → `bandpass` (Q 3) → envelope gain → master | Buffer of 0.9s mono white noise made by filling a `Float32Array` with `Math.random() * 2 - 1`. Filter frequency `exponentialRampToValueAtTime`: 200 Hz at 0, 2400 Hz at 0.9s. Envelope: attack 0.30s to peak 0.9, release 0.45s. |
| `ghost` | `sine` 392 Hz and `sine` 392 Hz detuned +7 cents → envelope gain → master. Vibrato: `sine` LFO 5.5 Hz → gain 4 (cents, about ±12 cents at most) → both oscillators' `detune` | Attack 0.25s, peak 0.5, release 0.4s, total 0.8s. |
| `thud` | `sine` 90 Hz falling to 40 Hz in 0.25s (`exponentialRampToValueAtTime`) → gain; plus noise burst 0.06s → `lowpass` 300 Hz → gain; both → master | Attack 0.005s, peak 0.9, release 0.35s, total 0.5s. |
| `sting` | `sawtooth` 220 Hz and `sawtooth` 311.1 Hz (ratio 1.414, a tritone) → `lowpass` 900 Hz → envelope gain → master | Attack 0.01s, peak 0.5, release 0.45s, total 0.6s. |
| `organ` | `square` 55, 110 and 165 Hz (gains 0.5, 0.3, 0.2) → `lowpass` 600 Hz → envelope gain → master | Attack 0.02s, peak 0.6, release 0.5s, total 0.7s. |

Peak values are below 1 before the master (criterion 17), and the master then scales by 0.2. Worst case the output peaks at 0.2 of full scale. The LFO in `ghost` runs 5.5 Hz in pitch, not in loudness, and every envelope is a single rise and fall, so nothing pulses faster than 3 per second (criterion 44).

All five are original synthesized tones. No sample or recording is used.

### Noise buffers

`whoosh` and `thud` need noise. The buffer is made in `play`, not at import, so the muted path builds nothing (criterion 2). The module keeps no global state at load: no context, no buffer, no listener.

## Call sites

### Popup (`src/popup/app.ts`, `src/popup/popup.ts`)

`popup.ts` builds the player once and hands it to `mountPopup`:

```ts
const player = createPlayer({ storage: chrome.storage, createContext: () => new AudioContext() });
await mountPopup(root, chrome, location.search, { play: player.play });
```

`mountPopup` takes an optional fourth argument `{ play?: (k: SoundKind) => void }` so existing tests that call it with three arguments still work. In the Haunt button handler:

```ts
if (!current.haunted) opts.play?.("whoosh");   // synchronous, same task as the click
const next = await ask(current.haunted ? "UNHAUNT" : "HAUNT");
```

`play` returns at once and never throws, so the `HAUNT` request is not delayed (criterion 31). The condition `!current.haunted` is the Haunt side of the toggle button (criterion 30). If the haunt then fails, the whoosh has already played. That is a small cost for starting in the click's task, and the error line still shows. The cleaner alternative, playing after the reply, loses the gesture on slow pages and starts late relative to the wipe, so it is rejected.

The `settings.ts` toggle is unchanged. It writes `audioEnabled`, `onChanged` fires in every player, including this popup's (criterion 12).

### Content script (`src/content/costume/`)

`render.ts` builds the content player when it mounts the costume and disposes it on un-haunt:

```ts
const player = createPlayer({ storage: chrome.storage, createContext: () => new AudioContext() });
// passed to mountGhosts / mountTombstones / mountCurses as opts.play
// on un-haunt: player.dispose()
```

Each opener calls `opts.play?.(kind)` in the handler that opens the card, after it decides to open it:

| Card | Kind | Where |
| --- | --- | --- |
| Ghost (tracker company, not a vampire) | `ghost` | `openCard` in `card.ts`, `vampire` false |
| Vampire (caught or known) | `organ` | `openCard` in `card.ts`, `vampire` true |
| Tombstone | `thud` | tombstone marker click handler |
| Curse | `sting` | curse badge click handler (`opts.onOpen`) |

Toggling the same marker to close the card, or re-clicking an open card, returns before `play` (criterion 34). Reduced motion does not enter this path (criterion 41).

Because `createPlayer` is called at haunt time and `dispose` runs at un-haunt, each haunt gets a fresh player and a fresh context, and un-haunt leaves nothing behind. A page that is haunted again re-reads `audioEnabled`.

## Interaction with existing specs

- **costume-renderer, requirement 50**: now points here. The content script's haunt moment is silent (criterion 35).
- **runtime-vampires**: no change. The hooks, the bridge and the vampire list stay as they are. This spec only adds a test that proves we do not appear in them.
- **scaffold (task 7.13)**: the popup toggle already persists `audioEnabled`. Nothing in the toggle changes.
- **Permissions**: nothing new. `AudioContext`, `chrome.storage.local` and `chrome.storage.onChanged` need no permission beyond `storage`, which is declared.

## Testing

### Unit (`test/sound/`, Bun)

A `FakeAudioContext` records every constructor call and every node it creates (`createGain`, `createOscillator`, `createBufferSource`, `createBiquadFilter`, `createBuffer`), with `state`, `currentTime`, `resume()` and `close()` spies. Each node records `start`, `stop`, `connect` and its `AudioParam` calls (`setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `cancelScheduledValues`). The test passes it as `createContext` and a minimal storage mock from `test/chrome-mock.ts` (which already has `storage.local` and `onChanged.listeners`).

`test/sound/sound.test.ts`:

- Muted by default: after `createPlayer`, `play` for every kind, constructor count is 0 and no node exists (1 to 3). A rejected `get` and a missing key behave the same (4).
- On: set `audioEnabled` true, `play("ghost")` makes one context, one master gain with `gain.value <= 0.25`, and the master is the only node connected to `destination` (13, 15, 17).
- Every source's `stop` argument is at most `currentTime + 1.2` for every kind (18).
- Second `play` reuses the context (13). A second player makes a second one (14).
- Suspended context: `resume` is called once and `play` still returns synchronously (16).
- Toggle off mid-session: `onChanged` with `newValue: false` stops active sources, ramps the master to 0, calls `close()` after 30ms (fake timers), and the next `play` creates nothing (8). Toggle on again and `play` makes a second context (9, 10).
- Toggle on alone constructs nothing (10).
- Non-`local` areas and unrelated keys are ignored (7).
- Cap: a fifth concurrent `play` does nothing (21). Same kind twice within 150ms plays once (22).
- A Web Audio error thrown by the fake does not escape `play`.
- `dispose` removes the listener and closes the context.
- Source scan: read `src/audio/sound.ts` as text and assert it contains none of `OfflineAudioContext`, `startRendering`, `fetch(`, `XMLHttpRequest`, `decodeAudioData`, `getChannelData`, `loop = true`, `setInterval`, `.src` (6, 23, 37).

`test/sound/sounds.test.ts`: per kind, the node types and key numbers from the table (24 to 28), `SOUND_DURATION` values, `SOUND_KINDS` order (29), and each envelope's first and last gain values are 0 (19).

`test/sound/call-sites.test.ts`:

- Popup: with a spy `play`, clicking Haunt calls `whoosh` once before the mocked `HAUNT` reply resolves. Un-haunt, a rejected haunt on the restricted screen, and initial render call it zero times (30, 31, 51). A test that calls `mountPopup` with three arguments still passes.
- Card openers: with a spy `play`, opening a ghost, vampire, tombstone and curse card gives `ghost`, `organ`, `thud`, `sting`, once each. Closing, re-clicking, hovering, a new marker appearing and un-haunt give none (32 to 35, 52).
- `src/content/hooks.ts` and the files it imports contain no import of `src/audio/` (36).

### e2e (`e2e/sound.spec.ts`, Playwright)

Counting contexts from inside a page cannot see the isolated world, so the test uses the DevTools `WebAudio` domain, which reports every `AudioContext` in the tab:

```ts
const cdp = await page.context().newCDPSession(page);
const created: string[] = [], destroyed: string[] = [];
cdp.on("WebAudio.contextCreated", (e) => created.push(e.context.contextId));
cdp.on("WebAudio.contextWillBeDestroyed", (e) => destroyed.push(e.contextId));
await cdp.send("WebAudio.enable");
```

Tests, each against the fixtures with the extension loaded from `dist-e2e/`:

1. **Off by default.** Haunt `trackers.html`, open a ghost card and a vampire card, haunt `links.html`, open a tombstone card, haunt `dark-patterns.html`, open a curse card. `created` stays empty (53).
2. **On creates one.** Set `audioEnabled` true through the service worker (`chrome.storage.local.set`), open a ghost card, `expect.poll` until `created.length === 1`. Open a curse card, `created.length` is still 1 (13, 53).
3. **No vampire for us.** With sound on, on `clean.html` open every card kind available, then read the vampire list from the popup and the badge. Vampires are 0. A page-world `addInitScript` wraps `window.AudioContext` and counts calls, and the count is 0 (39).
4. **Same vampires either way.** On `vampires.html`, trigger the fingerprinting, and compare the vampire rows with sound off and on. They match: the two page scripts, and nothing for the extension (54).
5. **Toggle off closes.** Turn sound on, open a card (`created.length === 1`), set `audioEnabled` false, poll until `destroyed.length === 1`. Open another card, no new context. Turn on and open a card, `created.length === 2` (55).
6. **Popup whoosh.** With sound on, open the popup page in a tab with a CDP session and click Haunt. A context is created in the popup (the popup page is the target of that session). With sound off, none is (30). Playwright cannot open the toolbar popup, so the test opens `popup.html` as a tab, the way the existing popup e2e does.

Headless Chromium has a fake audio device, so contexts are created and closed without a speaker. Nothing in the tests asserts on audible output.

The visual baselines do not change, because this spec changes no pixel (criterion 56).
