# Design: Rule Factory

## Context

Two files hold nearly all of the project's detection vocabulary and its neighborhood copy: `src/content/dark-patterns.ts` (regex lists) and `src/data/neighborhoods.json` (entries and rules). Adding to either is small, but the tests that pin them are spread over several files, and a change to the neighborhood count moves every hash-fallback address. The rule factory fixes the order of work so each addition arrives with failing tests first, the right pins updated and era-accurate copy.

The factory is a procedure for the agent, plus one hook that checks the result. It is not code that ships in the extension.

Steering references: `era-accuracy.md` (copy), `structure.md` (where data, content code, tests and fixtures live), `tech.md` (`bun run test`, Bun unit tests), `product.md`, `non-destructive-dom.md`. Requirement numbers below refer to `requirements.md`.

## Files

```
.kiro/specs/rule-factory/
  requirements.md
  design.md
  tasks.md
.kiro/hooks/rule-factory.kiro.hook     # new (task 3)

# touched by a run, depending on the track
src/content/dark-patterns.ts           # SCARCITY, COUNTDOWN, SHAME (in CONFIRM), OPT_IN_WORDS, PRECEDENCE, KIND_INFO
src/data/types.ts                      # DARK_PATTERN_KINDS (new kind only)
src/data/neighborhoods.json            # neighborhoods[], rules[]
test/dark-patterns/detect.test.ts      # positive + near-miss tests
test/dark-patterns/router.test.ts      # pin: the list of kinds (new kind only)
test/dark-patterns/card.test.ts        # pin: KIND_INFO titles and names (new kind only)
test/dark-patterns/fixture.test.ts     # pin: the six curses (only if the fixture changes)
fixtures/dark-patterns.html            # example line (new kind, or on request)
e2e/dark-patterns.spec.ts              # pin: TITLES, KINDS (only if the fixture changes)
test/neighborhoods/data.test.ts        # NAMES, shape tests
test/neighborhoods/resolver.test.ts    # rule tests, `% 16`, known-hosts table
test/neighborhoods/properties.test.ts  # "the name is one of the 16"

# touched once, by the tasks
test/hooks.test.ts                     # named-hook table row + prompt test
docs/devpost.md                        # spec and hook counts
README.md                              # hook table row
```

No new file in `src/`.

## The workflow

Both tracks share the same seven steps. Step numbers are used in the report.

```
description
   │
   ▼
1 classify ──ask──▶ (user)           req 1, 2
   │
   ▼
2 plan: target list or kind, or entry and rules, plus any copy to propose     req 3
   │
   ▼
3 write tests ───────────────────────────────────────────────────────▶ test files
   │
   ▼
4 bun run test  → new positive tests fail by assertion                       req 4
   │
   ▼
5 change src (regex / kind rows / JSON), update pins                         req 5, 7 to 27
   │
   ▼
6 bun run typecheck, bun run test → both 0                                   req 6
   │
   ▼
7 report                                                                      req 32
```

A run starts when the user gives the agent a description and points at this design. For example: "Follow `.kiro/specs/rule-factory/design.md`. Dark-pattern rule: `scarcity: "Only a few left"`."

If step 4 shows an import error or a syntax error instead of an assertion failure, the test is wrong, not the source. Fix the test and run step 4 again.

## Dark-pattern track

### Where each description goes

| Description kind | Target in `src/content/dark-patterns.ts` | What the test feeds `detect` | Expected |
| --- | --- | --- | --- |
| `scarcity` | `SCARCITY`: push a new regex. | `<p>…phrase…</p>` | `["scarcity"]` |
| `countdown` | `COUNTDOWN`: push a new regex. | `<p>…phrase…</p>` | `["countdown"]` |
| `confirmshaming` | `SHAME`: add a string to the array that is joined with `\|` into `CONFIRM`. | `<button>No thanks, …</button>` | `["confirmshaming"]` |
| `prechecked` | `OPT_IN_WORDS`: add a word to the alternation `(?:newsletters?\|offers?\|…)`. | `<label><input type="checkbox" checked> …</label>` | `["prechecked"]` |
| new kind | See "New kind" below. | `<p>…phrase…</p>` | `["<new kind>"]` |

Where the phrase goes and which element is reported follow the existing detector. A phrase in a block is found when inline tags split it, and the reported element is the smallest one holding the whole match, so a test can assert that too when the phrase is split (`Only <b>2</b> left`).

`SHAME` strings are fragments, not full regexes, and are written with `String.raw` like their neighbours. Anchoring is done by `CONFIRM`: the control text must start with a decline (`no`, `not now`, `skip`…), then a first-person clause, then a `SHAME` fragment. A new fragment is tested as `No thanks, I <fragment>`.

### Writing the regex

- Copy the shape of the nearest neighbour in the list. `SCARCITY[0]` is `\b(?:only|just)\s+\d{1,4}\s+(?:…)?(?:left|remaining|available|in\s+stock)\b` with the `i` flag.
- Bound every number (`\d{1,4}`), use `\b` at both ends and `\s+` between words.
- Do not nest a quantified group in a quantified group (backtracking risk on a page of any size). The detector runs a regex over every block's text.
- Prefer the narrowest phrase that the description names. A looser pattern risks the innocent text already in `fixtures/dark-patterns.html` (`Only the best coffee`, `Just 2 minutes from the station`, `Left-handed mugs`, `Open daily 09:00 to 17:30`), which `fixture.test.ts` guards.

### Tests

Written into `test/dark-patterns/detect.test.ts`, next to the existing tests for the kind, with its helpers:

```ts
test("scarcity: only a few left", () => {
  const [p] = detect(`<p id="a">Hurry, only a few left!</p>`);
  expect(p!.kind).toBe("scarcity");
  expect(p!.snippet).toBe("Hurry, only a few left!");
});
test("scarcity: only a few minutes from the station does not match", () => {
  expect(detect(`<p>Only a few minutes from the station.</p>`)).toEqual([]);
});
```

The positive test must fail first. The near-miss shares the leading words of the new regex and differs in the word that matters (`left` against `minutes`). It expects `[]` from every list, which also proves the new regex did not widen another one.

This is an illustration of the shape. This spec does not add that rule.

### Fixture line (only when needed)

`fixtures/dark-patterns.html` is a pinned page: `fixture.test.ts` expects exactly six curses with named ids and snippets, `e2e/dark-patterns.spec.ts` expects six badges and their titles, `e2e/layout-375.spec.ts` checks every badge at 375px, and `test:visual` photographs the page. A new line therefore touches four to five places and needs `bun run test:e2e` and `bun run visual:baselines`. That is why the default is no fixture line: the unit tests carry an inline phrase. A line is added when a brand new kind needs an end-to-end example, or when the user asks.

### New kind

Edits, in this order (the order keeps `bun run typecheck` honest, because `Record<DarkPatternKind, …>` makes the compiler list every row still missing):

1. `src/data/types.ts`: append the name to `DARK_PATTERN_KINDS`. `DarkPatternKind` follows from it.
2. `src/content/dark-patterns.ts`: a `PRECEDENCE` number. The numbers are 0 to 4 today (`prechecked` 0, `confirmshaming` 1, `scarcity` 2, `countdown` 3, `timer` 4). The new kind takes the slot where it should win a tie and the ones below it move down by one, so the values stay distinct and gap-free. State the reason in the report.
3. A `KIND_INFO` row: `{ name, title: "Cursed: <name>", trick }`.
4. A regex list constant, like `SCARCITY`, and a pair for it in the `[["scarcity", SCARCITY], ["countdown", COUNTDOWN]] as const` array inside `detectDarkPatterns`.
5. The pins: `router.test.ts` (`DARK_PATTERN_KINDS lists the five kinds`) and `card.test.ts` (`KIND_INFO titles match DESIGN.md plus Ticking timer`, which lists titles and names in `DARK_PATTERN_KINDS` order). `grep -rn "DARK_PATTERN_KINDS\|five kinds\|KIND_INFO" test e2e` finds the rest.

Consumers that need no change, found by reading the source: `src/background/router.ts` validates curses against `DARK_PATTERN_KINDS`; `src/content/costume/card.ts`, `src/content/costume/curses.ts` and `src/popup/screens.ts` read `KIND_INFO[kind]`. The run still greps for the existing kind names to be sure that no other switch or table exists.

A kind that needs a different detector (a ticking clock, a control, an attribute) is refused, as the three existing non-text kinds show. That is a separate piece of work with its own spec.

## Neighborhood track

### Data

`src/data/neighborhoods.json` has `neighborhoods[]` (`name`, `tagline`, `suburbs`) and `rules[]` (`kind`, `match`, `to`). `src/data/neighborhood.ts` reads both and resolves a host in this order: fixed addresses (`localhost`, IP literals), the first matching rule (`tld` rules on the last two labels, `word` rules on tokens of the labels before the last), then the fallback `ENTRIES[fnv1a(host) % ENTRIES.length]`. The suburb comes from `fnv1a("suburb:" + host) % 4` and the number from `1000 + ((fnv1a(host) >>> 8) % 9000)`.

### Where each description goes

| Description | JSON change |
| --- | --- |
| New neighborhood | Append `{ name, tagline, suburbs }` to `neighborhoods`. |
| New `tld` rule | Insert `{ "kind": "tld", match, to }` before the first `word` rule. |
| New `word` rule | Insert `{ "kind": "word", match, to }` after the last `tld` rule. |

Rule order is precedence. `petshop.example` goes to `WallStreet` because the `shop` rule comes before any rule that would catch `pet`, and a 3-letter keyword never matches inside a token. A new `word` rule is placed deliberately and the report says what it sits before.

### What a new neighborhood moves

`ENTRIES.length` is in the fallback, so adding one entry changes where every unmatched host lands. Hosts with a rule, and `localhost` and IP literals, keep their neighborhood, but their suburb and number do not change either, because those hash the host, not the count. Only the neighborhood of a fallback host moves, and with it that host's tagline and its suburb (the suburb list changes with the neighborhood).

Pins that depend on N, all in `test/neighborhoods/`:

| File | Pin | Change |
| --- | --- | --- |
| `data.test.ts` | `NAMES` and the title `lists the 16 names in order` | add the name, change the number in the title |
| `resolver.test.ts` | `a host with no rule gets the neighborhood at fnv1a mod 16` (`NAMES[ref(h) % 16]`) | use `NAMES.length` or the new number |
| `resolver.test.ts` | `known hosts keep their address` table | recompute from the resolver for every row that moved, and list those hosts in the report |
| `properties.test.ts` | `the name is one of the 16` | change the number in the title |

`.kiro/specs/neighborhoods/requirements.md` says "exactly 16". It describes the build it shipped with and is not edited. The report notes that the number moved.

Table values are taken by running the resolver (`bun -e` over the host list, or a temporary `console.log` in the test that is removed). They are never typed from memory.

### Tests, written first

`data.test.ts` expects the new name in `NAMES`; the existing shape tests (tagline, suburbs, rule targets, order of `tld` and `word`) then cover the rest of the entry. `resolver.test.ts` gets one host that a rule sends to the new neighborhood and one near-miss host:

```ts
test("fishing.example.com is Bayou", () => {
  expect(name("fishing.example.com")).toBe("Bayou");
});
test("example.fish is not a word match (the last label is not a word)", () => {
  expect(name("example.fish")).not.toBe("Bayou");
});
```

The second line can only say "not Bayou", because a host with no rule falls back to the hash. The test asserts the hash result instead when the run needs to pin it: `NAMES[ref("example.fish") % NAMES.length]`.

Illustration only, not part of this spec: a neighborhood `Bayou` with tagline `Fishing, boats and slow rivers.`, suburbs `Delta`, `Marsh`, `Cypress`, `Dock`, and a `word` rule `["fish", "boat", "angler"]`. It would take N from 16 to 17.

## Copy

The copy rules come from `.kiro/steering/era-accuracy.md` ("Avoid any visual element that did not exist on a typical GeoCities page circa 1998" and "no third-party trademarks") applied to words:

- Plain, period words: `webmasters`, `guestbook`, `homepage`, `surf the highway` are the voice of the existing taglines. A tagline names the kind of site that lives there and ends with a full stop or an exclamation mark.
- No brand, product, company or service names. The data test already rejects a list of marks (`google|facebook|yahoo|microsoft|apple|amazon|netscape|geocities|nintendo|sega|sony|disney`). The check by eye covers the rest.
- Nothing that postdates 1998 or sounds like it, for example `influencer`, `selfie`, `podcast`, `streaming`, `emoji`, `viral`, `app`. The list is a prompt for the reviewer, not an exhaustive test.
- Suburbs are places or plain nouns (`Cupertino`, `Dragstrip`, `Aviary`), one word, letters only, 2 to 12 characters.
- `KIND_INFO.trick` is plain words that say what the visitor sees and why it is a trick, in one or two short sentences: `A low-stock warning makes you hurry. Many are never true.` The check in `card.test.ts` is only "trimmed, ends with a full stop, no line break", so length and tone are kept by following the five existing rows.

The factory proposes copy when the description gives none, and always shows it in the report so that the user can change it.

## The rule-factory hook

`.kiro/hooks/rule-factory.kiro.hook`, in the shape of the three existing hooks:

```json
{
  "enabled": true,
  "name": "rule-factory",
  "description": "When a dark-pattern list or the neighborhood data is edited, ask the agent to check that the new entry has a test, a fixture or an example and era-accurate copy, then run bun run test.",
  "version": "1",
  "when": {
    "type": "fileEdited",
    "patterns": ["src/content/dark-patterns.ts", "src/data/neighborhoods.json"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "<see below>"
  }
}
```

Prompt text:

> src/content/dark-patterns.ts or src/data/neighborhoods.json was just edited. Find the new entry in the edit: a regex in a dark-pattern list, a kind, a neighborhood, or a neighborhood rule. Check three things. (1) Test: a new regex has a positive test and a near-miss test under test/dark-patterns/; a new neighborhood or rule has a data test and a resolver test under test/neighborhoods/. (2) Fixture or example: there is a line in fixtures/dark-patterns.html, or an example phrase or host in a test, that shows the entry working. (3) Copy: any new tagline, suburb, KIND_INFO name, title or trick follows .kiro/steering/era-accuracy.md, with plain words a 1998 GeoCities page would have had and no third-party trademark. Then run bun run test and say whether it passed. For each missing item, give the file, the line and what is missing. If nothing is missing and the tests pass, say so in one line. This is a check only: do not edit, create or delete any file.

Decisions:

- **`askAgent`, not `runCommand`.** Whether an entry has a test, an example and good copy is a reading task. `bun run test` alone passes when someone adds a regex and no test.
- **The agent runs `bun run test`.** A `runCommand` hook cannot also ask for a review, and one hook is what the user asked for. The prompt names the command exactly, and a test forbids `bun test` in the prompt, so the hook never suggests the form the project does not use. The `test` script in `package.json` is `bun test ./test/`, and `bun test test/` is not to be used.
- **Read-only apart from the test run.** It follows the `era-accuracy` hook: the sentence `do not edit, create or delete any file` is required by the test. `bun run test` writes nothing in the repo.
- **Two patterns only.** A test-only edit does not fire it. The factory edits the two source files, so the hook also fires during a factory run, after step 5. That is acceptable: it is a second, independent check on the same change, and the run's own `bun run test` has already passed.
- **Overlap.** An edit to `src/content/dark-patterns.ts` fires only this hook. The `era-accuracy` hook watches `src/content/costume/**`, not this file.

## Hook test change (`test/hooks.test.ts`)

Two edits, both in the existing file:

```ts
// the table in describe("the named hooks")
{ name: "rule-factory", patterns: ["src/content/dark-patterns.ts", "src/data/neighborhoods.json"], then: { type: "askAgent" } },
```

```ts
describe("rule-factory prompt", () => {
  const hook = byName("rule-factory");
  const prompt: string = hook?.then?.prompt ?? "";

  test("names the checks", () => {
    for (const word of ["test/dark-patterns/", "test/neighborhoods/", "fixture", "example", "era-accuracy.md", "1998", "trademark", "bun run test"]) {
      expect({ word, found: prompt.includes(word) }).toEqual({ word, found: true });
    }
  });

  test("is a check only and uses the right test command", () => {
    expect(prompt).toContain("do not edit, create or delete any file");
    for (const bad of ["bun test", "fix it", "apply", "rewrite", "update the file"]) {
      expect({ bad, found: prompt.toLowerCase().includes(bad) }).toEqual({ bad, found: false });
    }
    expect(hook?.then && "command" in hook.then).toBe(false);
  });
});
```

The same table row also runs the shared `toMatchObject` check on `then`, and `describe.each(hooks)` runs the shape, command and pattern checks on the new file without change (kiro-hooks requirements 55 to 63). The top comment changes from "the three named hooks" to "the named hooks".

Order matters: the test is written first and fails (`rule-factory exists with its patterns and action` finds no hook) until the hook file exists. That failure is the proof that the test checks something.

## Counts that follow the hook and the spec

`test/devpost.test.ts` reads `docs/devpost.md` and compares: `N specs` and every spec name in backticks against `.kiro/specs/`, `N Kiro hooks` and every hook name against `.kiro/hooks/`. Creating `.kiro/specs/rule-factory/` makes the spec count 10 and creating the hook makes the hook count 4, so `bun run test` fails on that test until `docs/devpost.md` says so. The README test only requires the three older hooks, so a README row for `rule-factory` is for consistency, and the sentence "Three Kiro IDE hooks live in `.kiro/hooks/`" becomes "Four".

`devpost.test.ts` also checks that "more than 1100 unit tests" is below the real count and within 10% of it. New tests raise the count, so the floor needs a bump once the real count passes about 1220.

## Risks

- **Pins drift.** A neighborhood run changes four tests that hold a count. The requirement lists them, and a grep for `16` in `test/neighborhoods/` is a task check. A missed pin shows as a failing `bun run test`, which blocks the report (req 6).
- **A greedy regex.** Matches innocent text on real pages. The near-miss test and the fixture's innocent lines are the guard, and the narrowest-phrase rule is the habit.
- **Known-host table churn.** Recomputing table rows by hand can hide a real regression. Rows change only when the new neighborhood or rule explains the move, and each moved host is named in the report.
- **Copy review is judgment.** The data test catches printable ASCII, length and a short list of marks. Period voice and anachronisms are checked by the run and the hook, by reading.
- **Fixture ripple.** One fixture line reaches unit, e2e, layout and visual checks. Default is no line.
