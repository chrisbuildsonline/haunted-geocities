# Requirements: Rule Factory

## Overview

The rule factory is a repeatable workflow. It takes a one-line description of either a new **dark-pattern rule** or a new **GeoCities neighborhood** and turns it into code and tests, test first, in the same order every time. It adds data and regexes to two files that already exist. It adds no runtime feature.

| Track | One-line input, for example | Code it changes | Tests it adds |
| --- | --- | --- | --- |
| Dark-pattern rule | `scarcity: "Only a few left"` | `src/content/dark-patterns.ts`: the `SCARCITY` or `COUNTDOWN` list, the `SHAME` parts of `CONFIRM`, or `OPT_IN_WORDS`. A brand new kind also changes `DARK_PATTERN_KINDS` in `src/data/types.ts` (which defines `DarkPatternKind`), `PRECEDENCE` and `KIND_INFO`. | `test/dark-patterns/detect.test.ts`: a positive phrase and a near-miss negative phrase. |
| Neighborhood | `a neighborhood for fishing and boat sites` | `src/data/neighborhoods.json`: an entry (`name`, `tagline`, four `suburbs`) and any `tld` or `word` rules. | `test/neighborhoods/data.test.ts` and `test/neighborhoods/resolver.test.ts`. |

Scope:

- The workflow: classify the line, write failing tests, change the code or data, make the tests pass, check the copy against `era-accuracy.md`, and report.
- Two existing files per track, the tests that pin them, and `fixtures/dark-patterns.html` when an example is needed.
- One Kiro hook, `.kiro/hooks/rule-factory.kiro.hook` (`askAgent`, `fileEdited` on `src/content/dark-patterns.ts` and `src/data/neighborhoods.json`). It checks that a new entry has a test, a fixture or an example, and era-accurate copy, then runs `bun run test`.
- One change to `test/hooks.test.ts`: `rule-factory` joins the table of named hooks with those two patterns, and a test checks that its prompt names the checks.

Out of scope:

- Any change to how the extension looks or behaves: costume, popup, badge, card, sound, manifest, permissions.
- New detection methods. A new kind is supported only when it is found the way `scarcity` and `countdown` are, by a regex over a block's shown text. Kinds that need the clock watcher (`timers.ts`), control scanning (`confirmshaming`) or attributes (`prechecked`) are not new kinds for this workflow.
- Editing or removing an existing regex, neighborhood or rule, unless the description says to. Then the run asks first.
- A script, CLI or new `package.json` entry that runs the workflow. The run is a request to the agent that follows `design.md`.
- Running `bun run test:e2e` or `bun run visual:baselines`. When a run touches something those pin, the report lists them as follow-ups.
- README and `design/DESIGN.md` wording. The run reports lines that are now stale and does not edit them. Task 5 updates the README hook table and the count in `docs/devpost.md` once, for the hook itself.

This spec is written first. The hook file and the code it names are created by the tasks, not by writing the spec.

Steering references: `era-accuracy.md` (copy rules), `structure.md` (`src/data/`, `src/content/`, `test/`, `fixtures/`), `tech.md` (Bun unit tests, `bun run test`), `product.md` (the capabilities these rules feed: cursed dark patterns and the GeoCities neighborhood), `non-destructive-dom.md` (the detector stays read-only; the factory only edits patterns and data). Existing specs: `dark-patterns`, `neighborhoods`, `kiro-hooks`.

## Terms

- **Description**: the one-line input.
- **Track**: `dark-pattern` or `neighborhood`.
- **List**: one of `SCARCITY`, `COUNTDOWN` (arrays of regexes), `SHAME` (the alternation inside `CONFIRM`) or `OPT_IN_WORDS` (one regex), all in `src/content/dark-patterns.ts`.
- **Kind**: a member of `DARK_PATTERN_KINDS`: `scarcity`, `countdown`, `timer`, `confirmshaming`, `prechecked`.
- **Near-miss**: a phrase or host that shares words with the new rule and must not match it.
- **Pin**: a test line that fixes a value the run changes, such as "the five kinds", "16 names" or a known-host address table.
- **Copy**: text a visitor reads: a tagline, a suburb, a `KIND_INFO` `name`, `title` or `trick`.
- **Entry**: a regex added to a list, a `KIND_INFO` row, a neighborhood, or a rule.

## EARS Acceptance Criteria

### Intake and order

1. When the run is given a description, it shall classify it as the `dark-pattern` track or the `neighborhood` track. If the description fits both, or neither, the run shall ask the user and shall not edit any file.
2. In the dark-pattern track, the run shall decide whether the description belongs to an existing list or is a new kind. If it cannot decide, it shall ask.
3. When the description leaves out copy it needs (a tagline, suburbs, a `KIND_INFO` name or trick), the run shall write it under criteria 28 to 31 and list it in the report as proposed copy.
4. The run shall write its tests before it changes anything in `src/`. It shall run `bun run test` and see each new positive test fail with an assertion failure, not an import error or a syntax error, before it changes `src/`.
5. After the change in `src/`, every new test shall pass.
6. Every run shall end with `bun run typecheck` and `bun run test` both exiting 0. The test command shall be `bun run test`, never `bun test test/`. If either fails, the run shall not report the work as done.
7. The run shall not delete, skip or loosen an existing test, or a new near-miss test, to make a run pass.

### Dark-pattern rule in an existing list

8. The run shall put the regex in the list that matches the kind:
   - `scarcity`: a new member of `SCARCITY`.
   - `countdown`: a new member of `COUNTDOWN`.
   - `confirmshaming`: a new alternative in the `SHAME` array that is joined into the `CONFIRM` regex. The `LEAD`, `THANKS`, `SEP` and `I` parts and the 80-character limit stay as they are.
   - `prechecked`: a new word in the `OPT_IN_WORDS` alternation.
   `timer` has no list of phrases (the clock shape is `CLOCK`) and is not a target of this track.
9. The change shall only add. It shall not edit or reorder an existing regex in the list.
10. A new regex shall follow the file's style: the `i` flag, `\b` word boundaries, `\s+` between words and a bounded number length such as `\d{1,4}`. It shall contain no quantified group inside a quantified group.
11. The tests shall be in `test/dark-patterns/detect.test.ts`, next to the existing tests for the same kind, using that file's helpers (`detect`, `kinds`, `snippets`). They shall include at least one positive test and at least one near-miss test.
12. The positive test shall put the phrase in a page body and expect `kinds(detect(html))` to equal `[<kind>]` and the snippet to equal the expected text. The near-miss test shall expect `detect(html)` to equal `[]` for a phrase that shares a distinguishing word with the new regex. The near-miss shall be `[]` over all lists, not only the one changed.
13. The whole existing suite shall still pass. In particular `test/dark-patterns/fixture.test.ts` shall still report exactly the six curses it pins, so a new regex that matches innocent text in the fixture is rejected.

### Fixture line

14. The run shall add a line to `fixtures/dark-patterns.html` only when the change is a brand new kind, or when the description asks for an end-to-end example. A new regex in an existing list is covered by the unit tests alone.
15. A new fixture line shall follow the fixture's rules: an `id`, the `gap` class, no `src`, no `http://` or `https://` URL, no stylesheet link, no `@import` and no `url(`. The run shall update every pin the line changes: `test/dark-patterns/fixture.test.ts` (ids, snippets, the count of six) and `TITLES` and `KINDS` in `e2e/dark-patterns.spec.ts`. It shall list `bun run test:e2e` and `bun run visual:baselines` as follow-ups, because the page is photographed.

### New kind

16. A new kind shall add all of: its name in `DARK_PATTERN_KINDS` in `src/data/types.ts` (which makes it part of `DarkPatternKind`), a number in `PRECEDENCE`, a row in `KIND_INFO`, a regex list constant, and an entry for it in the list-and-kind pairs in `detectDarkPatterns`.
17. The run shall refuse a kind that cannot be found by a regex over a block's shown text, and shall say so.
18. The `PRECEDENCE` numbers shall stay distinct whole numbers starting at 0, covering every kind. The run shall state in the report where the kind sits and why.
19. The `KIND_INFO` row shall have `name`, `title` equal to `Cursed: ` followed by the name, and a `trick` of one or two short sentences that ends with a full stop, has no line break and has no leading or trailing space.
20. The run shall update every test that pins the kind list. These are found with `grep -rn "DARK_PATTERN_KINDS\|five kinds\|KIND_INFO" test e2e`. Today they include `test/dark-patterns/router.test.ts` (the list of five kinds) and `test/dark-patterns/card.test.ts` (the titles and names, in `DARK_PATTERN_KINDS` order).
21. The run shall check with `grep` that no other file in `src/` names the existing kinds in a switch or a table that the new kind would have to join. `src/background/router.ts` validates with `DARK_PATTERN_KINDS`, and the card, the badges and the popup read `KIND_INFO`, so they need no change.

### Neighborhood

22. A new neighborhood shall have `name` (unique, letters and digits, no spaces), `tagline` (one line of printable ASCII, 48 characters or fewer, no leading or trailing space) and `suburbs` (exactly 4 distinct names of 2 to 12 letters). It shall be appended after the last existing entry, so existing indexes do not change.
23. A new rule shall be `{ kind, match, to }`. `kind` is `tld` or `word`. `match` is a non-empty array of lowercase `a-z0-9` strings. `to` is the name of an entry in the file. A `tld` rule shall go before the first `word` rule, a `word` rule after the last `tld` rule. The first matching rule wins, so the run shall state where it put the rule and what it is placed before or after.
24. Adding a neighborhood changes the fallback `fnv1a(host) mod N`, where N is the number of entries. Hosts that no rule matches can therefore move to another neighborhood. In the same run the run shall update every pin that depends on N: the name list and its test title in `test/neighborhoods/data.test.ts`, the `% 16` test in `test/neighborhoods/resolver.test.ts`, the known-hosts address table in the same file, and `the name is one of the 16` in `test/neighborhoods/properties.test.ts`. New table values shall come from running the resolver, not from guessing, and the report shall list each known host that moved.
25. Adding a rule can change the neighborhood of hosts that already resolve. The run shall check the known-hosts table and the rule tests in `test/neighborhoods/resolver.test.ts`, and shall change an expectation only when the new rule is the reason.
26. The tests shall be written first in `test/neighborhoods/`:
   - a new entry: the data test expects its name in the list, its tagline and suburbs to pass the existing shape tests, and the resolver test expects a host that a new rule sends to it;
   - a new rule: one host that matches and resolves to `to`, and one near-miss host that does not. The near-miss follows the resolver's own limits: the last label is not a word, a keyword of 3 letters or fewer matches whole tokens only, and an earlier rule still wins.
27. The run shall not rename, reorder, reword or remove an existing neighborhood or rule.

### Copy

28. All copy shall be era-accurate per `.kiro/steering/era-accuracy.md`: plain words a 1998 GeoCities page would have had, in period voice, with no third-party trademark, no logo, no brand or product name, and nothing that did not exist in 1998.
29. A tagline and a suburb shall also pass the existing data tests: printable ASCII, the length limits in criterion 22, and no name from the trademark list in `test/neighborhoods/data.test.ts`. A suburb shall be a place name or a plain noun, not a brand.
30. `KIND_INFO` `name`, `title` and `trick` shall use plain words. The trick shall say what the visitor sees and why it is a trick, in one or two short sentences, as the five existing rows do.
31. Phrases inside tests are inputs, not copy. They may be any text a page could show.

### Report and boundaries

32. When the run ends, it shall report: the track, the files changed, the new tests by name, the failing output seen before the source change, the result of `bun run typecheck` and `bun run test`, the proposed copy, any pin it updated, and any follow-up it did not run.
33. The run shall edit only: `src/content/dark-patterns.ts`, `src/data/types.ts` (new kind only), `src/data/neighborhoods.json`, test files under `test/dark-patterns/` and `test/neighborhoods/`, and, under criteria 14 and 15, `fixtures/dark-patterns.html`, `test/dark-patterns/fixture.test.ts` and `e2e/dark-patterns.spec.ts`.
34. The run shall not add a file to `src/`, a dependency, a permission or a script, and shall not edit the README, `design/DESIGN.md`, the manifest, the costume or popup code, or the sound code. It shall list any README or `DESIGN.md` line that names the changed list or count as stale.
35. A change to `src/content/dark-patterns.ts` shall not make the detector write to the page, and shall not import a Chrome API.

### The rule-factory hook

36. The repo shall contain `.kiro/hooks/rule-factory.kiro.hook`. It shall meet requirements 1 to 6 of the `kiro-hooks` spec: JSON, `name` equal to `rule-factory`, `enabled` true, `version` `"1"`, `when.type` `fileEdited`, a non-empty `description`.
37. `when.patterns` shall be exactly `src/content/dark-patterns.ts` and `src/data/neighborhoods.json`. The hook shall not match any other file.
38. `then.type` shall be `askAgent`, and `then.prompt` shall be a non-empty string. The hook shall have no `then.command`.
39. The prompt shall tell the agent to check that the new entry has:
    1. a test: for a dark-pattern regex, a positive and a near-miss test under `test/dark-patterns/`; for a neighborhood or a rule, a data test and a resolver test under `test/neighborhoods/`;
    2. a fixture or an example: a line in `fixtures/dark-patterns.html`, or an example phrase or host in a test;
    3. era-accurate copy: any new tagline, suburb, `KIND_INFO` name, title or trick follows `.kiro/steering/era-accuracy.md`, with plain 1998 words and no trademark.
40. The prompt shall then tell the agent to run `bun run test` and report whether it passed. It shall name the command exactly as `bun run test`.
41. The prompt shall tell the agent to report each missing item with its file and line, and to say so in one line when nothing is missing.
42. The prompt shall tell the agent not to change anything: it shall contain the sentence `do not edit, create or delete any file`. Running `bun run test` is the only command it asks for. It shall not tell the agent to fix, apply or rewrite.

### Hook unit test

43. `test/hooks.test.ts` shall add `rule-factory` to the table of named hooks with `patterns` `["src/content/dark-patterns.ts", "src/data/neighborhoods.json"]` (sorted, as the other rows are) and `then` `{ type: "askAgent" }`.
44. `test/hooks.test.ts` shall add a `rule-factory prompt` test that checks the prompt contains `test/dark-patterns/`, `test/neighborhoods/`, `fixture`, `example`, `era-accuracy.md`, `1998`, `trademark`, `bun run test` and `do not edit, create or delete any file`, does not contain `bun test`, `fix it`, `apply`, `rewrite` or `update the file`, and that the hook has no `then.command`.
45. The shape, command and pattern checks that run over every hook file shall run over `rule-factory` with no change to them. The comment at the top of the file shall say "the named hooks" instead of "the three named hooks".

### Counts in the docs

46. `docs/devpost.md` states how many specs and hooks there are and names each, and `test/devpost.test.ts` compares them with `.kiro/specs/` and `.kiro/hooks/`. Once the spec directory exists, the spec count shall read 10 and name `rule-factory`. Once the hook file exists, the hook count shall read 4 and name `rule-factory`.
47. The README hooks table shall have a `rule-factory` row (runs when, what it does), and the README line that says "Three Kiro IDE hooks" shall say four.
