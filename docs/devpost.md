# Haunted GeoCities

A Chrome extension (Manifest V3) that dresses the page you are on as a 1998 GeoCities crypt, and uses the costume to show you what the page is doing to you: trackers become ghosts, fingerprinting scripts become vampires, dead links get tombstones and dark patterns get cursed. Un-haunt puts the page back as it was.

Entry for Kiroween 2026, Costume Contest.

A pre-period prototype exists outside the entry and was rebuilt from lessons, not copied; Tracker Radar ingest output is the only reused data.

## Inspiration

The old GeoCities pages were loud, but you could see everything they did. A modern page looks calm and hides a lot: third-party trackers, scripts that read your canvas to fingerprint you, "only 2 left" banners, links that go nowhere. We wanted a costume that makes the hidden parts visible, in the style of a page where nothing was hidden.

## What it does

- **Haunt and un-haunt** any page from the toolbar popup. The page itself is restyled as a 1998 page (Times New Roman text, Comic Sans headings, blue underlined links, a parchment tint and a ridged guestbook frame around the content column), and the night sky, a heads-up display along the bottom and a marquee sit in a closed shadow root over it. Un-haunting removes it and leaves the page's DOM as it was before. The haunt itself is a three-second show: the page dies like an old CRT, the Webmaster's Ghost wipes 1998 in while six big ghosts stream up through the whole page, then the tracker ghosts rise into place with their name tags. The six big ghosts are the page's own tracker companies, each carrying its name (decorative ghosts only fill in when a page has fewer than six); on a phone they ride along the top bar instead, so they never cover the text. A click or any key skips the show and the page settles at once. With reduced motion on it is a plain fade.
- **Ghosts.** Trackers show up as ghosts, one per company, matched against the bundled DuckDuckGo Tracker Radar data. Click a ghost for its card. On a phone or a full-width page they stand in a graveyard strip docked above the HUD, and the HUD hit counter says what it counts: souls counted, tracker requests blocked or seen.
- **Exorcise** blocks a tracker company for the current tab with declarativeNetRequest session rules. Its ghost spirals out to a faded look as an EXORCISED stamp slams on, and the HUD count of ghosts still haunting ticks down. The block lasts until you un-haunt, reload or leave the page, or close the tab, and the popup can let it back in.
- **Vampires.** Scripts caught fingerprinting while the page is haunted (canvas readback, AudioContext, font probing) become vampires. Companies Tracker Radar already rates as fingerprinters are listed as known vampires.
- **Tombstones.** The extension sends a HEAD request for links on the page. A 404 or 410 answer puts a tombstone beside the link, and clicking it opens a stone card with the path and the status. Links to other sites are only checked if you switch that on in the popup and grant the optional host permission.
- **Curses.** Dark patterns get a CURSED! badge: fake scarcity, countdown text, ticking timers, confirmshaming and pre-checked opt-in boxes. The card quotes the page's own words and names the trick. A pre-checked box is only labelled, never unticked.
- **Neighborhoods.** Every site gets a GeoCities address such as `SiliconValley/Heights/2049`, worked out from its host name, shown in a bar at the top with the neighborhood's tagline and in the popup.
- The popup lists everything found on the page, and while a page is haunted the toolbar icon shows how many ghosts, vampires, tombstones and curses that tab has.
- **Sound effects**, off by default. Switch them on in the popup and the Haunt click plays a short whoosh, and each card opens with a sound of its own: a soft "ooo" for a ghost, a stone thud for a tombstone, a sting for a curse and a low organ stab for a vampire. Nothing plays until you click.

There are no host permissions at install. The tracker data is bundled and matched locally, and link checks are sent without cookies.

The code is MIT. The bundled tracker data, `src/data/trackers.json`, comes from the DuckDuckGo Tracker Radar and is CC BY-NC-SA 4.0, separate from the code.

## How we built it

TypeScript, built with Vite into an MV3 extension: a service worker, a content script injected with `chrome.scripting` when you click Haunt, and a popup.

- The costume lives in a closed shadow root with adopted stylesheets, so page CSS can't reach it and it can't reach the page. Apart from the overlay's host element, the only change to the page is one adopted stylesheet: it pads the body for the bands and the HUD and holds the restyle, and both go on un-haunt. The parchment tint is a `mix-blend-mode: multiply` pseudo-element in that stylesheet, because a blend inside the fixed shadow host only blends with the host itself.
- Ghosts come from the page's resource timing entries, matched by host against the Tracker Radar data.
- Vampire detection injects observe-only wrappers into the page's main world for the canvas, audio and font APIs. A wrapper reads the call stack to find which script called it, reports through a per-haunt nonce event, and is removed again on un-haunt.
- Exorcise uses declarativeNetRequest session rules aimed at one tab.
- The sounds are made in code with the Web Audio API, with no audio files. Card sounds come from the content script's isolated world, so the vampire wrappers in the page's main world never see them and the extension never catches itself.
- The art is original pixel art, in web-safe colours, with Comic Sans MS and Times New Roman.

### How Kiro was used

The `.kiro/` folder holds what kiro-cli generated for the project. No MCP servers or Kiro powers were used: Kiro was used through kiro-cli to write the steering, the specs, the hooks and a custom agent.

- **6 steering files**, all included on every request: product, structure, tech, era accuracy (216 web-safe colours, two fonts, original pixel art, nothing a 1998 page would not have had), accessibility and motion, and non-destructive DOM.
- **10 specs**, each with requirements, a design and a task list: `scaffold`, `tracker-detector`, `costume-renderer`, `tombstones`, `runtime-vampires`, `dark-patterns`, `neighborhoods`, `sound-effects`, `kiro-hooks` and `rule-factory`.
- **5 Kiro hooks**, each on its own trigger so no save sets off two of them. On save, `manifest-lint` runs `bun run lint:manifest` when the manifest or the Vite config changes, `visual-regression` runs `bun run test:visual` when the costume or the popup changes, and `rule-factory` fires when the dark-pattern rules or the neighborhood data change and asks the agent to check that the new entry has a test, a fixture or example and era-accurate copy, then run `bun run test`, without changing any file. When the agent finishes a turn, `era-accuracy` asks it to review its own costume and popup diff against the era steering file, again without changing any file. By hand, `baseline-refresh` generates rather than checks: it asks the agent to run `bun run visual:baselines` in Docker and summarise which baseline PNGs changed, committing nothing. A unit test checks that every hook's command is a real script, every pattern points at a real path and no repo file sets off two hooks on one save.
- **1 custom agent** in `.kiro/agents/`: `costume-reviewer`, a read-only era reviewer for kiro-cli. It loads the era steering file and the design reference, starts with the costume and popup `git diff` from an `agentSpawn` hook, and has only the `fs_read` tool. A unit test keeps it read-only.
- The `rule-factory` spec is a repeatable recipe: give the agent one line, such as a new low-stock phrase or a neighborhood for fishing sites, and it writes the failing tests first, then the regex or the JSON entry, updates the tests that pin counts, and ends with `bun run typecheck` and `bun run test` passing. The hook is the second pair of eyes on the result.

### Tests

- more than 1200 unit tests (`bun run test`), with happy-dom for the DOM parts.
- more than 150 end-to-end tests (`bun run test:e2e`) that load the unpacked extension in headless Chromium and drive it on local fixture pages, including checks that un-haunting leaves the page byte for byte as it was.
- 28 visual screenshot tests (`bun run test:visual`): the costume on eight fixture pages, the popup before and after haunting, the `permissions.html` dialog, a ghost just exorcised (its stamp, its 40% look and the HUD ghost count at 0) and the haunt moment frozen mid-parade, each at 1280 and 375 pixels wide, plus the graveyard strip with an exorcised ghost and an open card at 375 and the HUD with its whole web ring at 700, compared with baselines made in the Playwright Docker image.
- `bun run lint:manifest` checks the shipping manifest: MV3, the four permissions and nothing more, no remote code, no `'unsafe-eval'`.
- `bun run docker:test` runs all of the above in a clean Playwright image.

## Challenges

- **Leaving the page alone.** Every feature had to draw on top of a page without breaking its scripts, forms or layout, and un-haunting had to restore it exactly. The e2e tests compare the page's markup before haunting and after un-haunting.
- **Finding who fingerprinted you.** The wrappers run in the page's world, where the page could see them. They keep their state in a closure, put nothing on `window`, and work out the calling script from the stack.
- **Placing things beside text, not on it.** Ghosts stay in the gutters on wide pages and dock in a graveyard strip above the HUD on narrow and full-width ones, and badges and cards are kept clear of text and at least 8px from the viewport edges at 1280 and 375 pixels.
- **Stable screenshots.** Fonts differ between machines, so the visual baselines are made and checked in the same Docker image, with motion reduced, animations stopped and the page clock fixed.
- **Permissions.** Chrome's permission prompt closes the popup, so the cross-site link check opens a small extension page in a tab and asks there.

## Accomplishments

- One click in, one click out, and the page is the same afterwards.
- Four kinds of hidden behaviour (trackers, fingerprinting, dead links, dark patterns) shown in one costume, with no host permissions at install.
- Reduced motion is respected throughout: a cross-fade instead of the ghost wipe, a still marquee and still ghosts.

## What we learned

- Writing the requirements, design and task list before the code kept each feature small enough to test on its own.
- A closed shadow root plus adopted stylesheets is a solid way to put a large overlay on any page.
- Screenshot tests are only useful if they come out the same on every run, and that takes a fixed environment, not looser tolerances.

## What's next

- More dark patterns, and more neighborhoods.
- A Chrome Web Store listing.

## Built with

TypeScript, Chrome Extensions Manifest V3, Shadow DOM, declarativeNetRequest, Web Audio API, Vite, Bun, happy-dom, Playwright, Docker, DuckDuckGo Tracker Radar data (CC BY-NC-SA 4.0), Kiro.

## Try it

**From the release.** Download `dist.zip` from the GitHub release, unzip it into an empty folder, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick that folder.

**From source.** You need [bun](https://bun.sh) and Chrome:

```
bun install
bun run build
```

Then **Load unpacked** the `dist/` folder. `bun run package` builds and writes the same `dist.zip`.

Open a page, click the toolbar icon and choose **Haunt this page**. The fixture pages in the repo (`bun run fixtures`) show every feature; the README explains which ones need Chrome's host-resolver flag.
