// docs/test-log.md, the record of the green pass the entry is frozen on. It states the date, the commit of the
// code that was tested, and a row per check with its test count and exit code. The unit and e2e counts are
// held to within 10% of what the runners report now (measured as in devpost.test.ts), the visual count to the
// committed baselines, so the log can't drift far from the suite. No .git is needed: the sha is only read
// from the file.
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

  test("the visual count matches the committed baselines", () => {
    const baselines = readdirSync(join(root, "e2e-visual", "__screenshots__", "visual.spec.ts")).filter((f) => f.endsWith(".png")).length;
    expect(baselines).toBeGreaterThan(0);
    expect(passed("Visual")).toBe(baselines);
  });
});
