// docs/test-log.md, the record of the green pass the entry is frozen on. It states the date, the commit of the
// code that was tested, and a row per check with its test count and exit code. The unit and e2e counts are
// held to within 10% of what the runners report now (measured as in devpost.test.ts), and so is the visual
// count, so the log can't drift far from the suite. Under "Captured output" it keeps the summary lines each
// runner printed on that commit, and their counts must match the table. When .git is there the sha must be HEAD
// or one of its ancestors, and only the docs and this guard may have changed since, so the log names the last
// code commit. The Docker image has no .git, so there the sha is only read from the file.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const path = join(root, "docs", "test-log.md");
const log = existsSync(path) ? readFileSync(path, "utf8") : "";

/** A table row `| <name> | <command> | <tests> | <exit code> |`. */
function row(name: string) {
  const m = log.match(new RegExp(`^\\| ${name} \\|([^|]*)\\|([^|]*)\\|\\s*(\\d+)\\s*\\|\\s*$`, "m"));
  return m ? { command: m[1]!.trim(), tests: m[2]!.trim(), exit: Number(m[3]) } : undefined;
}

/** The passed count in a row, e.g. "1352 passed, 0 failed" → 1352. */
const passed = (name: string) => Number(row(name)?.tests.match(/^(\d+) passed\b/)?.[1] ?? NaN);

/** Within 10% of the real count either way. */
const near = (stated: number, actual: number) => ({ stated, actual, ok: Number.isFinite(stated) && Math.abs(stated - actual) <= actual * 0.1 });

/** The fenced block under `### <name>` in the Captured output section. */
function captured(name: string) {
  const section = log.split(/^## Captured output$/m)[1] ?? "";
  return section.match(new RegExp(`^### ${name}\\n+\`\`\`\\n([\\s\\S]*?)\\n\`\`\`$`, "m"))?.[1] ?? "";
}

/** Every `N passed (` count in a block, as playwright prints its summary. */
const pwPassed = (block: string) => [...block.matchAll(/\b(\d+) passed \(/g)].map((m) => Number(m[1]));

const sha = log.match(/^- Commit: `([0-9a-f]{7,40})`/m)?.[1] ?? "";
const hasGit = existsSync(join(root, ".git"));
const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });

/** What may change after the logged commit: the docs and the guard that reads them. */
const AFTER_LOG = (f: string) => f.startsWith("docs/") || f === "test/test-log.test.ts" || f === "test/devpost.test.ts";

describe("docs/test-log.md", () => {
  test("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  test("records the date of the run", () => {
    const date = log.match(/^- Date: (\d{4}-\d{2}-\d{2})$/m)?.[1];
    expect(date).toBeDefined();
    expect(Number.isNaN(Date.parse(date!))).toBe(false);
  });

  test("records the commit sha of the code that was tested", () => {
    expect(log).toMatch(/^- Commit: `[0-9a-f]{7,40}`/m);
  });

  test.skipIf(!hasGit)("the sha is a real commit, HEAD or one of its ancestors", () => {
    expect({ sha, commit: git("cat-file", "-e", `${sha}^{commit}`).exitCode }).toEqual({ sha, commit: 0 });
    expect({ sha, ancestor: git("merge-base", "--is-ancestor", sha, "HEAD").exitCode }).toEqual({ sha, ancestor: 0 });
  });

  test.skipIf(!hasGit)("the sha is the last code commit: only the docs and this guard changed after it", () => {
    const r = git("diff", "--name-only", sha, "HEAD");
    expect(r.exitCode).toBe(0);
    const changed = `${r.stdout}`.split("\n").filter(Boolean);
    expect(changed.filter((f) => !AFTER_LOG(f))).toEqual([]);
  });

  test("keeps the captured runner output for every check", () => {
    for (const name of ["Typecheck", "Unit", "E2E", "Visual", "Docker"]) {
      expect({ name, captured: captured(name).trim().length > 0 }).toEqual({ name, captured: true });
    }
  });

  test("the captured typecheck ran tsc and printed no errors", () => {
    expect(captured("Typecheck")).toContain("$ tsc --noEmit");
    expect(captured("Typecheck")).not.toMatch(/error TS\d+/);
  });

  test("the captured unit summary is bun's, with the table's count and 0 fail", () => {
    const out = captured("Unit");
    const n = passed("Unit");
    expect(out).toMatch(new RegExp(`^ ${n} pass$`, "m"));
    expect(out).toMatch(/^ 0 fail$/m);
    expect(out).toMatch(new RegExp(`^Ran ${n} tests across \\d+ files\\.`, "m"));
  });

  test("the captured e2e and visual summaries are playwright's, with the table's counts and nothing failed", () => {
    for (const name of ["E2E", "Visual"]) {
      const out = captured(name);
      expect({ name, counts: pwPassed(out) }).toEqual({ name, counts: [passed(name)] });
      expect({ name, failed: /\b\d+ (failed|flaky)\b/.test(out) }).toEqual({ name, failed: false });
    }
  });

  test("the captured Docker run reached the image tag, its e2e and visual counts match the table", () => {
    const out = captured("Docker");
    expect(out).toContain("RUN bun run test:visual");
    expect(out).toMatch(/naming to \S*haunted-geocities:test\b.*done/);
    expect(out).not.toMatch(/\bERROR\b/);
    expect(pwPassed(out)).toEqual([passed("E2E"), passed("Visual")]);
    expect(row("Docker")?.tests).toContain(`${passed("E2E")} e2e, ${passed("Visual")} visual`);
  });

  test("has a row with an exit code for typecheck, unit, e2e, visual and the Docker run, and every one is 0", () => {
    for (const name of ["Typecheck", "Unit", "E2E", "Visual", "Docker"]) {
      expect({ name, exit: row(name)?.exit }).toEqual({ name, exit: 0 });
    }
  });

  test("names the command behind each row", () => {
    expect(row("Typecheck")?.command).toContain("bun run typecheck");
    expect(row("Unit")?.command).toContain("bun run test`");
    expect(row("E2E")?.command).toContain("bun run test:e2e");
    expect(row("Visual")?.command).toContain("bun run test:visual");
    expect(row("Docker")?.command).toContain("bun run docker:test");
  });

  test("unit, e2e and visual rows give a passed count and no failures", () => {
    for (const name of ["Unit", "E2E", "Visual"]) {
      const tests = row(name)?.tests ?? "";
      expect({ name, passed: /^\d+ passed, 0 failed$/.test(tests) }).toEqual({ name, passed: true });
    }
  });

  test("the unit count is within 10% of the real bun count", () => {
    const r = Bun.spawnSync([process.execPath, "test", "./test/", "-t", "zz-test-log-count-only-zz"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = `${r.stdout}${r.stderr}`;
    const m = out.match(/skipping (\d+) tests/);
    expect({ parsed: !!m, out: m ? "" : out }).toEqual({ parsed: true, out: "" });
    expect(near(passed("Unit"), Number(m![1]))).toMatchObject({ ok: true });
  }, 60_000);

  test("the e2e count is within 10% of playwright test --list", () => {
    const r = Bun.spawnSync([process.execPath, "x", "playwright", "test", "--list", "--reporter=dot"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = `${r.stdout}${r.stderr}`;
    const m = out.match(/Total: (\d+) tests? in/);
    expect({ parsed: !!m, out: m ? "" : out }).toEqual({ parsed: true, out: "" });
    expect(near(passed("E2E"), Number(m![1]))).toMatchObject({ ok: true });
  }, 60_000);

  test("the visual count is within 10% of playwright test --list on the visual config, which has committed baselines", () => {
    expect(readdirSync(join(root, "e2e-visual", "__screenshots__", "visual.spec.ts")).filter((f) => f.endsWith(".png")).length).toBeGreaterThan(0);
    const r = Bun.spawnSync([process.execPath, "x", "playwright", "test", "--config", "playwright.visual.config.ts", "--list", "--reporter=dot"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = `${r.stdout}${r.stderr}`;
    const m = out.match(/Total: (\d+) tests? in/);
    expect({ parsed: !!m, out: m ? "" : out }).toEqual({ parsed: true, out: "" });
    expect(near(passed("Visual"), Number(m![1]))).toMatchObject({ ok: true });
  }, 60_000);
});
