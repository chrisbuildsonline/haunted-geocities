# Tasks: Rule Factory

Implementation checklist for the rule-factory spec. Each task lists the requirement numbers it satisfies and the check that proves it. Run `bun run typecheck` and `bun run test` after every group. Never run `bun test test/`.

Tasks 2 to 4 build the hook and its test. Task 5 proves the workflow on throwaway rules. Task 6 is the final check.

## 1. Spec

- [x] 1.1 Write `requirements.md`, `design.md` and `tasks.md` in `.kiro/specs/rule-factory/`.
  - Req: all
  - Check: the three files exist and `design.md` names only functions, lists and test files found in the repo (`grep` each name once).

- [x] 1.2 In `docs/devpost.md`, change the spec count from 9 to 10 and add `rule-factory` to the named list.
  - Req: 46
  - Check: `bun test ./test/devpost.test.ts` → `"the spec count matches .kiro/specs/ and names each spec"` passes. (Creating the spec folder makes it fail until this is done.)

## 2. Hook test, first

- [x] 2.1 In `test/hooks.test.ts`, add the `rule-factory` row to the table in `describe("the named hooks")` and change the top comment to "the named hooks".
  - Req: 43, 45
  - Check: `bun test ./test/hooks.test.ts` fails on `"rule-factory exists with its patterns and action"` because the hook file does not exist yet. A passing run here means the row is not being checked.

- [x] 2.2 Add `describe("rule-factory prompt")` with `"names the checks"` and `"is a check only and uses the right test command"`.
  - Req: 44
  - Check: `bun test ./test/hooks.test.ts` fails on both new tests (the prompt is empty). Then read the test once to see that each word in the list is also in the prompt text in `design.md`, and that none of `bun test`, `fix it`, `apply`, `rewrite`, `update the file` is.

## 3. Hook file

- [x] 3.1 Create `.kiro/hooks/rule-factory.kiro.hook` with the JSON and the prompt from `design.md`: `fileEdited` on `src/content/dark-patterns.ts` and `src/data/neighborhoods.json`, `askAgent`, no `then.command`.
  - Req: 36 to 42
  - Check: `bun test ./test/hooks.test.ts` passes, including the shape, name, `version`, `enabled`, pattern-prefix and command checks that run over every hook file.

- [x] 3.2 Confirm the hook matches only its two files and the prompt asks for no change.
  - Req: 37, 42
  - Check: the `when.patterns` array equals the two paths (the table row in task 2.1 compares sorted arrays), and `grep -c "do not edit, create or delete any file" .kiro/hooks/rule-factory.kiro.hook` prints `1`.

## 4. Counts and README

- [x] 4.1 In `docs/devpost.md`, change `3 Kiro hooks` to `4 Kiro hooks` and add a clause for `rule-factory` (what edit fires it and that it asks the agent to check for a test, a fixture or example and era-accurate copy, then run `bun run test`, without changing any file).
  - Req: 46
  - Check: `bun test ./test/devpost.test.ts` → `"the hook count matches .kiro/hooks/ and names each hook"` passes.

- [x] 4.2 In `README.md`, add a `rule-factory` row to the Kiro hooks table and change "Three Kiro IDE hooks live in" to "Four".
  - Req: 47
  - Check: `bun test ./test/readme.test.ts` passes, and the row names the two files, the checks and `bun run test`.

- [x] 4.3 Check the unit-test floor in `docs/devpost.md` ("more than 1100 unit tests") against the new count.
  - Req: 46
  - Check: `bun test ./test/devpost.test.ts` → `"the unit test floor is honest against the real bun count"` passes. If it fails because the count passed about 1220, raise the floor to a round number below the real count.

## 5. Prove the workflow

Each trial is a real run of the workflow on a throwaway description. Start from a clean tree (commit or stash earlier work). End each trial by restoring only the files it touched with `git restore <files>` and by removing any file it created, then check `git status` shows nothing from the trial. Keep the output for the commit message or the PR.

- [x] 5.1 Existing list: run the workflow on `scarcity: "Only a few left"`.
  - Req: 1, 4 to 13, 28, 32 to 35
  - Check: the new positive test fails by assertion before the source change (output kept); after the change `bun run typecheck` and `bun run test` pass; `git diff --stat` shows `src/content/dark-patterns.ts` and `test/dark-patterns/detect.test.ts` only; the existing `SCARCITY` members are unchanged in the diff; `fixtures/dark-patterns.html` is untouched.

- [x] 5.2 Near-miss bites: weaken the new regex so it also matches `Only a few minutes from the station`.
  - Req: 12, 13
  - Check: the near-miss test fails, and so does nothing else except possibly `fixture.test.ts`. Revert the weakening.

- [ ] 5.3 Other lists: run the workflow once on a `confirmshaming` phrase (`SHAME`) and once on a `prechecked` word (`OPT_IN_WORDS`).
  - Req: 8, 9, 11, 12
  - Check: for each, the diff adds one fragment or word, the positive test fails first, then passes, and the near-miss expects `[]`.

- [ ] 5.4 New kind: run the workflow on a throwaway kind whose phrase is a block of text.
  - Req: 14 to 21
  - Check: before the pins are updated `bun run typecheck` fails on the missing `PRECEDENCE` and `KIND_INFO` rows; after the change both commands pass; `git diff` shows `src/data/types.ts`, `PRECEDENCE`, `KIND_INFO`, the new list, the pair in `detectDarkPatterns`, `test/dark-patterns/router.test.ts` and `test/dark-patterns/card.test.ts`; the report lists `bun run test:e2e` and `bun run visual:baselines` as follow-ups if a fixture line was added.

- [ ] 5.5 New neighborhood and rule: run the workflow on a throwaway neighborhood with one `word` rule and four suburbs.
  - Req: 22 to 27, 28, 29
  - Check: before the change the data and resolver tests fail by assertion; after it, `bun run test` passes; `git diff` shows the pins in `data.test.ts`, `resolver.test.ts` (`% 16` test and the known-hosts table) and `properties.test.ts` changed; the report lists each known host that moved; `grep -n "16" test/neighborhoods/*.ts` shows no stale count.

- [ ] 5.6 Rule only: run the workflow on a throwaway `tld` rule.
  - Req: 23, 25, 26
  - Check: the rule sits before the first `word` rule (the existing test `tld rules come before word rules` passes); one matching host and one near-miss host are tested; the known-hosts table changes only if the rule is the reason.

- [ ] 5.7 Copy: run the workflow with a tagline that contains a trademark, then with a clean one.
  - Req: 28, 29, 30
  - Check: `"taglines name no third-party trademark"` in `test/neighborhoods/data.test.ts` fails on the first and passes on the second. For a `KIND_INFO` row, the `card.test.ts` trick checks pass.

- [ ] 5.8 Refusals: give the agent a description that fits both tracks, and one that needs a clock watcher.
  - Req: 1, 17
  - Check: the agent asks or refuses in chat and `git status` shows no change.

- [ ] 5.9 The hook fires: with the hook enabled in Kiro IDE, edit and save `src/content/dark-patterns.ts` with a regex that has no test, then undo.
  - Req: 36 to 42
  - Check: observed in Kiro IDE: the agent reports the missing test with a file and line, runs `bun run test`, and edits nothing. This check is manual; record what was seen.

- [x] 5.10 Confirm the tree has no trial leftovers.
  - Req: 33, 34
  - Check: `git status --short` shows only the files tasks 1 to 4 changed.

## 6. Final check

- [x] 6.1 Run `bun run typecheck` and `bun run test`. Both pass.
  - Req: 6, 36 to 47
  - Check: command output, exit code 0 for both.

- [x] 6.2 Run `bun run lint:manifest`.
  - Req: 34
  - Check: prints `lint:manifest: ok`. Nothing in this spec touches the manifest, so a failure means something else changed.
