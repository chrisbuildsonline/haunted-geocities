# Demo script

The written plan for the demo video, under three minutes. It is recorded in Chrome with the unpacked extension and the fixture pages (`bun run fixtures`), and the Kiro part in a terminal with kiro-cli. `test/demo-script.test.ts` keeps it in step with the repo.

## 0:00-0:15 The haunt moment

**Shot:** The `news.html` fixture, a calm small-town news front page. Click the toolbar icon and **Haunt page**. The page dies like an old CRT, the Webmaster's Ghost wipes 1998 in, and the parade streams up through the whole page: six big ghosts, each carrying the name of a tracker company this page sends you to, Criteo, Chartbeat, comScore, Quantcast, Hotjar and Taboola. Then the tracker ghosts rise into their lanes with their name tags.

**Voiceover:** This news page, one of our fixtures, looks calm. One click and the companies watching you come out by name: Criteo, Chartbeat, comScore, Quantcast, Hotjar and Taboola.

Fixture note: `news.html` is a fixture, a made-up page in `fixtures/` served from my machine with its tracker domains pointed at the local server, and it is not a real site. The same haunt on real pages over the real network is in `docs/real-site-haunt.gif`: the live nps.gov home page shows `Trackers found: 4` and cdc.gov `Trackers found: 3` (stills and record in `docs/`, made by `bun run docs:realsite`). The video stays on fixtures because the rules keep third-party marks out of it.

## 0:15-0:40 The costume

**Shot:** The settled costume: the page restyled as a 1998 page in its guestbook frame under a night sky. The neighborhood bar at the top shows the page's GeoCities address, and at the page's end a 1998 footer holds the graveyard of trackers, the hit counter and the 88x31 badges; the ghost icon in the corner jumps there. Ghosts drift in the gutters. (On a phone they stand in a graveyard strip above the HUD instead.)

**Voiceover:** Haunted GeoCities dresses the page as a 1998 GeoCities crypt, and every piece of the costume is real. Each ghost is a tracking company from the DuckDuckGo Tracker Radar.

## 0:40-1:05 Exorcise

**Shot:** Click the Criteo ghost: its card names the company and its domains. Press **Exorcise**: the ghost spirals out as an EXORCISED stamp slams on, and the HUD count of ghosts still haunting ticks down from 4 to 3. Reopen the popup to show Criteo blocked for this tab (until you un-haunt or leave the page).

**Voiceover:** Click a ghost to see who it is. Exorcise blocks that company in this tab, and the count of ghosts still haunting goes down.

## 1:05-1:35 Vampires, tombstones and curses

**Shot:** On `vampires.html` a vampire appears when a script reads the canvas. On `links.html` dead links get tombstones; click one for its stone card with the path and the 404 (a real HEAD request to the local server answered it). On `dark-patterns.html` a CURSED! badge sits on "Only 2 left in stock" and its card quotes the page's own words.

**Voiceover:** Scripts caught fingerprinting become vampires. Dead links get tombstones. Fake scarcity, countdowns, confirmshaming and pre-ticked boxes get cursed, in the page's own words.

## 1:35-2:15 Kiro and the rule-factory agent

**Shot:** The `.kiro/` folder: 6 steering files, 12 specs, 5 hooks and 2 custom agents, `costume-reviewer` (a read-only era reviewer with only `fs_read`) and `rule-factory`. In a terminal, run `kiro-cli chat --agent rule-factory "add a scarcity phrase: Last one in the shop"`. The agent writes a positive and a near-miss test under `test/dark-patterns/`, runs `bun run test` and the new test fails, then adds the regex to `src/content/dark-patterns.ts` and runs `bun run typecheck` and `bun run test` to green. Its `fs_write` is limited to `src/content/dark-patterns.ts`, `src/data/neighborhoods.json`, `src/data/types.ts`, `test/dark-patterns/` and `test/neighborhoods/`, its `execute_bash` to `bun run test` and `bun run typecheck`, and it never commits. Saving `src/content/dark-patterns.ts` fires the `rule-factory` hook, which checks the new rule has its tests.

**Voiceover:** Kiro wrote the steering, a spec before every feature, the hooks and 2 custom agents. The rule-factory agent turns one line into a failing test and then the rule that makes it pass, and it can only touch the rule files and their tests. One run of this exact request is recorded, unedited, in docs/rule-factory-run.md, and the "Last one in the shop" curse it added is committed as it wrote it.

## 2:15-2:40 The whole site

**Shot:** On `index.html`, open the popup: one button, Haunt page, with the line "Chrome may ask once to let the haunt follow you around 127.0.0.1." under it. Press it and Chrome asks for access to that one site. Press Allow. Reopen the popup (Chrome's prompt can close it) and it says "Haunting all of 127.0.0.1". Click the page's "Quiet page" link: for a moment the 1998 loading screen shows (ghost, "Loading crypt…", a Win95 progress bar), then the next page is there already haunted, without the 3-second show (`e2e/site-haunt.spec.ts` follows the same link). In a new tab, press Haunt page again and choose Deny this time. That page is haunted, and its "Quiet page" link loads plain.

**Voiceover:** One button. Chrome asks once, and after that every link on the site stays haunted until you leave it, behind a loading screen instead of a flash of the old page. Say no and you still get this page.

## 2:40-2:55 Sound and un-haunt

**Shot:** In the popup, switch sounds on (they are off by default) and open a ghost card to hear its "ooo". Then press **Un-haunt** and the page is back exactly as it was.

**Voiceover:** Sounds are opt-in, and one click puts the page back as it was. Happy Kiroween.
