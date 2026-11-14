# Tasks: Sound Effects (R9)

Implementation checklist for the sound-effects spec. Each task names the requirement numbers it satisfies (`requirements.md`) and the test that proves it. Unit tests live under `test/sound/` (Bun) and the e2e test in `e2e/sound.spec.ts` (Playwright).

Do the tasks in order: each group builds on the one before. Run `bun run typecheck` and `bun run test` after every group. Task 1 is done with this spec. Everything else changes files outside `.kiro/` and is still to do.

## 1. Spec

- [x] 1.1 Write `requirements.md`, `design.md` and `tasks.md` in `.kiro/specs/sound-effects/`.

- [x] 1.2 Update requirement 50 in `.kiro/specs/costume-renderer/requirements.md` to point to this spec instead of saying audio is out of scope.
  - Req: 48

## 2. Sound module (`src/audio/sound.ts`)

- [x] 2.1 Create the module with `SOUND_KINDS`, `SoundKind`, `SOUND_DURATION`, `MASTER_GAIN` (0.2), `MAX_SECONDS`, `MAX_VOICES`, `DEBOUNCE_MS`, `CLOSE_RAMP_S`, `PlayerDeps`, `Player` and `createPlayer`. Importing it shall build nothing and register nothing.
  - Req: 6, 15, 29
  - Test: `test/sound/sound.test.ts` → `"importing the module constructs nothing"`, `"SOUND_KINDS lists the five kinds"`, `"every SOUND_DURATION is at most 1.2"`, `"MASTER_GAIN is at most 0.25"`.

- [x] 2.2 Add the fake for tests: `test/sound/fake-audio.ts` with `FakeAudioContext` (constructor count, node log, `state`, `currentTime`, `resume`, `close`) and fake nodes that record `start`, `stop`, `connect` and `AudioParam` calls.
  - Req: 49
  - Test: used by every test in tasks 2.3 to 2.9.

- [x] 2.3 Implement the start-up and the muted path: read `audioEnabled` once, follow `chrome.storage.onChanged`, treat a failed read or a missing key as muted, make `play` return at once when muted.
  - Req: 1, 2, 3, 4, 5, 7, 11
  - Test: `test/sound/sound.test.ts` → `"muted by default: play constructs no context and no node"`, `"a rejected storage read stays muted"`, `"a missing key stays muted"`, `"only the value true turns sound on"`, `"never writes storage"`, `"ignores other areas and other keys"`.

- [x] 2.4 Implement the lazy shared context and the master gain: `ensureContext` builds one `AudioContext` and one master `GainNode` (0.2) connected to `destination`, and only the master connects there. Call `resume()` when suspended.
  - Req: 13, 14, 15, 16, 17
  - Test: `test/sound/sound.test.ts` → `"first play creates one context and one master gain"`, `"master gain is at most 0.25"`, `"only the master connects to destination"`, `"a second play reuses the context"`, `"two players make two contexts"`, `"a suspended context is resumed once and play stays synchronous"`, `"toggling on alone constructs nothing"`.

- [x] 2.5 Implement voices: the `envelope` helper (gain 0 at both ends), an explicit `stop` on every source, disconnect on end, the 4-voice cap and the 150ms debounce per kind, and a `try`/`catch` around the whole `play` body.
  - Req: 18, 19, 20, 21, 22, 23
  - Test: `test/sound/sound.test.ts` → `"every source stops within 1.2 seconds, for every kind"`, `"nodes are disconnected when a source ends"`, `"a fifth concurrent play does nothing"`, `"the same kind twice within 150ms plays once"`, `"a Web Audio error does not escape play"`.

- [x] 2.6 Implement the live toggle: on `audioEnabled` true to false, stop active sources, ramp the master to 0 over 30ms, close the context after the ramp, drop the references. Implement `dispose`.
  - Req: 8, 9, 10, 12
  - Test: `test/sound/sound.test.ts` → `"toggle off mid-session stops sources, ramps the master to 0 and closes the context"`, `"play after toggle off constructs nothing"`, `"toggle on again then play creates a new context"`, `"dispose closes the context and removes the listener"`.

- [x] 2.7 Implement `whoosh`: 0.9s noise buffer (made inside `play`), `bandpass` filter ramping 200 to 2400 Hz exponentially, envelope peaking near the middle and ending at 0.
  - Req: 24, 19
  - Test: `test/sound/sounds.test.ts` → `"whoosh: a bandpass sweeps 200 to 2400 Hz over 0.9 seconds"`, `"whoosh: the noise buffer is 0.9 seconds"`, `"whoosh: gain starts and ends at 0"`.

- [x] 2.8 Implement `ghost`, `thud`, `sting` and `organ` as in the design table.
  - Req: 25, 26, 27, 28, 19, 44
  - Test: `test/sound/sounds.test.ts` → `"ghost: two sines detuned 7 cents with a 5.5 Hz vibrato of at most 12 cents"`, `"thud: a sine falls from 90 to 40 Hz in 0.25 seconds"`, `"sting: two sawtooths a tritone apart through a lowpass"`, `"organ: square oscillators at 55, 110 and 165 Hz through a lowpass"`, `"every sound's gain starts and ends at 0"`, `"no source loops"`.

- [x] 2.9 Add the source scan: the module text has no `OfflineAudioContext`, `startRendering`, `fetch(`, `XMLHttpRequest`, `decodeAudioData`, `getChannelData`, `loop = true` or `setInterval`.
  - Req: 6, 23, 37
  - Test: `test/sound/sound.test.ts` → `"the source uses no forbidden API"`.

## 3. Popup whoosh

- [x] 3.1 In `src/popup/popup.ts`, build one player (`createPlayer({ storage: chrome.storage, createContext: () => new AudioContext() })`) and pass `{ play }` to `mountPopup` as a new optional fourth argument.
  - Req: 12, 14
  - Test: `test/sound/call-sites.test.ts` → `"mountPopup works with three arguments"`.

- [x] 3.2 In `src/popup/app.ts`, call `play("whoosh")` from the Haunt click handler, before `await ask("HAUNT")`. Do not call it on Un-haunt or on the restricted screen. Leave the `HAUNT` flow, the screen change and the error line as they are.
  - Req: 30, 31, 36
  - Test: `test/sound/call-sites.test.ts` → `"Haunt click plays whoosh once, before the HAUNT reply"`, `"Un-haunt plays nothing"`, `"the restricted screen plays nothing"`, `"first render plays nothing"`, `"the HAUNT message is sent exactly as before"`. Re-run `test/popup.test.ts` unchanged.

- [x] 3.3 Confirm `src/popup/settings.ts` and its sub-lines are unchanged.
  - Req: 5, 43
  - Test: `test/popup.test.ts` → the existing `"turning on persists audioEnabled and updates the sub-line"` passes unchanged.

## 4. Card sounds

- [x] 4.1 In `src/content/costume/render.ts`, create the content player when the costume mounts, pass `play` to the ghost, tombstone and curse mounts as `opts.play`, and call `player.dispose()` on un-haunt.
  - Req: 13, 14, 35, 38
  - Test: `test/sound/call-sites.test.ts` → `"each haunt makes a new player"`, `"un-haunt disposes the player"`, `"the haunt moment plays nothing"`.

- [x] 4.2 In `src/content/costume/card.ts`, call `play("ghost")` when a tracker company card opens and `play("organ")` when a vampire card opens, in the click path, after the decision to open. A close or a re-click on an open card plays nothing.
  - Req: 32, 33, 34
  - Test: `test/sound/call-sites.test.ts` → `"opening a ghost card plays ghost"`, `"opening a vampire card plays organ"`, `"closing a card plays nothing"`, `"re-clicking an open card plays nothing"`.

- [x] 4.3 In `src/content/costume/tombstones.ts`, call `play("thud")` when a tombstone card opens.
  - Req: 32, 33, 34
  - Test: `test/sound/call-sites.test.ts` → `"opening a tombstone card plays thud"`, `"a new tombstone marker appearing plays nothing"`.

- [x] 4.4 In `src/content/costume/curses.ts`, call `play("sting")` when a curse card opens.
  - Req: 32, 33, 34
  - Test: `test/sound/call-sites.test.ts` → `"opening a curse card plays sting"`, `"a new curse badge appearing plays nothing"`.

- [x] 4.5 Check that no card sound is tied to hover, focus, a timer or an observer, and that reduced motion does not change which sounds play.
  - Req: 33, 41
  - Test: `test/sound/call-sites.test.ts` → `"hover and focus play nothing"`, `"reduced motion plays the same sounds"`.

- [x] 4.6 Check that `src/content/hooks.ts`, `src/content/hooks-bridge.ts` and the MAIN-world bundle do not import `src/audio/`.
  - Req: 36, 40
  - Test: `test/sound/call-sites.test.ts` → `"the MAIN-world hooks do not import the sound module"`.

- [x] 4.7 Run `bun run typecheck`, `bun run test` and `bun run lint:manifest`. The manifest shall be unchanged.
  - Req: 45, 46, 56
  - Test: all three exit 0; `git diff --stat src/manifest.ts` is empty.

## 5. e2e (`e2e/sound.spec.ts`)

- [x] 5.1 Add a helper that opens a CDP session on a page, enables `WebAudio`, and records `contextCreated` and `contextWillBeDestroyed`. Add a helper that sets `audioEnabled` through the service worker.
  - Req: 53
  - Test: used by tasks 5.2 to 5.6.

- [x] 5.2 Sound off: open a ghost, a vampire, a tombstone and a curse card on the fixtures. No context is created.
  - Req: 2, 53
  - Test: `e2e/sound.spec.ts` → `"with sound off, opening cards creates no AudioContext"`.

- [x] 5.3 Sound on: opening a card creates exactly one context, and a second card on the same page reuses it.
  - Req: 13, 53
  - Test: `e2e/sound.spec.ts` → `"with sound on, opening a card creates one AudioContext and reuses it"`.

- [x] 5.4 No vampire for the extension: with sound on, open every card kind on `clean.html`. The vampire list and badge are unchanged, and a page-world counter on `window.AudioContext` reads 0.
  - Req: 37, 38, 39, 54
  - Test: `e2e/sound.spec.ts` → `"sound on never adds a vampire for the extension"`.

- [x] 5.5 Same vampires either way: on `vampires.html`, the vampire rows with sound off and with sound on are identical.
  - Req: 39, 54
  - Test: `e2e/sound.spec.ts` → `"vampires.html shows the same vampires with sound off and on"`.

- [x] 5.6 Toggle off closes: with a context open, setting `audioEnabled` to false destroys it, the next card creates nothing, and turning it on then opening a card creates a new one.
  - Req: 8, 9, 55
  - Test: `e2e/sound.spec.ts` → `"turning sound off closes the context and it is recreated lazily"`.

- [x] 5.7 Popup whoosh: open `popup.html` as a tab, click Haunt with sound on and a context is created; with sound off none is.
  - Req: 2, 30
  - Test: `e2e/sound.spec.ts` → `"the Haunt click plays from the popup only when sound is on"`.

- [x] 5.8 Run `bun run test:e2e`, `bun run test:visual` and `bun run docker:test`. No baseline changes.
  - Req: 56
  - Test: all three exit 0; `git status` shows no change under `e2e-visual/__screenshots__/`.

## 6. Docs

- [x] 6.1 In `README.md` "What it does", add one line: sound is off by default, and when it is on the Haunt click whooshes and each card makes a short sound. Add `src/audio/sound.ts` to any file list the README keeps, and mention the new spec in "How Kiro was used" (`sound-effects`).
  - Req: 47
  - Test: `test/project.test.ts` still passes, and `grep -n "Sound" README.md` shows the line.

- [x] 6.2 Update `design/DESIGN.md` "Haunt moment" Audio line to say the popup plays the whoosh on the Haunt click, and "Row: audio toggle" to list the card sounds. The sub-lines stay as they are.
  - Req: 48, 43
  - Test: `test/design.test.ts` passes.
