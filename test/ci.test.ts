// .github/workflows/ci.yml runs the checks on every push and pull request: typecheck and unit tests with bun,
// then e2e and visual through the Docker test target (the Dockerfile's last stage). The README carries its badge.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const path = join(root, ".github", "workflows", "ci.yml");
const ci = existsSync(path) ? readFileSync(path, "utf8") : "";
const readme = readFileSync(join(root, "README.md"), "utf8");
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

const REPO = "https://github.com/chrisbuildsonline/haunted-geocities";
const BADGE = `[![CI](${REPO}/actions/workflows/ci.yml/badge.svg)](${REPO}/actions/workflows/ci.yml)`;

describe(".github/workflows/ci.yml", () => {
  test("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  test("runs on push and pull request", () => {
    expect(ci).toMatch(/^on:/m);
    expect(ci).toMatch(/^\s+push:/m);
    expect(ci).toMatch(/^\s+pull_request:/m);
  });

  // docs/test-log.md names the commit it ran on and test-log.test.ts checks it is in HEAD's history,
  // so the checkout needs the whole history, not the default depth of 1
  test("checks out the full history", () => {
    expect(ci).toMatch(/uses: actions\/checkout@v\d+\n\s+with:\n\s+fetch-depth: 0$/m);
  });

  test("sets up bun with oven-sh/setup-bun and installs from the lockfile", () => {
    expect(ci).toMatch(/uses: oven-sh\/setup-bun@v\d/);
    expect(ci).toContain("bun install --frozen-lockfile");
  });

  test("runs the typecheck and the unit tests through their scripts", () => {
    expect(ci).toMatch(/run: bun run typecheck$/m);
    expect(ci).toMatch(/run: bun run test$/m);
    expect(scripts.typecheck).toBe("tsc --noEmit");
    expect(scripts.test).toBe("bun test ./test/");
  });

  test("runs e2e and visual through the Docker test target", () => {
    expect(ci).toMatch(/run: bun run docker:test$/m);
    expect(scripts["docker:test"]).toMatch(/^docker build .*-t haunted-geocities:test \.$/);
    // the last stage is the test target: it ends with the e2e and visual runs
    const last = dockerfile.split(/^FROM /m).at(-1) ?? "";
    expect(last).toMatch(/^base\s*$/m);
    for (const step of ["bun run typecheck", "bun run test", "bun run test:e2e", "bun run test:visual"]) {
      expect({ step, found: last.includes(`RUN ${step}\n`) || last.endsWith(`RUN ${step}`) }).toEqual({ step, found: true });
    }
  });
});

describe("README CI badge", () => {
  // near the top, after the GIF and the disclosure line (real-site.test.ts pins those to lines 3 and 5)
  test("a CI badge line for ci.yml sits in the first ten lines", () => {
    const at = readme.split("\n").indexOf(BADGE);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(10);
  });
});
