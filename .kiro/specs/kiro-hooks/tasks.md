# Tasks: Kiro Hooks

Implementation checklist for the kiro-hooks spec. Each task lists the requirement numbers it satisfies and the check that proves it. Tasks 1 and 2 are done with this spec. The rest change files outside `.kiro/` and are still to do.

## 1. Hook files

- [x] 1.1 Create `.kiro/hooks/manifest-lint.kiro.hook` (`fileEdited` on `src/manifest.ts`, `vite.config.ts`; `runCommand` `bun run lint:manifest`).
  - Req: 1 to 8
  - Check: `test/hooks.test.ts` (task 5).

- [x] 1.2 Create `.kiro/hooks/visual-regression.kiro.hook` (`fileEdited` on `src/content/costume/**`, `src/popup/**`, `design/DESIGN.md`; `runCommand` `bun run test:visual`).
  - Req: 1 to 6, 9, 10
  - Check: `test/hooks.test.ts`.

- [x] 1.3 Create `.kiro/hooks/era-accuracy.kiro.hook` (`fileEdited` on `src/content/costume/**`; `askAgent` with a read-only review prompt).
  - Req: 1 to 6, 11 to 16
  - Check: `test/hooks.test.ts`.

## 2. Spec

- [x] 2.1 Write `requirements.md`, `design.md` and `tasks.md` in `.kiro/specs/kiro-hooks/`.

## 3. lint:manifest

- [x] 3.1 Create `scripts/lint-manifest.ts` with the `RuleId` and `Violation` types, the `PERMISSIONS` and `OPTIONAL_HOSTS` constants, and `lintManifest(manifest, exists)`.
  - Req: 19 to 29
  - Check: tasks 3.4 and 3.5.

- [x] 3.2 Add `lintHtmlReferences(htmlFiles, exists)` for relative `<script src>` and `<link href>` targets missing from `dist/`.
  - Req: 29
  - Check: task 3.5.

- [x] 3.3 Add the CLI under `import.meta.main`: run `vite build`, lint `buildManifest("production")` and `dist/manifest.json`, lint `dist/*.html`, print violations, exit 1 on any violation or build failure, else print `lint:manifest: ok` and exit 0.
  - Req: 18, 30 to 33
  - Check: run `bun run lint:manifest` on the current tree and see exit code 0.

- [x] 3.4 Add `"lint:manifest": "bun scripts/lint-manifest.ts"` to `package.json`.
  - Req: 17
  - Check: `test/hooks.test.ts` finds the script.

- [x] 3.5 Write `test/lint-manifest.test.ts`: clean baseline, one table-driven row per rule (each expects only its own rule id), the combined bad manifest, the `wasm-unsafe-eval` pass, the `{}` manifest that must not throw, and the HTML reference cases. Pass a stub `exists`; no build, no `dist/` reads.
  - Req: 34 to 38
  - Check: `bun test ./test/lint-manifest.test.ts`.

- [x] 3.6 Prove the CLI catches a real break: temporarily add `"tabs"` to `permissions` in `src/manifest.ts`, run `bun run lint:manifest`, see exit code 1 and an `extra-permission` line, then revert the change.
  - Req: 22, 31
  - Check: command output pasted into the PR or commit message.

## 4. test:visual

- [ ] 4.1 Create `playwright.visual.config.ts` (own port 4322, `testDir: "e2e-visual"`, `snapshotPathTemplate` without `{platform}`, `animations: "disabled"`, `caret: "hide"`, `scale: "css"`, `maxDiffPixelRatio: 0.002`, `threshold: 0.1`, one worker).
  - Req: 41, 45, 50, 51
  - Check: `bun run test:visual` starts and finds the specs.

- [x] 4.2 Add `"test:visual"` and `"test:visual:update"` to `package.json`.
  - Req: 39, 40
  - Check: `test/hooks.test.ts` finds `test:visual`.

- [ ] 4.3 Create `e2e-visual/helpers.ts`: fixed clock (`page.clock.install` then `setFixedTime`, before `goto`), `waitForHaunted` (host exists, HUD visible, no running animations, counts settled), and the mask for run-specific text.
  - Req: 47 to 49
  - Check: run each shot twice in a row with no diff.

- [x] 4.4 Create `e2e-visual/visual.spec.ts`: costume shots for `index`, `trackers`, `links`, `dark-patterns` and `column`, popup idle and haunted, each at 1280 and 375, all with `reducedMotion: "reduce"`.
  - Req: 43, 44, 46
  - Check: 14 tests listed by `playwright test --config playwright.visual.config.ts --list`.

- [ ] 4.5 Generate the baselines in the Playwright Docker image (same version as `package.json`) with `bun run test:visual:update` and commit `e2e-visual/__screenshots__/`.
  - Req: 51, 54
  - Check: `bun run test:visual` passes in the same image with no diff, twice.

- [x] 4.6 Prove the checks bite. Delete one baseline and see the run fail. Change one costume colour by one web-safe step and see the run fail with a diff image in `test-results/`. Revert both.
  - Req: 52, 53
  - Check: both failures observed, trees clean afterwards.

- [x] 4.7 Confirm `bun run test:e2e` does not run any visual test.
  - Req: 42
  - Check: `playwright test --list` output has no `e2e-visual` files.

## 5. Hook file test

- [x] 5.1 Write `test/hooks.test.ts`: file discovery, required fields and types, name equals file name, `version`, `enabled`, `when.type`, `then` shape per type.
  - Req: 55 to 57
  - Check: `bun test ./test/hooks.test.ts`.

- [x] 5.2 Add the command check (`^bun run ([\w:-]+)$`, script exists in `package.json`) with a failure message that names the hook and the command.
  - Req: 58, 59
  - Check: a copy of a hook with `command: "rm -rf dist"` in a temp folder fails (test the checker function directly with a bad object).

- [x] 5.3 Add the named-hook table, the `era-accuracy` prompt checks (required words, the read-only sentence, no `then.command`), and the pattern-prefix existence check.
  - Req: 60 to 63
  - Check: `bun test ./test/hooks.test.ts`.

## 6. README

- [x] 6.1 Add a `## Kiro hooks` section: the three hooks in a table (hook, trigger, action), `.kiro/hooks/` and the Kiro IDE note, how to turn one off.
  - Req: 64, 65

- [x] 6.2 Describe `lint:manifest`, `test:visual` and `test:visual:update`, including when to update baselines and that baselines come from the Docker image.
  - Req: 66

- [x] 6.3 Add `lint:manifest` and `test:visual` to the "Checks" list, remove "Kiro hooks are still to come.", and mention `.kiro/hooks/` and the `kiro-hooks` spec under "How Kiro was used".
  - Req: 67 to 69

## 7. Final check

- [ ] 7.1 Run `bun run typecheck`, `bun run test`, `bun run lint:manifest`, `bun run test:visual` and `bun run docker:test`. All pass.
  - Req: all
  - Check: command output.
