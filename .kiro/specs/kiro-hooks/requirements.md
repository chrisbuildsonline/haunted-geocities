# Requirements: Kiro Hooks

## Overview

This spec adds three Kiro IDE agent hooks to the repo and the scripts behind two of them. The hooks run on file edits and catch three kinds of regression early: an MV3 manifest that breaks the permission rules, a costume or popup change that moves pixels, and a costume change that does not look like 1998.

Scope:

- Three hook files in `.kiro/hooks/`: `manifest-lint`, `visual-regression`, `era-accuracy`.
- `bun run lint:manifest` (`scripts/lint-manifest.ts`) with unit tests that feed it bad manifests.
- `bun run test:visual` with its own Playwright config and committed baselines.
- A unit test that checks every hook file.
- README updates.

Out of scope: changing the manifest, the costume or the popup. Hooks do not edit code. Steering references: `tech.md` (permissions, CSP, test and CI), `product.md` (permissions model), `era-accuracy.md`, `accessibility-and-motion.md` (reduced motion), `structure.md` (script and test locations).

Hooks run when a file is edited and saved in Kiro IDE. They are a local safety net, not a replacement for `bun run test` or `docker:test`.

## EARS Acceptance Criteria

### Hook files

1. The repo shall contain one JSON file per hook in `.kiro/hooks/`, named `<name>.kiro.hook`.
2. Each hook file shall parse as JSON and contain `enabled` (boolean), `name` (string), `description` (string), `version` (the string `"1"`), `when` (object with `type` and a non-empty `patterns` array of strings) and `then` (object with `type`).
3. Each hook's `name` shall equal its file name without `.kiro.hook`.
4. Where `then.type` is `runCommand`, `then.command` shall be a non-empty string. Where `then.type` is `askAgent`, `then.prompt` shall be a non-empty string.
5. Each hook shall ship with `enabled` set to `true`.
6. The `when.type` of every hook shall be `fileEdited`.

### manifest-lint hook

7. When `src/manifest.ts` or `vite.config.ts` is edited, the `manifest-lint` hook shall run the command `bun run lint:manifest`.
8. The `manifest-lint` hook shall not match any other file.

### visual-regression hook

9. When a file under `src/content/costume/`, a file under `src/popup/` or `design/DESIGN.md` is edited, the `visual-regression` hook shall run the command `bun run test:visual`.
10. The `visual-regression` hook shall not match any other file.

### era-accuracy hook

11. When a file under `src/content/costume/` is edited, the `era-accuracy` hook shall send the agent a prompt (`askAgent`).
12. The prompt shall tell the agent to review the edit against `.kiro/steering/era-accuracy.md`.
13. The prompt shall name these rules: only the 216 web-safe colours, only Comic Sans MS and Times New Roman, original pixel art, nothing that did not exist on a 1998 GeoCities page, and no third-party trademarks.
14. The prompt shall tell the agent to report each violation with its file and line.
15. The prompt shall tell the agent not to change code, and shall not instruct it to edit, create or delete files.
16. The `era-accuracy` hook shall not match any other file.

### lint:manifest script

17. The `package.json` shall declare a `lint:manifest` script that runs `scripts/lint-manifest.ts`.
18. When `bun run lint:manifest` runs, the script shall build the extension to `dist/` with `vite build`, build the manifest object with `buildManifest("production")`, and check both against the rules below.
19. The script shall export a pure function that takes a manifest object and a file-exists function and returns a list of violations. Each violation shall carry a rule id and a message that names the offending field.
20. If `manifest_version` is not `3`, the script shall report a violation.
21. If the manifest allows remote code, the script shall report a violation. Remote code means any of: an `http:` or `https:` source in `content_security_policy.extension_pages`, a `content_security_policy.sandbox` that allows a remote script source, a `content_scripts` entry whose `js` is a URL, or a `background.service_worker` that is a URL.
22. If `permissions` contains any entry other than `activeTab`, `scripting`, `declarativeNetRequest` and `storage`, the script shall report a violation that names the extra permission.
23. If any of `activeTab`, `scripting`, `declarativeNetRequest` or `storage` is missing from `permissions`, the script shall report a violation that names the missing permission.
24. If the manifest has `host_permissions`, the script shall report a violation.
25. If the manifest has `optional_permissions`, the script shall report a violation.
26. If `optional_host_permissions` is missing, or contains an entry other than `http://*/*` and `https://*/*`, the script shall report a violation.
27. If `content_security_policy.extension_pages` contains `unsafe-eval`, the script shall report a violation. If the CSP is absent, the script shall treat it as clean.
28. If a file the manifest references does not exist in `dist/`, the script shall report a violation that names the file. Referenced files are `background.service_worker`, `action.default_popup`, every path in `icons` and `action.default_icon`, every `content_scripts[].js` and `.css` entry, `options_page`, `options_ui.page`, and every file listed in `web_accessible_resources[].resources` that has no wildcard.
29. If `dist/` contains a built `.html` file whose `<script src>` or `<link href>` points to a file that is missing from `dist/`, the script shall report a violation.
30. When there are no violations, the script shall print one line that says so and exit with code 0.
31. When there is at least one violation, the script shall print every violation, one per line with its rule id, and exit with code 1.
32. If `vite build` fails, the script shall print the build output and exit with code 1.
33. The script shall lint the shipping manifest only. It shall not lint the `e2e` mode manifest, which has `host_permissions` by design.

### lint:manifest unit tests

34. The repo shall contain `test/lint-manifest.test.ts`, run by `bun run test`.
35. The test shall show that the shipping manifest (`buildManifest("production")`) with every referenced file present returns no violations.
36. For each of requirements 20 to 29, the test shall feed the lint function a manifest that breaks only that rule and expect a violation with the matching rule id and no other rule id.
37. The test shall feed a manifest that breaks several rules and expect one violation per broken rule.
38. The test shall not run `vite build` and shall not read `dist/`. It shall pass a stub file-exists function.

### test:visual script

39. The `package.json` shall declare a `test:visual` script that builds the e2e-mode extension and runs Playwright with `playwright.visual.config.ts`.
40. The `package.json` shall declare a `test:visual:update` script that does the same and passes `--update-snapshots`.
41. `playwright.visual.config.ts` shall be separate from `playwright.config.ts` and `playwright.screenshots.config.ts`, and shall serve the fixtures with `scripts/fixture-server.ts` on its own port.
42. `bun run test:e2e` shall not run the visual tests.
43. The visual tests shall photograph the haunted costume on `index.html`, `trackers.html`, `links.html`, `dark-patterns.html` and `column.html`, and the popup in its idle and haunted screens.
44. Each of those shots shall be taken at a viewport width of 1280 and at 375.
45. Every shot shall be taken with `animations: "disabled"`, `caret: "hide"`, and `scale: "css"`.
46. Every test shall run with `reducedMotion: "reduce"`, so the costume takes its static, final state.
47. Every test shall install a fixed clock with `page.clock` before the page loads, so the odometer, marquee and any date-based text are the same on every run.
48. Every test shall wait for the haunt to finish before the shot: the HUD is present, the haunt animation is done, and no tracker, link-check or fingerprint result is still pending.
49. Where a shot contains content that changes between runs (the fixture server port, the extension id), the test shall mask it or the fixture shall not show it.
50. `toHaveScreenshot` shall use a `maxDiffPixelRatio` of at most `0.002` and a `threshold` of at most `0.1`.
51. The baseline PNGs shall be committed under `e2e-visual/__screenshots__/`, with a path that does not include the operating system, so one set serves local runs and the Docker image.
52. If a shot differs from its baseline by more than the tolerance, the test shall fail and Playwright shall write the actual, expected and diff images under `test-results/`.
53. If a baseline does not exist, the test shall fail. It shall not create the baseline silently. Baselines are created only by `bun run test:visual:update`.
54. The baselines shall be generated in the same Playwright image the Dockerfile uses, so that font fallback and anti-aliasing match.

### Hook file unit test

55. The repo shall contain `test/hooks.test.ts`, run by `bun run test`.
56. The test shall read every `*.kiro.hook` file in `.kiro/hooks/` and fail if there are none.
57. For each file, the test shall check requirements 2 to 6.
58. For each hook with `then.type` of `runCommand`, the test shall check that the command is `bun run <script>` and that `<script>` is a key of `scripts` in `package.json`.
59. If a command is not `bun run <script>`, the test shall fail with a message that names the hook and the command.
60. The test shall check that the three hooks named in this spec exist and that each has the `when.patterns` listed in requirements 7, 9 and 11.
61. The test shall check that the `era-accuracy` prompt contains `era-accuracy.md` and each rule listed in requirement 13.
62. The test shall check that the `era-accuracy` prompt does not tell the agent to edit files.
63. For each pattern in a hook, the test shall check that it does not start with `/` or `..` and that the part before the first wildcard exists in the repo.

### Documentation

64. The README shall have a section that lists the three hooks, what edit triggers each, and what each runs or asks.
65. The README shall say where the hooks live (`.kiro/hooks/`) and that they are Kiro IDE hooks.
66. The README shall describe `bun run lint:manifest`, `bun run test:visual` and `bun run test:visual:update`, and say when to update baselines.
67. The README's "Checks" section shall list `lint:manifest` and `test:visual`.
68. The README's line "Kiro hooks are still to come." shall be removed.
69. The README's "How Kiro was used" section shall mention `.kiro/hooks/` and the `kiro-hooks` spec.

### Distinct triggers and the costume-reviewer agent

70. A save of a file under `src/content/costume/` shall set off exactly one hook, `visual-regression`.
71. `era-accuracy` shall fire on `agentStop` with no `patterns`. Its prompt shall run `git diff` on `src/content/costume/` and `src/popup/`, say so in one line and stop if nothing changed there, and otherwise review the changed lines against the same five rules as before. It shall stay read-only.
72. `baseline-refresh` shall fire on `userTriggered` with no `patterns`, and its prompt shall not say a file was just edited. Making baselines is a choice, so it is run by hand.
73. `test/hooks.test.ts` shall fail if two hooks share an event and pattern list, or if one repo file sets off two hooks on the same file event.
74. The repo shall contain the kiro-cli agent `.kiro/agents/costume-reviewer.json`: a read-only era-accuracy reviewer with `tools` and `allowedTools` of `["fs_read"]` only, the era-accuracy steering and `design/DESIGN.md` as resources, no MCP servers, and an `agentSpawn` hook that runs `git diff -- src/content/costume src/popup`.
75. The agent prompt shall name the five rules, ask for file and line for each problem, and contain `do not edit, create or delete any file`.
76. `test/kiro-agents.test.ts` shall check requirements 74 and 75 and that every `file://` resource exists.
