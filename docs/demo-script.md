# Demo script

The written plan for the demo video, under three minutes. It is recorded in Chrome with the unpacked extension and the fixture pages (`bun run fixtures`), and the Kiro part in a terminal with kiro-cli. `test/demo-script.test.ts` keeps it in step with the repo.

## 0:00-0:15 The haunt moment

**Shot:** The `news.html` fixture, a calm small-town news front page. Click the toolbar icon and **Haunt this page**. The page dies like an old CRT, the Webmaster's Ghost wipes 1998 in, and the parade streams up through the whole page: six big ghosts, each carrying the name of a tracker company this page sends you to, Criteo, Chartbeat, comScore, Quantcast, Hotjar and Taboola. Then the tracker ghosts rise into their lanes with their name tags.

**Voiceover:** This news page looks calm. One click and the companies watching you come out by name: Criteo, Chartbeat, comScore, Quantcast, Hotjar and Taboola.

## 0:15-0:40 The costume

**Shot:** The settled costume: the page restyled as a 1998 page in its guestbook frame, the night sky, the neighborhood bar at the top with the page's GeoCities address, and the HUD with its hit counter and marquee along the bottom. Ghosts drift in the gutters.

**Voiceover:** Haunted GeoCities dresses the page as a 1998 GeoCities crypt, and every piece of the costume is real. Each ghost is a tracking company from the DuckDuckGo Tracker Radar.

## 0:40-1:05 Exorcise

**Shot:** Click the Criteo ghost: its card names the company and its domains. Press **Exorcise**: the ghost spirals out as an EXORCISED stamp slams on, and the HUD count of ghosts still haunting ticks down from 4 to 3. Reopen the popup to show Criteo blocked for this tab.

**Voiceover:** Click a ghost to see who it is. Exorcise blocks that company in this tab, and the count of ghosts still haunting goes down.

## 1:05-1:35 Vampires, tombstones and curses

**Shot:** On `vampires.html` a vampire appears when a script reads the canvas. On `links.html` dead links get tombstones; click one for its stone card with the path and the 404. On `dark-patterns.html` a CURSED! badge sits on "Only 2 left in stock" and its card quotes the page's own words.

**Voiceover:** Scripts caught fingerprinting become vampires. Dead links get tombstones. Fake scarcity, countdowns, confirmshaming and pre-ticked boxes get cursed, in the page's own words.

## 1:35-2:30 Kiro and the rule-factory agent

**Shot:** The `.kiro/` folder: 6 steering files, 10 specs, 5 hooks and 2 custom agents, `costume-reviewer` (a read-only era reviewer with only `fs_read`) and `rule-factory`. In a terminal, run `kiro-cli chat --agent rule-factory "add a scarcity phrase: Last one in the shop"`. The agent writes a positive and a near-miss test under `test/dark-patterns/`, runs `bun run test` and the new test fails, then adds the regex to `src/content/dark-patterns.ts` and runs `bun run typecheck` and `bun run test` to green. Its `fs_write` is limited to `src/content/dark-patterns.ts`, `src/data/neighborhoods.json`, `src/data/types.ts`, `test/dark-patterns/` and `test/neighborhoods/`, its `execute_bash` to `bun run test` and `bun run typecheck`, and it never commits. Saving `src/content/dark-patterns.ts` fires the `rule-factory` hook, which checks the new rule has its tests.

**Voiceover:** Kiro wrote the steering, a spec before every feature, the hooks and 2 custom agents. The rule-factory agent turns one line into a failing test, then the rule, then a green suite, and it can only touch the rule files and their tests. One run of this exact request is recorded, unedited, in docs/rule-factory-run.md, and the "Last one in the shop" curse it added is committed as it wrote it.

## 2:30-2:50 Sound and un-haunt

**Shot:** In the popup, switch sounds on (they are off by default) and open a ghost card to hear its "ooo". Then press **Un-haunt** and the page is back exactly as it was.

**Voiceover:** Sounds are opt-in, and one click puts the page back as it was. Happy Kiroween.
