// The Kiro IDE hook files in .kiro/hooks/: shape, commands that resolve to package.json scripts,
// the named hooks, read-only era-accuracy and rule-factory prompts, patterns that point at real paths,
// and no two hooks that fire on the same save.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const hooksDir = join(root, ".kiro", "hooks");
const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

const files = existsSync(hooksDir) ? readdirSync(hooksDir).filter((f) => f.endsWith(".kiro.hook")).sort() : [];
const hooks = files.map((file) => ({ file, hook: JSON.parse(readFileSync(join(hooksDir, file), "utf8")) as Record<string, any> }));
const byName = (name: string) => hooks.find((h) => h.hook.name === name)?.hook;

/** Problems with a runCommand hook's command, as messages that name the hook and the command. */
function commandProblems(hook: { name?: unknown; then?: { type?: unknown; command?: unknown } }, known: Record<string, string>): string[] {
  if (hook.then?.type !== "runCommand") return [];
  const command = hook.then.command;
  const m = typeof command === "string" ? /^bun run ([\w:-]+)$/.exec(command) : null;
  if (!m) return [`hook ${String(hook.name)}: command ${JSON.stringify(command)} is not "bun run <script>"`];
  if (!Object.hasOwn(known, m[1]!)) return [`hook ${String(hook.name)}: command "${command}" runs a script missing from package.json`];
  return [];
}

/** Problems with a when.patterns entry: absolute or parent paths, or a prefix that does not exist. */
function patternProblems(pattern: string, exists: (p: string) => boolean = (p) => existsSync(join(root, p))): string[] {
  if (pattern.startsWith("/") || pattern.startsWith("..")) return [`pattern ${pattern} must be relative to the repo`];
  const star = pattern.indexOf("*");
  const prefix = star === -1 ? pattern : pattern.slice(0, star);
  if (prefix === "") return [];
  return exists(prefix) ? [] : [`pattern ${pattern}: ${prefix} does not exist`];
}

/** Kiro IDE events that come with file patterns, and the ones that do not. */
const FILE_EVENTS = ["fileEdited", "fileCreated", "fileDeleted"];
const OTHER_EVENTS = ["userTriggered", "agentStop", "promptSubmit"];

type HookLike = { name?: unknown; when?: { type?: unknown; patterns?: unknown } };

/** Top-level folders that hold dependencies, builds, git internals or scratch, not repo files. */
const NOT_REPO = new Set(["node_modules", "dist", "dist-e2e", ".git", "prototype", ".backups", "test-results", "playwright-report", ".claude", ".omc"]);

/** Every file in the repo folder, as repo-relative paths. Walks the disk, so it works without .git (the Docker build). */
function repoFiles(dir: string = root): string[] {
  const all = new Bun.Glob("**/*");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !NOT_REPO.has(e.name))
    .flatMap((e) => (e.isDirectory() ? [...all.scanSync({ cwd: join(dir, e.name), dot: true })].map((p) => `${e.name}/${p}`) : e.isFile() ? [e.name] : []));
}

/**
 * Overlaps between hooks: two hooks on the same event with the same pattern list, or one repo file that
 * sets off two hooks on the same file event. Each message names both hooks.
 */
function overlapProblems(list: HookLike[], paths: string[]): string[] {
  const problems: string[] = [];
  const key = (h: HookLike) => `${String(h.when?.type)} ${JSON.stringify([...((h.when?.patterns as string[] | undefined) ?? [])].sort())}`;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i]!, list[j]!];
      if (key(a) === key(b)) problems.push(`hooks ${String(a.name)} and ${String(b.name)} share the event and patterns ${key(a)}`);
    }
  }
  for (const path of paths) {
    const hits = list.filter(
      (h) => FILE_EVENTS.includes(String(h.when?.type)) && ((h.when?.patterns as string[] | undefined) ?? []).some((p) => new Bun.Glob(p).match(path)),
    );
    for (const type of FILE_EVENTS) {
      const same = hits.filter((h) => h.when?.type === type);
      if (same.length > 1) problems.push(`${path} sets off ${same.map((h) => String(h.name)).join(" and ")} on ${type}`);
    }
  }
  return problems;
}

test("there is at least one hook file", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe.each(hooks)("$file", ({ file, hook }) => {
  test("has the required fields with the right types", () => {
    expect(typeof hook.enabled).toBe("boolean");
    expect(typeof hook.name).toBe("string");
    expect(typeof hook.description).toBe("string");
    expect(hook.description.length).toBeGreaterThan(0);
    expect(typeof hook.when).toBe("object");
    expect(typeof hook.then).toBe("object");
    expect(typeof hook.when.type).toBe("string");
    expect(typeof hook.then.type).toBe("string");
    if (!FILE_EVENTS.includes(hook.when.type)) return;
    expect(Array.isArray(hook.when.patterns)).toBe(true);
    expect(hook.when.patterns.length).toBeGreaterThan(0);
    for (const p of hook.when.patterns) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    }
  });

  test("name equals the file name", () => {
    expect(hook.name).toBe(file.replace(/\.kiro\.hook$/, ""));
  });

  test('is version "1", enabled and fires on a Kiro IDE event', () => {
    expect(hook.version).toBe("1");
    expect(hook.enabled).toBe(true);
    expect([...FILE_EVENTS, ...OTHER_EVENTS]).toContain(hook.when.type);
  });

  test("only a file event carries patterns", () => {
    if (!FILE_EVENTS.includes(hook.when.type)) expect(hook.when.patterns ?? []).toEqual([]);
  });

  test("then has the shape its type needs", () => {
    expect(["runCommand", "askAgent"]).toContain(hook.then.type);
    if (hook.then.type === "runCommand") {
      expect(typeof hook.then.command).toBe("string");
      expect(hook.then.command.length).toBeGreaterThan(0);
    } else {
      expect(typeof hook.then.prompt).toBe("string");
      expect(hook.then.prompt.length).toBeGreaterThan(0);
    }
  });

  test("a command is bun run <script> and the script exists", () => {
    expect(commandProblems(hook, scripts)).toEqual([]);
  });

  test("every pattern is relative and points at a path that exists", () => {
    expect((hook.when.patterns ?? []).flatMap((p: string) => patternProblems(p))).toEqual([]);
  });
});

describe("no two hooks overlap", () => {
  test("no two hooks share an event and patterns, and no repo file sets off two hooks on one save", () => {
    const paths = repoFiles();
    expect(paths).toContain("src/content/costume/render.ts");
    expect(overlapProblems(hooks.map((h) => h.hook), paths)).toEqual([]);
  });

  test("repoFiles walks the folder without git and skips build, dependency and scratch folders", () => {
    // The Docker build copies the repo without .git, so this must not lean on git history.
    const dir = mkdtempSync(join(tmpdir(), "hooks-repo-"));
    try {
      const keep = ["src/content/costume/render.ts", ".kiro/hooks/a.kiro.hook", "README.md"];
      const skip = ["node_modules/x/index.js", "dist/a.js", "dist-e2e/a.js", ".git/HEAD", "prototype/a.html", ".backups/a.ts"];
      for (const p of [...keep, ...skip]) {
        mkdirSync(dirname(join(dir, p)), { recursive: true });
        writeFileSync(join(dir, p), "");
      }
      expect(repoFiles(dir).sort()).toEqual([...keep].sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a costume save sets off exactly one hook", () => {
    const hits = hooks.filter(({ hook }) => hook.when.type === "fileEdited" && hook.when.patterns.some((p: string) => new Bun.Glob(p).match("src/content/costume/tokens.ts")));
    expect(hits.map((h) => h.hook.name)).toEqual(["visual-regression"]);
  });

  test("overlapProblems catches the old three-hooks-on-one-costume-save setup", () => {
    const costume = { type: "fileEdited", patterns: ["src/content/costume/**"] };
    const old = [
      { name: "visual-regression", when: { type: "fileEdited", patterns: ["src/content/costume/**", "src/popup/**", "design/DESIGN.md"] } },
      { name: "era-accuracy", when: costume },
      { name: "baseline-refresh", when: costume },
    ];
    const problems = overlapProblems(old, ["src/content/costume/tokens.ts", "src/popup/popup.ts"]);
    expect(problems.some((p) => p.includes("era-accuracy and baseline-refresh share"))).toBe(true);
    expect(problems).toContain("src/content/costume/tokens.ts sets off visual-regression and era-accuracy and baseline-refresh on fileEdited");
    expect(problems.some((p) => p.startsWith("src/popup/popup.ts"))).toBe(false);
  });

  test("overlapProblems lets the same file fire on different events", () => {
    const list = [
      { name: "a", when: { type: "fileEdited", patterns: ["src/**"] } },
      { name: "b", when: { type: "fileCreated", patterns: ["src/**"] } },
      { name: "c", when: { type: "userTriggered" } },
      { name: "d", when: { type: "agentStop" } },
    ];
    expect(overlapProblems(list, ["src/x.ts"])).toEqual([]);
  });
});

describe("commandProblems", () => {
  test("rejects a shell line and names the hook and the command", () => {
    const problems = commandProblems({ name: "manifest-lint", then: { type: "runCommand", command: "rm -rf dist" } }, scripts);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("manifest-lint");
    expect(problems[0]).toContain("rm -rf dist");
  });

  test("rejects a bun run of a script package.json does not have", () => {
    const problems = commandProblems({ name: "x", then: { type: "runCommand", command: "bun run nope" } }, scripts);
    expect(problems.join()).toContain("bun run nope");
  });

  test("rejects chained commands", () => {
    expect(commandProblems({ name: "x", then: { type: "runCommand", command: "bun run test && rm -rf dist" } }, scripts).length).toBe(1);
  });

  test("accepts an existing script and ignores askAgent hooks", () => {
    expect(commandProblems({ name: "x", then: { type: "runCommand", command: "bun run test" } }, scripts)).toEqual([]);
    expect(commandProblems({ name: "x", then: { type: "askAgent" } }, scripts)).toEqual([]);
  });
});

describe("patternProblems", () => {
  test("rejects absolute and parent paths", () => {
    expect(patternProblems("/etc/**").length).toBe(1);
    expect(patternProblems("../other/**").length).toBe(1);
  });

  test("rejects a folder that was renamed away", () => {
    expect(patternProblems("src/content/costumes/**")).toEqual(["pattern src/content/costumes/**: src/content/costumes/ does not exist"]);
  });
});

describe("the named hooks", () => {
  const table = [
    { name: "manifest-lint", event: "fileEdited", patterns: ["src/manifest.ts", "vite.config.ts"], then: { type: "runCommand", command: "bun run lint:manifest" } },
    {
      name: "visual-regression",
      event: "fileEdited",
      patterns: ["design/DESIGN.md", "src/content/costume/**", "src/popup/**"],
      then: { type: "runCommand", command: "bun run test:visual" },
    },
    { name: "era-accuracy", event: "agentStop", patterns: [], then: { type: "askAgent" } },
    { name: "rule-factory", event: "fileEdited", patterns: ["src/content/dark-patterns.ts", "src/data/neighborhoods.json"], then: { type: "askAgent" } },
    { name: "baseline-refresh", event: "userTriggered", patterns: [], then: { type: "askAgent" } },
  ];

  test("the table covers every hook file", () => {
    expect(table.map((r) => r.name).sort()).toEqual(hooks.map((h) => h.hook.name).sort());
  });

  test.each(table)("$name exists with its event, patterns and action", ({ name, event, patterns, then }) => {
    const hook = byName(name);
    expect(hook).toBeDefined();
    expect(hook!.when.type).toBe(event);
    expect([...(hook!.when.patterns ?? [])].sort()).toEqual(patterns);
    expect(hook!.then).toMatchObject(then);
  });

  describe("era-accuracy prompt", () => {
    const hook = byName("era-accuracy");
    const prompt: string = hook?.then?.prompt ?? "";

    test("cites the steering file and every rule", () => {
      for (const word of ["era-accuracy.md", "216", "Comic Sans MS", "Times New Roman", "pixel art", "1998", "trademark", "line"]) {
        expect({ word, found: prompt.includes(word) }).toEqual({ word, found: true });
      }
    });

    test("reviews what the agent just changed in the costume and the popup, and stops at once if nothing changed", () => {
      for (const word of ["git diff", "src/content/costume/", "src/popup/", "one line"]) {
        expect({ word, found: prompt.includes(word) }).toEqual({ word, found: true });
      }
    });

    test("is a read-only review", () => {
      expect(prompt).toContain("do not edit, create or delete any file");
      for (const bad of ["fix it", "apply", "rewrite", "update the file"]) {
        expect({ bad, found: prompt.toLowerCase().includes(bad) }).toEqual({ bad, found: false });
      }
      expect(hook?.then && "command" in hook.then).toBe(false);
    });
  });

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

  describe("baseline-refresh prompt", () => {
    const hook = byName("baseline-refresh");
    const prompt: string = hook?.then?.prompt ?? "";

    test("file exists and is valid JSON", () => {
      const path = join(hooksDir, "baseline-refresh.kiro.hook");
      expect(existsSync(path)).toBe(true);
      expect(() => JSON.parse(readFileSync(path, "utf8"))).not.toThrow();
    });

    test("regenerates the baselines with the docker script and summarises what changed", () => {
      expect(Object.hasOwn(scripts, "visual:baselines")).toBe(true);
      expect(scripts["visual:baselines"]).toContain("docker");
      for (const word of ["bun run visual:baselines", "Docker", "e2e-visual/__screenshots__", "git", "summar"]) {
        expect({ word, found: prompt.includes(word) }).toEqual({ word, found: true });
      }
    });

    test("is run by hand, since making baselines is a choice and not something a save should start", () => {
      expect(hook?.when?.type).toBe("userTriggered");
      expect(hook?.when?.patterns).toBeUndefined();
      expect(prompt).not.toContain("was just edited");
    });

    test("never writes baselines from the host's fonts or runs bun test", () => {
      for (const bad of ["test:visual:update", "bun test", "--update-snapshots"]) {
        expect({ bad, found: prompt.includes(bad) }).toEqual({ bad, found: false });
      }
      expect(hook?.then && "command" in hook.then).toBe(false);
    });
  });
});
