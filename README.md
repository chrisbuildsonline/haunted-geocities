# Haunted GeoCities

A Chrome extension (Manifest V3) that turns the page you are on into a 1998 GeoCities crypt. Click **Haunt** and the page itself turns 1998: Times New Roman text, Comic Sans headings, blue underlined links and a parchment column in a ridged guestbook frame, under a night sky, a heads-up display and a marquee. Click **Un-haunt** and the page is put back as it was. It is an entry in Kiroween 2026, Costume Contest.

A pre-period prototype exists outside the entry and was rebuilt from lessons, not copied; Tracker Radar ingest output is the only reused data.

![A haunted page: the article in Times New Roman on a parchment column inside a ridged guestbook frame, a tracker ghost and two vampires in the starfield, the HUD along the bottom](docs/screenshots/haunted.png)

## What it does

- Haunting is a three-second show: the page switches off like an old CRT (scanlines, the picture closes to a bright line, then a dot), the Webmaster's Ghost flies across and leaves 1998 behind it, and then the tracker ghosts rise out of the page one by one, each with its company's name tag. With reduced motion on, it skips straight to the haunted page.
- Haunt and un-haunt any page from the toolbar popup. The page is restyled (fonts, link colours, a parchment tint and a guestbook frame around the content column) by one adopted stylesheet, and the starfield, HUD and marquee sit in a closed shadow root over it. On a phone or a full-width page the whole page is tinted inside a 12px starfield edge. Un-haunting removes it all and the page is byte for byte as it was.
- Trackers show up as ghosts, one per company, matched against the bundled DuckDuckGo Tracker Radar data. Click a ghost for its card. On a phone or a full-width page, where there is no room beside the text, the ghosts and vampires stand in a graveyard strip just above the HUD instead, and scroll sideways when there are many.
- The HUD hit counter is labelled `Souls counted`: the number of tracker requests blocked or seen on the page.
- Exorcise blocks a company for the current tab with declarativeNetRequest session rules. The block lasts until you un-haunt, reload or leave the page, or close the tab, and the popup can let it back in.
- Scripts caught fingerprinting at runtime (canvas, audio or font probing) become vampires. Companies that Tracker Radar already rates as fingerprinters are listed as known vampires.
- Dead links get a tombstone beside them. The extension sends a HEAD request, and a 404 or 410 answer makes a tombstone. Clicking one opens a stone card with the path and the status.
- Dark patterns get a CURSED! badge beside them: fake scarcity ("Only 2 left"), countdown text, ticking timers, confirmshaming and pre-checked opt-in boxes. Clicking a badge opens a card that quotes the page's own words and names the trick. The pre-checked box is only labelled, never unticked.
- Every site gets a GeoCities neighborhood address, such as `SiliconValley/Heights/2049`, worked out from its host name. The bar at the top shows it with the neighborhood's tagline, and the popup shows it under the site title.
- The popup is dressed for the same year as the page: a Windows 95 window with a navy title bar, bevelled buttons, green-on-black hit counters, checkboxes and a status bar. It lists the ghosts, vampires, tombstones and curses found on the page.
- While a page is haunted, the toolbar icon shows how many ghosts, vampires, tombstones and curses that tab has.
- Sound is off by default. Turn on **Sound effects** in the popup and the Haunt click plays a short whoosh, and opening a card plays a short sound for its kind: a soft "ooo" for a ghost, a stone thud for a tombstone, a sting for a curse and an organ stab for a vampire. The sounds are made in code with the Web Audio API (`src/audio/sound.ts`), with no audio files, and nothing plays until you click.

![The haunt moment on a news page: the screen dies like a CRT, the Webmaster's Ghost wipes in the 1998 costume, and four tracker ghosts rise one by one with their company name tags](docs/screenshots/haunt.gif)

![The popup on a haunted page, drawn as a Windows 95 window: hit counters, one ghost, two vampires and their Exorcise buttons](docs/screenshots/popup.png)

![A stone card for a dead link on the links fixture](docs/screenshots/tombstone.png)

![CURSED! badges on the coffee shop fixture, with one curse card open](docs/screenshots/curses.png)

![The neighborhood bar at the top of a haunted page, with its address and tagline](docs/screenshots/neighborhood.png)

## Load it

You need [bun](https://bun.sh) and Chrome.

```
bun install
bun run build
```

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick the `dist/` folder.

The test build is `dist.zip`, attached to the GitHub release. Unzip it into an empty folder and load that folder with **Load unpacked**. To make the same zip yourself, run `bun run package`. It builds and writes `dist.zip` at the repo root with `manifest.json` at the top of the zip.

Open a page and click the toolbar icon, then **Haunt this page**.

## Fixtures walkthrough

The fixture pages are small made-up sites in `fixtures/`. Start the server:

```
bun run fixtures
```

It serves them on `http://127.0.0.1:4321` (`scripts/fixture-server.ts`, an optional port can be passed as an argument).

| Page | What it shows |
| --- | --- |
| `index.html` | A plain newspaper page with a form and links. Haunt it and un-haunt it. |
| `clean.html` | A quiet page with no trackers. |
| `column.html` | A long article, good for seeing the costume around a page. |
| `article.html` | A plain white article with code, an icon and a form: the restyle, the tint and the guestbook frame. |
| `dark.html` | A dark page: no tint, light-blue links. |
| `trackers.html` | Ghosts (Criteo), plus Hotjar and Taboola as known vampires. Try Exorcise on the card or in the popup. At a phone width they stand in the graveyard strip above the HUD. |
| `news.html` | A small-town news front page with four tracker ghosts (Criteo, Chartbeat, Quantcast, comScore) and two known vampires: the page the haunt moment GIF is made on. |
| `wide.html` | A full-width page with trackers: no room beside the text at any width, so the ghosts and vampires stand in the graveyard strip. |
| `vampires.html` | Two scripts that fingerprint the visitor when you click into the email field. After that they show up as caught vampires. |
| `links.html` | Three dead links (404, 410 and a long path) that get tombstones. |
| `dark-patterns.html` | A fake coffee shop cart with low-stock lines, an offer countdown, a ticking clock, a pre-checked newsletter box and a shaming decline link. Haunt it for six curses. |
| `forms.html` | Page scripts and a form that haunting must leave alone. |

The tracker and vampire pages load scripts from real tracker domains. Chrome has to send those names to the local server, so start a separate Chrome with a host-resolver flag, and load the extension in that one:

```
google-chrome --user-data-dir=/tmp/hg-profile --host-resolver-rules="MAP criteo.com 127.0.0.1,MAP hotjar.com 127.0.0.1,MAP taboola.com 127.0.0.1,MAP adentifi.com 127.0.0.1,MAP nightowl-metrics.test 127.0.0.1,MAP chartbeat.net 127.0.0.1,MAP quantcount.com 127.0.0.1,MAP scorecardresearch.com 127.0.0.1"
```

`index.html`, `clean.html`, `column.html`, `article.html`, `dark.html`, `links.html`, `dark-patterns.html` and `forms.html` work in any Chrome. The tracker and vampire pages need the flag, because otherwise the tracker hosts do not resolve and nothing is seen.

## Permissions

From `src/manifest.ts`:

- `activeTab`: lets the popup act on the tab you clicked in, and only that tab.
- `scripting`: injects the costume script into that tab when you click Haunt.
- `declarativeNetRequest`: Exorcise, which blocks a tracker company's domains for one tab.
- `storage`: keeps per-tab state for the session and the Sound effects setting (off by default).
- Optional `http://*/*` and `https://*/*`: asked for only if you switch on "Check links to other sites" in the popup. That opens a small extension page, `permissions.html`, in a new tab, and you allow it there, because Chrome's permission prompt would close the popup. Without it, only links on the same site are checked. You can turn it off again in the popup, which removes the permission.

There are no host permissions at install.

Privacy: link checks are sent with no cookies (`credentials: "omit"`). Nothing leaves the browser beyond those link checks. The tracker data is bundled in the extension and matched locally.

## Tracker Radar data and licence

The code is MIT (see [LICENSE](LICENSE)). The bundled `src/data/trackers.json` is derived from the DuckDuckGo Tracker Radar and is licensed CC BY-NC-SA 4.0, not MIT. If you reuse that data you have to keep the attribution, stay non-commercial and share it alike. See [src/data/ATTRIBUTION.md](src/data/ATTRIBUTION.md) and [src/data/LICENSE-tracker-radar.txt](src/data/LICENSE-tracker-radar.txt). The licence does not cover DuckDuckGo logos or marks.

## Notes

- The costume uses Comic Sans. On Linux it is usually not installed, so the browser falls back to another font.

## Checks

The browser tests use Playwright's own Chromium. Download it once after `bun install` (on a bare Linux machine add `--with-deps` for its system libraries):

```
bunx playwright install chromium
bun run typecheck
bun run test
bun run test:e2e
bun run lint:manifest
bun run test:visual
bun run docker:test
```

`test:e2e` launches headless Chromium with a build of the extension that also has host permissions for localhost (`dist-e2e/`), because Playwright cannot click the toolbar icon. `dist/`, the build you ship, has none. `docker:test` builds the Dockerfile, which runs the typecheck, the unit tests, the manifest lint, the e2e run and the visual check in a clean Playwright image.

The screenshots above are taken from the real extension on the fixtures by `bun run screenshots`, which is kept out of `test:e2e`. The haunt moment GIF is made from a burst of frames by `ffmpeg` (6 fps, 560px wide, 128 colours), so that run needs `ffmpeg` on the path.

### lint:manifest

`bun run lint:manifest` builds `dist/` and checks the shipping manifest, both the object `src/manifest.ts` returns and the `dist/manifest.json` the build wrote. It checks that the manifest is MV3, loads no remote code, has exactly the four permissions listed above, has no `host_permissions` or `optional_permissions`, offers only `http://*/*` and `https://*/*` as optional hosts and has no `'unsafe-eval'` in its CSP. It also checks that every file the manifest names is in `dist/`, and that every script and stylesheet the built HTML pages load is there too. It prints `lint:manifest: ok`, or one line per problem with its rule name and exits with code 1. The e2e build is not linted, because it has host permissions on purpose.

### test:visual

`bun run test:visual` builds the e2e extension and takes screenshots of the haunted costume on `index.html`, `trackers.html`, `links.html`, `dark-patterns.html` and `column.html`, and of the popup before and after haunting and the `permissions.html` dialog, each at 1280 and 375 pixels wide. Motion is reduced, animations are stopped and the page clock is fixed, so a shot comes out the same on every run. Each shot is compared with its baseline in `e2e-visual/__screenshots__/`. If one differs, the run fails and the expected, actual and diff images are written to `test-results/`. A missing baseline also fails the run.

When you change how the costume or the popup looks on purpose, update the baselines in the same commit and look at the new PNGs before committing them. The baselines are made in the Playwright Docker image the Dockerfile uses, because fonts differ between machines (Comic Sans is usually missing on Linux and the fallback varies), and the shots are compared at a tight tolerance:

```
bun run visual:baselines
```

That runs `bun run test:visual:update` inside the image and copies the PNGs out. The authoritative check is `bun run docker:test`, which runs `test:visual` in the same image against the committed baselines; `bun run test:visual` on your own machine can fail on font differences alone. Running `bun run test:visual:update` directly writes baselines from your own machine's fonts, which is only useful for trying things out.

## Kiro hooks

Four Kiro IDE hooks live in `.kiro/hooks/`. Kiro IDE runs a hook when you save a file that matches it. They are a quick local check while you work, not a replacement for the checks above.

| Hook | Runs when you save | What it does |
| --- | --- | --- |
| `manifest-lint` | `src/manifest.ts` or `vite.config.ts` | Runs `bun run lint:manifest`. |
| `visual-regression` | a file in `src/content/costume/` or `src/popup/`, or `design/DESIGN.md` | Runs `bun run test:visual`. |
| `era-accuracy` | a file in `src/content/costume/` | Asks the agent to review the edit against `.kiro/steering/era-accuracy.md`: web-safe colours only, Comic Sans MS and Times New Roman only, original pixel art, nothing a 1998 GeoCities page would not have had, and no trademarks. It reports each problem with its file and line, and does not change any file. |
| `rule-factory` | `src/content/dark-patterns.ts` or `src/data/neighborhoods.json` | Asks the agent to check that the new dark-pattern rule or neighborhood has a test (a match and a near miss under `test/dark-patterns/`, or a data and a resolver test under `test/neighborhoods/`), a fixture line or an example in a test, and era-accurate copy, then to run `bun run test`. It reports what is missing with its file and line, and does not change any file. |

A costume edit sets off both `visual-regression` and `era-accuracy`. The screenshot run takes a little while because it builds the extension and starts Chromium.

To turn a hook off, set `"enabled": false` in its file, or switch it off in the Kiro hooks panel. `test/hooks.test.ts` checks every hook file: the fields Kiro needs, that each command is a `bun run` script that exists in `package.json`, and that each pattern points at a path that exists.

## How Kiro was used

The `.kiro/` folder holds what kiro-cli generated for this project: steering files in `.kiro/steering/` (product, structure, tech, era accuracy, accessibility and motion, non-destructive DOM) and specs in `.kiro/specs/` for the scaffold, tracker detector, costume renderer, tombstones, runtime vampires, dark-pattern curses (`dark-patterns`), neighborhoods and sound effects (`sound-effects`). Each spec has requirements, a design and a task list.

The first three hooks in `.kiro/hooks/` were also written by kiro-cli, together with their spec in `.kiro/specs/kiro-hooks/` (`kiro-hooks`), which covers the hook files, `lint:manifest`, `test:visual` and the test that checks the hooks.

The fourth hook comes with its own spec, `.kiro/specs/rule-factory/` (`rule-factory`), also written by kiro-cli. It is a recipe for growing the two lists the extension reads: give the agent one line, such as `scarcity: "Only a few left"` or "a neighborhood for fishing and boat sites", and point it at the spec's `design.md`. It writes the tests first and sees them fail, then adds the regex to `src/content/dark-patterns.ts` or the entry and rules to `src/data/neighborhoods.json`, updates the tests that pin the neighborhood count and the kind list, proposes era-accurate copy, and ends with `bun run typecheck` and `bun run test` passing. The `rule-factory` hook then checks the result each time either file is saved, and `test/hooks.test.ts` holds the hook to its two files and a prompt that never edits.