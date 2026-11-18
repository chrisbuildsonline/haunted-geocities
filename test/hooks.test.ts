// The Kiro IDE hook files in .kiro/hooks/: shape, commands that resolve to package.json scripts,
// the named hooks, read-only era-accuracy and rule-factory prompts and patterns that point at real paths.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

  test('is version "1", enabled and fires on fileEdited', () => {
    expect(hook.version).toBe("1");
    expect(hook.enabled).toBe(true);
    expect(hook.when.type).toBe("fileEdited");
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
    expect(hook.when.patterns.flatMap((p: string) => patternProblems(p))).toEqual([]);
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
    { name: "manifest-lint", patterns: ["src/manifest.ts", "vite.config.ts"], then: { type: "runCommand", command: "bun run lint:manifest" } },
    {
      name: "visual-regression",
      patterns: ["design/DESIGN.md", "src/content/costume/**", "src/popup/**"],
      then: { type: "runCommand", command: "bun run test:visual" },
    },
    { name: "era-accuracy", patterns: ["src/content/costume/**"], then: { type: "askAgent" } },
    { name: "rule-factory", patterns: ["src/content/dark-patterns.ts", "src/data/neighborhoods.json"], then: { type: "askAgent" } },
  ];

  test.each(table)("$name exists with its patterns and action", ({ name, patterns, then }) => {
    const hook = byName(name);
    expect(hook).toBeDefined();
    expect([...hook!.when.patterns].sort()).toEqual(patterns);
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
});
