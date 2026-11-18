# Design: Kiro Hooks

## Context

Three Kiro IDE hooks watch the files that most often break this project's rules. Two run a command and one asks the agent for a read-only review. The command hooks need two new scripts (`lint:manifest`, `test:visual`). A unit test keeps the hook files honest.

Steering references: `tech.md` (permissions, no `host_permissions` at install, Bun/Playwright/Docker), `product.md` (permissions model), `era-accuracy.md` (the rules the review hook cites), `accessibility-and-motion.md` (reduced motion, used for deterministic shots), `structure.md` (where scripts and tests go). Design reference: `design/DESIGN.md` (costume palette, popup width, 375px layout).

Requirement numbers below refer to `requirements.md`.

## Files

```
.kiro/hooks/
  manifest-lint.kiro.hook
  visual-regression.kiro.hook
  era-accuracy.kiro.hook
scripts/lint-manifest.ts           # new: rules + CLI
test/lint-manifest.test.ts         # new: bad-manifest tests
test/hooks.test.ts                 # new: hook file checks
playwright.visual.config.ts        # new
e2e-visual/
  visual.spec.ts                   # new: shots
  helpers.ts                       # new: fixed clock, wait-for-haunt
  __screenshots__/                 # new: committed baselines
package.json                       # + 3 scripts
README.md                          # hooks section, checks list
```

`e2e-visual/` is separate from `e2e/` so `playwright.config.ts` (`testDir: "e2e"`) never picks the visual tests up (req 42). The visual specs reuse the persistent-context extension fixture in `e2e/fixtures.ts`.

## Hook files (req 1 to 16)

Shape, as used by Kiro IDE:

```json
{
  "enabled": true,
  "name": "<file name without .kiro.hook>",
  "description": "...",
  "version": "1",
  "when": { "type": "fileEdited", "patterns": ["glob", "..."] },
  "then": { "type": "runCommand", "command": "bun run <script>" }
}
```

| Hook | `when.patterns` | `then` |
| --- | --- | --- |
| `manifest-lint` | `src/manifest.ts`, `vite.config.ts` | `runCommand`: `bun run lint:manifest` |
| `visual-regression` | `src/content/costume/**`, `src/popup/**`, `design/DESIGN.md` | `runCommand`: `bun run test:visual` |
| `era-accuracy` | `src/content/costume/**` | `askAgent` with a read-only review prompt |

Decisions:

- **`fileEdited`.** It fires on save, which is when a lint or a screenshot run makes sense. `fileCreated` is left out: a new file under the costume folder is usually edited again straight away.
- **Commands go through `bun run <script>`.** The hook file then names a script, not a shell line. The unit test can check that the script exists (req 58), and the real command can change without touching the hook.
- **The review prompt is read-only.** It lists the five rules from `era-accuracy.md` in the prompt itself, so the review works even if the agent does not load steering. It asks for file, line, offending text, rule and nearest compliant alternative, and ends with an explicit "do not edit, create or delete any file". The agent is also told to report a clean result in one line, so a passing edit does not fill the chat.
- **Overlap.** An edit under `src/content/costume/` fires both `visual-regression` and `era-accuracy`. They are independent. The command runs in the terminal, the review runs in chat.
- **Cost.** `test:visual` builds and launches Chromium, so it takes tens of seconds. That is acceptable for a hook on a narrow path set. A user can set `enabled` to `false` in the file or turn it off in the Kiro hooks panel.

## lint:manifest (req 17 to 33)

### Shape

`scripts/lint-manifest.ts` has two layers so the rules are testable without a build:

```ts
export type Violation = { rule: RuleId; message: string };
export type RuleId =
  | "mv3" | "remote-code" | "extra-permission" | "missing-permission"
  | "host-permissions" | "optional-permissions" | "optional-hosts"
  | "csp-unsafe-eval" | "missing-file" | "html-reference";

export function lintManifest(
  manifest: Record<string, unknown>,
  exists: (path: string) => boolean,
): Violation[];

export function lintHtmlReferences(
  htmlFiles: { path: string; source: string }[],
  exists: (path: string) => boolean,
): Violation[];
```

The CLI part runs only when the file is the entry point (`if (import.meta.main)`):

1. Run `vite build` (production mode) with `Bun.spawnSync`. On a non-zero exit, print its stdout and stderr and exit 1 (req 32).
2. Import `buildManifest` from `src/manifest.ts` and call it with `"production"` (req 18, 33). It lints the object the source produces, then checks `dist/manifest.json` as well, by running the same function on it. A mismatch between the two shows up as violations from either run.
3. `exists = (p) => existsSync(join("dist", p))`.
4. Read every `.html` file in `dist/` and run `lintHtmlReferences`.
5. Print violations and exit with 1, or print `lint:manifest: ok` and exit 0 (req 30, 31).

The function takes a plain object, so the tests can feed it anything. Unknown or wrongly typed fields are treated as violations of the rule they affect, never as a crash.

### Rules

The allowed sets come from `tech.md` and `product.md` and live as constants at the top of the file:

```ts
const PERMISSIONS = ["activeTab", "scripting", "declarativeNetRequest", "storage"];
const OPTIONAL_HOSTS = ["http://*/*", "https://*/*"];
```

| Rule id | Req | Check |
| --- | --- | --- |
| `mv3` | 20 | `manifest_version === 3` |
| `remote-code` | 21 | Any `http:`/`https:` source in `content_security_policy.extension_pages`, `script-src` or `object-src`. A sandbox policy with a remote `script-src`. A `content_scripts[].js` or `background.service_worker` that matches `^(https?:)?//`. |
| `extra-permission` | 22 | Entries of `permissions` not in `PERMISSIONS`. One violation per entry. |
| `missing-permission` | 23 | Entries of `PERMISSIONS` not in `permissions`. One per entry. |
| `host-permissions` | 24 | `"host_permissions" in manifest` |
| `optional-permissions` | 25 | `"optional_permissions" in manifest` |
| `optional-hosts` | 26 | `optional_host_permissions` is not an array, or has an entry outside `OPTIONAL_HOSTS`, or lacks one of them |
| `csp-unsafe-eval` | 27 | `content_security_policy.extension_pages` contains the token `'unsafe-eval'` (case-insensitive). No CSP is clean. |
| `missing-file` | 28 | Each referenced path (list in req 28) fails `exists`. Leading `/` and `./` are stripped. |
| `html-reference` | 29 | A `<script src>` or `<link href>` in a built HTML file that is relative and missing. Absolute URLs are not checked here, they are covered by the existing "no build output asks for anything over the network" test. |

Details:

- `wasm-unsafe-eval` is allowed by Chrome in extension pages and is not `unsafe-eval`. The check matches the whole token `'unsafe-eval'`, so `'wasm-unsafe-eval'` passes.
- The "extra permission" and "missing permission" rules are separate so the message says which way the manifest drifted. They do not overlap with `host-permissions`, because `host_permissions` is a different key.
- The shipping manifest has no `icons`, so none are checked today. The rule is there so adding icons later is covered.
- The manifest test `test/manifest.test.ts` already checks the same values for the current build. The lint script is the same checks as a fast, hook-sized command that also reports in one list and covers CSP, remote code and file existence, which that test does not.

### package.json

```json
"lint:manifest": "bun scripts/lint-manifest.ts"
```

### Tests: `test/lint-manifest.test.ts` (req 34 to 38)

- A `good()` helper returns `{ ...buildManifest("production") }` as a plain object. A `present` set stands in for `dist/`, built from the referenced files, and `exists = (p) => present.has(p)`.
- Baseline: `lintManifest(good(), exists)` equals `[]`.
- One table-driven test. Each row is `[name, mutate(manifest), expectedRule]`. The assertion is `violations.map(v => v.rule)` equals `[expectedRule]`, which proves the manifest breaks only that rule:
  - `manifest_version: 2` gives `mv3`.
  - `content_security_policy.extension_pages = "script-src 'self' https://cdn.example.com"` gives `remote-code`.
  - `background.service_worker = "https://evil.example/sw.js"` gives `remote-code`. Its file does not exist in `dist`, so this row also removes the file check by making `exists` return true for it, to keep the assertion to one rule.
  - `permissions` plus `"tabs"` gives `extra-permission`.
  - `permissions` minus `"storage"` gives `missing-permission`.
  - `host_permissions: ["<all_urls>"]` gives `host-permissions`.
  - `optional_permissions: ["history"]` gives `optional-permissions`.
  - `optional_host_permissions: ["<all_urls>"]` gives `optional-hosts`. The array is non-empty but wrong, and it also lacks the two required entries, so the rule emits one violation, not two.
  - `content_security_policy.extension_pages = "script-src 'self' 'unsafe-eval'"` gives `csp-unsafe-eval`.
  - `'wasm-unsafe-eval'` gives `[]`.
  - `exists` returns false for `popup.html` gives `missing-file`, and the message contains `popup.html`.
  - `icons: { "16": "icons/16.png" }` with the file absent gives `missing-file`.
- A combined row breaks three rules at once and expects exactly those three ids.
- `lintHtmlReferences` gets a small HTML string with a relative `<script src>` that is missing and expects `html-reference`. A present file expects `[]`, and `https://` sources are ignored.
- A manifest missing a field (`{}`) must not throw. It returns `mv3`, `missing-permission` ×4 and `optional-hosts`.

## test:visual (req 39 to 54)

### Scripts

```json
"test:visual": "vite build --mode e2e && playwright test --config playwright.visual.config.ts",
"test:visual:update": "vite build --mode e2e && playwright test --config playwright.visual.config.ts --update-snapshots"
```

The e2e-mode build is needed because Playwright cannot click the toolbar icon, so activeTab is not granted (see the README "Checks" section). The shipping `dist/` is untouched. Existing scripts do the same for `test:e2e`.

### `playwright.visual.config.ts`

```ts
export const VISUAL_PORT = 4322;

export default defineConfig({
  testDir: "e2e-visual",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.002,
      threshold: 0.1,
    },
  },
  reporter: [["list"]],
  webServer: { command: `exec bun scripts/fixture-server.ts ${VISUAL_PORT}`, url: ..., reuseExistingServer: !process.env.CI, stdout: "ignore" },
});
```

`updateSnapshots` is left at Playwright's default, `"missing"`. With it, a missing baseline is written from the actual shot and the test is still reported as failed, which meets requirement 53. The README says baselines are made on purpose with `test:visual:update`. The tasks include a check that a run with a deleted baseline fails.

Decisions:

- **Own port, own config.** `4322`, so `test:e2e` and `test:visual` can run on one machine with `reuseExistingServer` without sharing a server.
- **No `{platform}` in the path.** The Playwright default template adds the OS name, which would need one baseline set per OS. A single set means the baselines must come from the Docker image (req 54). Locally on Linux with the same Chromium the diffs are usually zero. On macOS or Windows, font rendering differs, so run the visual tests in Docker there.
- **Tolerance.** `maxDiffPixelRatio: 0.002` allows about 0.2 % of pixels to differ (about 1,800 px on a 1280×720 shot, 500 px at 375×667), enough for sub-pixel text smoothing but not for a moved sprite, a changed colour or a shifted band. `threshold: 0.1` is the per-pixel YIQ colour distance and lets anti-aliased edges pass. Both numbers are the starting point. Loosen only with evidence from a failing diff.
- **`animations: "disabled"`** makes CSS animations and transitions finish at their end state and infinite ones go to their start state. Together with `reducedMotion: "reduce"` the costume already takes its static path (design: Reduced-motion rules), so the haunt shot shows the end state with no wipe.

### `e2e-visual/helpers.ts`

- `FIXED_TIME = new Date("1998-10-31T12:00:00Z")`. `await page.clock.install({ time: FIXED_TIME })` runs before `goto`, and `page.clock.pauseAt` is not used because the haunt sequence needs timers to run. Instead the clock is set to a fixed starting time and left running: `install` then `setFixedTime(FIXED_TIME)`. `Date.now()` is then constant, and `setTimeout` still fires on real time. This fixes anything that prints a date or derives a value from the time, without freezing the timers that finish the haunt.
- `waitForHaunted(page)`: waits for the `<hg-crypt>` host to exist, for the HUD to be visible (via the extension's own test hook if the e2e specs already use one; otherwise the same wait the existing `e2e/costume.spec.ts` uses), and then for `document.getAnimations()` to be empty for the host's shadow tree. It also waits for the popup counts to stop changing, for pages with trackers or link checks (`links.html` HEAD requests), by polling the HUD counts until two reads 100 ms apart agree.
- `mask(page)`: returns locators for anything run-specific. The popup shows the page host, which includes the fixture port (`127.0.0.1:4322`), so the popup shot masks the hostname line, or the helper navigates to a fixture host that shows no port. The neighborhood address shown in the bar is derived from the host name only, so it is stable.
- The trackers and vampire fixtures need `--host-resolver-rules`. Those hosts are left out of the visual set except `trackers.html`, which loads from `criteo.com` and is mapped in the context launch args exactly as `e2e/` already does it (reuse `e2e/fixtures.ts`).

### `e2e-visual/visual.spec.ts`

A loop over `[1280, 375]` and over `["index", "trackers", "links", "dark-patterns", "column"]`:

```ts
for (const width of [1280, 375]) {
  for (const fixture of FIXTURES) {
    test(`costume ${fixture} @${width}`, async ({ ... }) => {
      page.setViewportSize({ width, height: width === 1280 ? 800 : 667 });
      // install clock, goto, haunt through the popup helper, waitForHaunted
      await expect(page).toHaveScreenshot(`costume-${fixture}-${width}.png`);
    });
  }
}
```

Popup shots open `chrome-extension://<id>/popup.html` as a tab at each width, once idle and once with the fixture haunted. Idle and haunted are two separate tests: `popup-idle-{width}.png`, `popup-haunted-{width}.png`. The popup is 360 px wide by design, so at 1280 it shows as a 360 px column on the canvas, and at 375 it fills the viewport. This checks both.

Totals: 5 fixtures × 2 widths for the costume plus 2 screens × 2 widths for the popup, 14 baselines.

### Baselines (req 51, 54)

- Baselines are generated by running `test:visual:update` inside the `mcr.microsoft.com/playwright` image at the version in `package.json`, the same base image the Dockerfile uses, and committing `e2e-visual/__screenshots__/`. No new Docker script is added.
- A baseline change should always be part of the commit that changes the look, and the diff images get reviewed by a person.

## Hook file test: `test/hooks.test.ts` (req 55 to 63)

- Reads `.kiro/hooks/*.kiro.hook` with `readdirSync`, and `package.json` from the repo root, using the same `root = join(import.meta.dir, "..")` as `test/manifest.test.ts`.
- `test.each` over the files: parse, check required fields and types, name equals file name, `version === "1"`, `enabled === true`, `when.type === "fileEdited"`, `when.patterns` non-empty strings, and the `then` shape per type.
- Command check: regex `^bun run ([\w:-]+)$` on `then.command`. A non-match fails with a message containing the hook name and the command. The captured name must be a key of `package.json` `scripts`.
- Named-hook check: a table of `{ name, patterns, thenType }` for the three hooks, compared with `toEqual` on sorted patterns.
- Prompt check for `era-accuracy`: contains `era-accuracy.md`, `216`, `Comic Sans MS`, `Times New Roman`, `pixel art`, `1998`, `trademark`, `line`; does not match `/\b(edit|modify|change|fix|rewrite)\b[^.]*\b(file|code)\b/i` outside a negation. Simplest reliable form: the prompt must contain the sentence `do not edit, create or delete any file`, and must not contain `fix it`, `apply`, `rewrite` or `update the file`. The test also fails if the hook has any `then.command`.
- Pattern check: for each pattern, strip it at the first `*`, then require the remaining directory prefix to exist (`src/content/costume/`, `src/popup/`), or, for a pattern with no wildcard, the file itself (`src/manifest.ts`, `vite.config.ts`, `design/DESIGN.md`). A rename of a folder then fails the test instead of silently disabling the hook. Patterns may not begin with `/` or `..`.

Note: until `lint:manifest` and `test:visual` exist in `package.json`, this test fails on purpose. That is the check working (req 58). Task order in `tasks.md` adds the scripts before the test is expected to pass.

## README (req 64 to 69)

- New `## Kiro hooks` section after "Checks", with a three-row table (hook, runs when, what it does) and a short paragraph on how to disable one.
- Subsections for `lint:manifest` (what it checks) and `test:visual` (what is photographed, how baselines are made and when to update them).
- "Checks" gets two lines.
- "Kiro hooks are still to come." goes.
- "How Kiro was used" gets `.kiro/hooks/` and the `kiro-hooks` spec.

This README change is a task for a later pass. This spec creation changes `.kiro/` only.

## Risks

- **Flaky shots.** Mitigated by reduced motion, disabled animations, a fixed clock, a wait that checks the HUD counts have settled, and a small tolerance. If a shot still flakes, the first fix is a better wait, not a larger tolerance.
- **Font fallback.** The costume uses Comic Sans MS, which is usually missing on Linux. The fallback font is the same in the Docker image every time, which is why baselines come from there.
- **Slow hook.** See Cost above.
- **Hook patterns vs. file moves.** The pattern check in `hooks.test.ts` catches a moved directory.

## Distinct triggers and the costume-reviewer agent (req 70 to 76)

Three hooks used to fire on one costume save: `visual-regression`, `era-accuracy` and `baseline-refresh`. Each now has its own trigger.

| Hook | Event | When it runs |
| --- | --- | --- |
| `visual-regression` | `fileEdited` on costume, popup and `design/DESIGN.md` | Every costume save. Unchanged. |
| `era-accuracy` | `agentStop` | After the agent finishes a turn. Reads `git diff` on `src/content/costume/` and `src/popup/` and stops with one line if there is no diff. |
| `baseline-refresh` | `userTriggered` | By hand, after a costume change you meant. Docker, `bun run visual:baselines`, then a git summary. |

`agentStop` and `userTriggered` carry no `patterns`, and the hook test already allows that. The overlap check in `test/hooks.test.ts` compares the event and sorted patterns of every pair of hooks, and expands each file-event pattern with `Bun.Glob` over `git ls-files` to catch a file that sets off two hooks on the same event. A separate test pins that a costume save sets off only `visual-regression`.

`.kiro/agents/costume-reviewer.json` is the same era review as a kiro-cli agent you start on demand. It reads only: `fs_read` is its one tool and its one pre-approved tool, so it cannot write, run shell commands or reach AWS. The `agentSpawn` hook gives it the costume and popup diff before the first turn, and the era-accuracy steering and `design/DESIGN.md` load as resources. `test/kiro-agents.test.ts` holds it to that shape.
